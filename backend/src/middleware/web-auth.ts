import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface WebAuthRequest extends Request {
  webUser?: {
    id: string;
    email: string;
    type: 'web_user';
  };
}

export function getWebJwtSecret() {
  const secret = process.env.WEB_JWT_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('WEB_JWT_SECRET or JWT_SECRET environment variable is required');
  }
  return secret;
}

export function signWebUserToken(user: { id: string; email: string }) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: 'web_user',
    },
    getWebJwtSecret(),
    { expiresIn: '7d' }
  );
}

export function authenticateWebUser(req: WebAuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decoded = jwt.verify(authHeader.slice(7), getWebJwtSecret()) as any;
    if (decoded?.type !== 'web_user' || !decoded?.sub || !decoded?.email) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.webUser = {
      id: decoded.sub,
      email: decoded.email,
      type: 'web_user',
    };

    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
