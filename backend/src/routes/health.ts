import express from 'express';
import rateLimit from 'express-rate-limit';
import { healthCheck } from '../db';
import { redis } from '../utils/cache';

const router = express.Router();

// Standalone memory-backed rate limiter for the health endpoint.
// Keeps the check available during startup (before Redis-based limiters are
// initialised) while still preventing DB/Redis connection exhaustion from
// external scanning or mis-configured uptime monitors.
const healthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // Allow generous headroom for legit uptime monitors
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many health check requests' },
});

/**
 * GET /health
 * Enhanced health check endpoint for Render health monitoring.
 * - Returns 200 + status "ok" when all systems are healthy.
 * - Returns 200 + status "degraded" when Redis is unavailable (non-fatal).
 * - Returns 503 + status "unhealthy" when the database is unreachable (triggers Render restart).
 */
router.get('/', healthLimiter, async (_req, res) => {
  const checks: { database: 'ok' | 'error'; redis: 'ok' | 'unavailable' } = {
    database: 'ok',
    redis: 'ok',
  };

  // Check database connectivity
  const dbOk = await healthCheck();
  if (!dbOk) {
    checks.database = 'error';
  }

  // Check Redis connectivity (non-fatal)
  try {
    if (redis.isOpen) {
      await redis.ping();
    } else {
      checks.redis = 'unavailable';
    }
  } catch {
    checks.redis = 'unavailable';
  }

  let status: 'ok' | 'degraded' | 'unhealthy';
  let httpStatus: number;

  if (checks.database === 'error') {
    status = 'unhealthy';
    httpStatus = 503;
  } else if (checks.redis === 'unavailable') {
    status = 'degraded';
    httpStatus = 200;
  } else {
    status = 'ok';
    httpStatus = 200;
  }

  res.status(httpStatus).json({
    status,
    timestamp: new Date().toISOString(),
    checks,
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
