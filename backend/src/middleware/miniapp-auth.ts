import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { query } from '../db';
import { getCache } from '../utils/cache';

export interface MiniAppAuthRequest extends Request {
  telegramUser?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
}

// ─── Session-token validation ────────────────────────────────────────────────

function sessionTokenKey(token: string): string {
  return `session_token:${token}`;
}

/**
 * Attempt to authenticate the request using the X-Session-Token header.
 * Returns true if a valid session token was found and req.telegramUser was set.
 * Returns false if no session token was provided or the token is invalid/expired
 * (caller should fall through to initData validation instead of sending an error).
 */
async function trySessionToken(
  req: MiniAppAuthRequest,
  res: Response
): Promise<boolean> {
  const sessionToken = req.headers['x-session-token'] as string | undefined;
  if (!sessionToken) return false;

  try {
    const payload = await getCache<{ telegramId: number; botId: string }>(
      sessionTokenKey(sessionToken)
    );
    if (!payload?.telegramId) {
      // Token invalid or expired — fall through to initData validation
      console.info('[miniapp-auth] Session token invalid/expired, falling back to initData', {
        path: req.path,
      });
      return false;
    }
    req.telegramUser = { id: payload.telegramId };
    return true;
  } catch (err: any) {
    console.error('[miniapp-auth] session token lookup error:', err?.message);
    // On lookup error, fall through to initData validation rather than blocking the request
    return false;
  }
}

// ─── Bot-token cache (avoids hitting the DB on every request) ────────────────
interface TokenCacheEntry {
  tokens: string[];
  fetchedAt: number;
}
let tokenCache: TokenCacheEntry | null = null;
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getActiveBotTokens(): Promise<string[]> {
  const now = Date.now();
  if (tokenCache && now - tokenCache.fetchedAt < TOKEN_CACHE_TTL_MS) {
    return tokenCache.tokens;
  }
  try {
    const result = await query('SELECT token FROM bots WHERE is_active = true');
    const tokens = result.rows.map((r: any) => r.token as string).filter(Boolean);
    tokenCache = { tokens, fetchedAt: now };
    return tokens;
  } catch (err: any) {
    // If DB is unavailable fall back to cached tokens or env var only
    console.error('[miniapp-auth] Failed to load bot tokens from DB:', err?.message, err);
    return tokenCache?.tokens ?? [];
  }
}

/** Compute the Telegram initData HMAC for a given bot token */
function computeHash(dataCheckString: string, botToken: string): string {
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  return crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
}

/**
 * Validate Telegram WebApp initData signature and extract user info.
 * Supports multiple bots: tries process.env.BOT_TOKEN first, then all active
 * bot tokens loaded from the database (cached for 5 minutes).
 *
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function authenticateMiniApp(
  req: MiniAppAuthRequest,
  res: Response,
  next: NextFunction
): void {
  (async () => {
    try {
      // ── Priority 1: session token (issued by /bot-token/exchange) ───────────
      const sessionAuthenticated = await trySessionToken(req, res);
      if (sessionAuthenticated) {
        // Session token was valid — proceed without initData validation
        if (!res.headersSent) next();
        return;
      }
      // If session token was present but invalid/expired, fall through to initData

      // ── Priority 2: Telegram WebApp initData (original flow) ────────────────
      const initData = req.headers['x-telegram-init-data'] as string;

      if (!initData) {
        console.warn('[miniapp-auth] REJECTED: Missing X-Telegram-Init-Data header', {
          path: req.path,
          ip: req.ip,
        });
        res.status(401).json({
          error: 'Missing Telegram init data',
          hint: 'This endpoint must be called from within a Telegram Mini App.',
        });
        return;
      }

      // Parse the initData query string
      const params = new URLSearchParams(initData);
      const hash = params.get('hash');
      if (!hash) {
        console.warn('[miniapp-auth] REJECTED: hash field missing from init data', { path: req.path });
        res.status(401).json({
          error: 'Missing hash in init data',
          hint: 'The Telegram WebApp initData does not contain a hash field.',
        });
        return;
      }

      // Build the data-check string: all fields except hash, sorted alphabetically
      params.delete('hash');
      const dataCheckString = Array.from(params.entries())
        .sort((a: any, b: any) => (a[0] as string).localeCompare(b[0] as string))
        .map((entry: any) => `${entry[0]}=${entry[1]}`)
        .join('\n');

      // Build candidate token list: env var first, then DB tokens.
      // Track whether tokens will actually be served from the in-memory cache
      // (as opposed to freshly loaded from DB) so we can bust it and retry
      // when verification fails — this handles newly-added bots within the TTL window.
      const usingCachedTokens = tokenCache !== null && (Date.now() - tokenCache.fetchedAt < TOKEN_CACHE_TTL_MS);
      const candidateSet = new Set<string>();
      if (process.env.BOT_TOKEN) candidateSet.add(process.env.BOT_TOKEN);
      const dbTokens = await getActiveBotTokens();
      for (const t of dbTokens) candidateSet.add(t);
      const candidateTokens = Array.from(candidateSet);

      if (candidateTokens.length === 0) {
        console.error(
          '[miniapp-auth] MISCONFIGURATION: No bot tokens available. ' +
          'Set BOT_TOKEN env var or ensure active bots exist in the database.'
        );
        res.status(500).json({
          error: 'No bot token configured',
          hint: 'Server misconfiguration: set BOT_TOKEN environment variable or add an active bot in the database.',
        });
        return;
      }

      // Try each token until one matches
      let valid = candidateTokens.some(token => computeHash(dataCheckString, token) === hash);
      let finalCandidates = candidateTokens;

      // Cache-bust-on-failure: if the cached token list was used and verification
      // failed, clear the cache and retry once with freshly-loaded DB tokens.
      // This handles the case where an admin just added a new bot and the cached
      // list is stale (no need to wait up to 5 minutes for the cache to expire).
      if (!valid && usingCachedTokens) {
        console.info('[miniapp-auth] HMAC mismatch with cached tokens; busting cache and retrying with fresh DB tokens', {
          path: req.path,
        });
        tokenCache = null;
        const freshDbTokens = await getActiveBotTokens();
        const freshSet = new Set<string>();
        if (process.env.BOT_TOKEN) freshSet.add(process.env.BOT_TOKEN);
        for (const t of freshDbTokens) freshSet.add(t);
        const freshCandidates = Array.from(freshSet);
        valid = freshCandidates.some(token => computeHash(dataCheckString, token) === hash);
        finalCandidates = freshCandidates;
      }

      if (!valid) {
        const authDateStr = params.get('auth_date');
        const ageSeconds = authDateStr
          ? Math.floor(Date.now() / 1000) - parseInt(authDateStr, 10)
          : null;
        console.warn('[miniapp-auth] REJECTED: HMAC hash mismatch', {
          path: req.path,
          candidateCount: finalCandidates.length,
          dataCheckStringPreview: dataCheckString.substring(0, 80),
          hashPrefix: hash.substring(0, 8),
          authDateAgeSeconds: ageSeconds,
          tokenPrefixes: finalCandidates.map(t => `${t.substring(0, 6)}...`),
        });
        res.status(401).json({
          error: 'Invalid init data signature',
          hint: 'Ensure the Mini App is opened via the correct Telegram bot and BOT_TOKEN matches.',
        });
        return;
      }

      // Check auth_date to prevent replay attacks (allow up to 24 hours)
      const authDate = params.get('auth_date');
      if (authDate) {
        const ageSeconds = Math.floor(Date.now() / 1000) - parseInt(authDate, 10);
        if (ageSeconds > 86400) {
          console.warn('[miniapp-auth] REJECTED: Init data expired', {
            path: req.path,
            ageSeconds,
          });
          res.status(401).json({
            error: 'Init data has expired',
            hint: 'Please restart the Telegram Mini App to refresh your session.',
          });
          return;
        }
      } else {
        // auth_date missing is unusual but non-fatal; log for diagnostics
        console.warn('[miniapp-auth] WARNING: auth_date field missing from init data', { path: req.path });
      }

      // Extract user info
      const userParam = params.get('user');
      if (userParam) {
        try {
          req.telegramUser = JSON.parse(userParam);
        } catch (parseErr: any) {
          // Malformed user param – log and continue without user info
          console.warn('[miniapp-auth] WARNING: Failed to parse user param from init data', {
            path: req.path,
            error: parseErr?.message,
          });
        }
      }

      if (!req.telegramUser?.id) {
        console.warn('[miniapp-auth] WARNING: No Telegram user ID extracted from init data', {
          path: req.path,
          hasUserParam: Boolean(userParam),
        });
      }

      next();
    } catch (error) {
      console.error('[miniapp-auth] Unexpected error during authentication:', error);
      res.status(401).json({ error: 'Authentication failed' });
    }
  })();
}
