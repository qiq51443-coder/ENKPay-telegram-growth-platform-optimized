import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface MiniAppAuthRequest extends Request {
  telegramUser?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
}

/**
 * Validate Telegram WebApp initData signature and extract user info.
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function authenticateMiniApp(
  req: MiniAppAuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const initData = req.headers['x-telegram-init-data'] as string;

    if (!initData) {
      res.status(401).json({ error: 'Missing Telegram init data' });
      return;
    }

    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      res.status(500).json({ error: 'Bot token not configured' });
      return;
    }

    // Parse the initData query string
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      res.status(401).json({ error: 'Missing hash in init data' });
      return;
    }

    // Build the data-check string: all fields except hash, sorted alphabetically
    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort((a: any, b: any) => (a[0] as string).localeCompare(b[0] as string))
      .map((entry: any) => `${entry[0]}=${entry[1]}`)
      .join('\n');

    // Compute HMAC-SHA256 using secret key = HMAC-SHA256("WebAppData", bot_token)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) {
      res.status(401).json({ error: 'Invalid init data signature' });
      return;
    }

    // Optionally check auth_date to prevent replay attacks (allow up to 1 hour)
    const authDate = params.get('auth_date');
    if (authDate) {
      const ageSeconds = Math.floor(Date.now() / 1000) - parseInt(authDate, 10);
      if (ageSeconds > 3600) {
        res.status(401).json({ error: 'Init data has expired' });
        return;
      }
    }

    // Extract user info
    const userParam = params.get('user');
    if (userParam) {
      try {
        req.telegramUser = JSON.parse(userParam);
      } catch {
        // user param may be malformed; continue without it
      }
    }

    next();
  } catch (error) {
    console.error('MiniApp auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}
