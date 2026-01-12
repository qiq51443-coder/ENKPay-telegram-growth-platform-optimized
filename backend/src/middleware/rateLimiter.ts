import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../utils/cache';

// General API rate limiter
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,             // Max 100 requests per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).sendCommand(args),
  }),
});

// Login rate limiter (stricter)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // Max 5 attempts
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).sendCommand(args),
  }),
});

// Webhook rate limiter (high throughput)
export const webhookLimiter = rateLimit({
  windowMs: 1000,  // 1 second
  max: 50,         // Max 50 requests per second
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).sendCommand(args),
  }),
});

// Admin API rate limiter
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 60,              // Max 60 requests per minute
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).sendCommand(args),
  }),
});

// Export all limiters
export default {
  generalLimiter,
  loginLimiter,
  webhookLimiter,
  adminLimiter,
};
