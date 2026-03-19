/**
 * @deprecated
 * These endpoints (/generate and /exchange) are preserved for backward
 * compatibility with older clients.  The new authentication flow (B1) no
 * longer calls /generate from the Bot; instead, the Bot calls
 * POST /api/miniapp/preregister and the Mini App authenticates exclusively
 * via Telegram initData (POST /api/miniapp/auth-sync).
 */
import express from 'express';
import crypto from 'crypto';
import { query } from '../db';
import { getCache, setCache, deleteCache } from '../utils/cache';
import { buildCanonicalProfile, upsertUserFromTelegramId } from './miniapp-shared';
import { tempTokenKey, sessionTokenKey } from '../utils/cache-keys';

const router = express.Router();

const TEMP_TOKEN_TTL = 600;      // 10 minutes
const SESSION_TOKEN_TTL = 86400; // 24 hours
// Sentinel bot_id used when a session is recovered via telegram_id fallback
const BOT_ID_TOKEN_RECOVERY = 'token_recovery';

/**
 * POST /api/miniapp/bot-token/generate
 * Called by the Bot to mint a short-lived one-time token for a specific user.
 * Auth: X-Bot-Id header (must match an active bot in the database).
 */
router.post('/generate', async (req, res) => {
  try {
    const botId = req.headers['x-bot-id'] as string;
    if (!botId) {
      return res.status(403).json({ error: 'Missing X-Bot-Id header' });
    }

    // Verify bot exists and is active
    const botResult = await query(
      `SELECT id FROM bots WHERE id = $1 AND is_active = true LIMIT 1`,
      [botId]
    );
    if (botResult.rows.length === 0) {
      return res.status(403).json({ error: 'Bot not found or inactive' });
    }

    const { telegram_id, bot_id } = req.body as { telegram_id?: number; bot_id?: string };
    if (!telegram_id || typeof telegram_id !== 'number') {
      return res.status(400).json({ error: 'telegram_id (number) is required' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const payload = { telegramId: telegram_id, botId: bot_id || botId, createdAt: Date.now() };

    await setCache(tempTokenKey(token), payload, TEMP_TOKEN_TTL);

    return res.json({ token, expires_in: TEMP_TOKEN_TTL });
  } catch (err: any) {
    console.error('[bot-token/generate] error:', err?.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/miniapp/bot-token/exchange
 * Called by the Mini App to trade the one-time temp token for a session token + user profile.
 * No authentication required — the token itself is the credential.
 * If the token is expired/consumed but a telegram_id is provided and the user already
 * exists in the database, a fresh session is issued (recovery for cached WebApp URLs).
 */
router.post('/exchange', async (req, res) => {
  try {
    const { token, telegram_id: fallbackTelegramId } = req.body as { token?: string; telegram_id?: number };
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }

    const cacheKey = tempTokenKey(token);
    const payload = await getCache<{ telegramId: number; botId: string; createdAt: number }>(cacheKey);

    if (!payload) {
      // Token is invalid or expired.
      // Fallback: if a telegram_id is provided AND the user already exists in the DB,
      // issue a fresh session (the user was previously authenticated by the bot).
      if (fallbackTelegramId && typeof fallbackTelegramId === 'number') {
        const userCheck = await query(
          `SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`,
          [fallbackTelegramId]
        );
        if (userCheck.rows.length > 0) {
          console.info(`[bot-token/exchange] Token expired but user ${fallbackTelegramId} exists — issuing recovery session`);
          const userProfile = await buildCanonicalProfile(fallbackTelegramId);
          if (userProfile) {
            const sessionToken = crypto.randomBytes(32).toString('hex');
            await setCache(
              sessionTokenKey(sessionToken),
              { telegramId: fallbackTelegramId, botId: BOT_ID_TOKEN_RECOVERY },
              SESSION_TOKEN_TTL
            );
            return res.json({
              success: true,
              user: userProfile,
              bot_id: BOT_ID_TOKEN_RECOVERY,
              session_token: sessionToken,
              recovered: true,
            });
          }
        }
      }
      return res.status(401).json({ error: 'Token invalid or expired' });
    }

    // Single-use: delete immediately after retrieval
    await deleteCache(cacheKey);

    const { telegramId, botId } = payload;

    // Ensure the user record exists (upsert with minimal info if missing)
    await upsertUserFromTelegramId(telegramId);

    const userProfile = await buildCanonicalProfile(telegramId);
    if (!userProfile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Mint a session token valid for 24 hours
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await setCache(
      sessionTokenKey(sessionToken),
      { telegramId, botId },
      SESSION_TOKEN_TTL
    );

    return res.json({
      success: true,
      user: userProfile,
      bot_id: botId,
      session_token: sessionToken,
    });
  } catch (err: any) {
    console.error('[bot-token/exchange] error:', err?.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
