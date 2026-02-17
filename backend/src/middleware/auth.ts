import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
  botId?: string;
  bot?: {
    id: string;
    name: string;
    username: string;
    token: string;
    is_active: boolean;
  };
}

export const authenticateAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, jwtSecret) as any;

    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Middleware to require specific roles
 * Usage: requireRoles(['super_admin', 'admin'])
 */
export const requireRoles = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Required roles: ${roles.join(', ')}` 
      });
    }
    next();
  };
};

export const authenticateBot = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const botToken = req.headers['x-bot-token'] as string;

    if (!botToken) {
      return res.status(401).json({ error: 'Bot token required in X-Bot-Token header' });
    }

    // Determine if botToken is a UUID (Bot ID) or a token
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(botToken);
    
    let result;
    if (isUUID) {
      // Authenticate by Bot ID
      result = await query(
        `SELECT id, name, username, token, is_active 
         FROM bots 
         WHERE id::text = $1 AND is_active = true`,
        [botToken]
      );
    } else {
      // Authenticate by Token
      result = await query(
        `SELECT id, name, username, token, is_active 
         FROM bots 
         WHERE token = $1 AND is_active = true`,
        [botToken]
      );
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or inactive bot token' });
    }

    const bot = result.rows[0];

    // Set bot information in request
    req.botId = bot.id;
    req.bot = bot;

    next();
  } catch (error) {
    console.error('Bot authentication error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

export const validateWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Webhook URL format: /webhook/:botId/:secret or /webhook/:botToken
    const { botId, botToken, secret } = req.params;
    
    let bot;
    
    if (botId && secret) {
      // New format: using Bot ID + Secret
      const result = await query(
        'SELECT id, webhook_secret, is_active FROM bots WHERE id = $1',
        [botId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Bot not found' });
      }

      bot = result.rows[0];

      if (!bot.is_active) {
        return res.status(403).json({ error: 'Bot is not active' });
      }

      // Verify webhook secret (if database has this field)
      if (bot.webhook_secret && bot.webhook_secret !== secret) {
        return res.status(403).json({ error: 'Invalid webhook secret' });
      }

      (req as any).botId = bot.id;
    } else if (botToken) {
      // Old format: using Bot Token (backward compatibility)
      const result = await query(
        'SELECT id, is_active FROM bots WHERE token = $1',
        [botToken]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Bot not found' });
      }

      bot = result.rows[0];

      if (!bot.is_active) {
        return res.status(403).json({ error: 'Bot is not active' });
      }

      (req as any).botId = bot.id;
    } else {
      return res.status(400).json({ error: 'Invalid webhook URL format' });
    }

    // Also validate Telegram secret token if present
    const secretToken = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = process.env.BOT_WEBHOOK_SECRET;

    if (expectedSecret && secretToken !== expectedSecret) {
      return res.status(403).json({ error: 'Invalid Telegram webhook secret' });
    }

    next();
  } catch (error) {
    console.error('Webhook validation error:', error);
    return res.status(500).json({ error: 'Validation failed' });
  }
};
