import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
  };
  botId?: string;
}

export const authenticateAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;

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

export const authenticateBot = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const botToken = req.headers['x-bot-token'];
    if (!botToken) {
      return res.status(401).json({ error: 'Bot token required' });
    }

    // Verify bot token and set botId
    // In production, verify this against database
    req.botId = botToken as string;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid bot token' });
  }
};

export const validateWebhook = (req: Request, res: Response, next: NextFunction) => {
  const secretToken = req.headers['x-telegram-bot-api-secret-token'];
  const expectedSecret = process.env.BOT_WEBHOOK_SECRET;

  if (expectedSecret && secretToken !== expectedSecret) {
    return res.status(403).json({ error: 'Invalid webhook secret' });
  }

  next();
};
