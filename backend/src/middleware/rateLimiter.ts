import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Request, Response, NextFunction } from 'express';
import { redis } from '../utils/cache';

// Internal limiter instances — undefined until initLimiters() is called
let _generalLimiter: RateLimitRequestHandler | undefined;
let _loginLimiter: RateLimitRequestHandler | undefined;
let _webhookLimiter: RateLimitRequestHandler | undefined;
let _adminLimiter: RateLimitRequestHandler | undefined;
let _walletLimiter: RateLimitRequestHandler | undefined;
let _webWalletLimiter: RateLimitRequestHandler | undefined;
let _webAppLimiter: RateLimitRequestHandler | undefined;
let _initialized = false;

// Creates a RedisStore using the already-connected redis client.
// Must only be called after connectRedis() has resolved.
function makeRedisStore() {
  return new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).sendCommand(args),
  });
}

// Initializes all rate limiters.  Call this once in startServer() after
// connectRedis() returns, before the HTTP server starts accepting requests.
// Subsequent calls are no-ops to prevent accidental re-initialization.
export function initLimiters() {
  if (_initialized) return;
  _initialized = true;
  _generalLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 100,             // Max 100 requests per minute
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore(),
  });

  _loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                    // Max 5 attempts
    message: { error: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore(),
  });

  _webhookLimiter = rateLimit({
    windowMs: 1000,  // 1 second
    max: 50,         // Max 50 requests per second
    message: 'Too many requests',
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore(),
  });

  _adminLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 60,              // Max 60 requests per minute
    message: { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore(),
  });

  _walletLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 10,              // Max 10 financial operations per minute (bot wallet — kept strict)
    message: { error: 'Too many wallet requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore(),
  });

  // Web wallet limiter — more lenient for web users (page loads trigger multiple requests)
  _webWalletLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 60,              // Max 60 web wallet requests per minute per IP
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore(),
  });

  // Web app limiter — for trading/auction/products/charity endpoints
  _webAppLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute
    max: 60,              // Max 60 web app requests per minute per IP
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRedisStore(),
  });
}

// Proxy middleware exports — safe to import and register at module-load time.
// Each proxy delegates to the corresponding internal limiter once it has been
// initialized.  Before initLimiters() is called the proxy simply calls next().
// Node.js is single-threaded, so there is no race between initLimiters() and
// an incoming request: the server only starts accepting connections after
// initLimiters() completes inside startServer().

// General API rate limiter
export const generalLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (_generalLimiter) return _generalLimiter(req, res, next);
  return next();
};

// Login rate limiter (stricter)
export const loginLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (_loginLimiter) return _loginLimiter(req, res, next);
  return next();
};

// Webhook rate limiter (high throughput)
export const webhookLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (_webhookLimiter) return _webhookLimiter(req, res, next);
  return next();
};

// Admin API rate limiter
export const adminLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (_adminLimiter) return _adminLimiter(req, res, next);
  return next();
};

// Wallet financial operations rate limiter (stricter for transfers, withdrawals, deposits)
export const walletLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (_walletLimiter) return _walletLimiter(req, res, next);
  return next();
};

// Web wallet limiter — lenient for web users loading deposit/withdraw pages
export const webWalletLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (_webWalletLimiter) return _webWalletLimiter(req, res, next);
  return next();
};

// Web app limiter — for trading/auction/products/charity web API endpoints
export const webAppLimiter = (req: Request, res: Response, next: NextFunction) => {
  if (_webAppLimiter) return _webAppLimiter(req, res, next);
  return next();
};

// Export all limiters
export default {
  generalLimiter,
  loginLimiter,
  webhookLimiter,
  adminLimiter,
  walletLimiter,
  webWalletLimiter,
  webAppLimiter,
};
