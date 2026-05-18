import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import * as http from 'http';
import { connectRedis } from './utils/cache';
import { startDepositChecker } from './jobs/deposit-checker';
import { startSweepScheduler } from './jobs/sweep-scheduler';
import { checkBinanceConnectivity } from './services/price.service';
import { startPriceWs } from './services/price-ws.service';
import { attachPriceBroadcast, stopPriceBroadcast } from './services/price-broadcast.service';
import { startAutoSettle } from './jobs/auto-settle';
import { startPeriodSnapshot } from './jobs/period-snapshot';
import { startCleanupJob } from './jobs/cleanup';
import { startRedPacketExpiryJob } from './jobs/redpacket-expiry';
import { startSymbolLibrarySync } from './jobs/symbol-library-sync';
import { startMiniAppBgRotationJob } from './jobs/miniapp-bg-rotation';
import { startPriceGenerator } from './services/price-generator.service';
import { startNFTDailySettle } from './jobs/nft-daily-settle';
import { startRealPriceSnapshot } from './jobs/real-price-snapshot';
import { startRealPriceSync, stopRealPriceSync } from './services/real-price-sync.service';
import { startCharityProgressJob } from './jobs/charity-progress.job';
import { startStrategyBotScheduler } from './jobs/strategy-bot-scheduler';
import { generalLimiter, loginLimiter, webhookLimiter, adminLimiter, initLimiters } from './middleware/rateLimiter';
import { botManager } from './services/bot-manager.service';
import { runMigrations } from './db/migrate';
import { waitForDb, query as dbQuery } from './db';

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import adminRoutes from './routes/admin';
import adminUsersRoutes from './routes/admin-users';
import redPacketRoutes from './routes/redpackets';
import broadcastRoutes from './routes/broadcasts';
import settingsRoutes from './routes/settings';
import webhookRoutes from './routes/webhook';
import withdrawalRoutes from './routes/withdrawals';
import auditLogsRoutes from './routes/audit-logs';
import systemSettingsRoutes from './routes/system-settings';
import dashboardRoutes from './routes/dashboard';
import ordersRoutes from './routes/orders';
import botAuthRoutes from './routes/bot-auth';
import announcementsRoutes from './routes/announcements';
import strategyBotRoutes from './routes/strategy-bot';
import strategyConfigRoutes from './routes/strategy-config';

// New NFT platform routes
import nftRoutes from './routes/nft';
import luckyAuctionRoutes from './routes/auctions';
import auctionAdminRoutes from './routes/auction-admin';
import tradingRoutes from './routes/trading';
import tradingAdminRoutes from './routes/trading-admin';
import charityRoutes from './routes/charity';
import walletRoutes from './routes/wallet';
import walletAdminRoutes from './routes/wallet-admin';
import qrcodeRoutes from './routes/qrcode';
import depositWebhookRoutes from './routes/webhook-deposit';
import miniappRoutes from './routes/miniapp';
import miniappBotTokenRoutes from './routes/miniapp-bot-token';
import profileRoutes from './routes/profile';
import dbRepairRoutes from './routes/db-repair';
import healthRoutes from './routes/health';
import landingRoutes from './routes/landing';
import landingPublicRoutes from './routes/landing-public';
import { ensureUploadDirs, UPLOAD_ROOT } from './services/storage.service';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3000;

// Trust the first proxy hop (Render, Heroku, etc.) so that express-rate-limit
// can correctly read the client IP from the X-Forwarded-For header.
app.set('trust proxy', 1);

// Middleware
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : (process.env.NODE_ENV === 'production' ? true : ['http://localhost:3001', 'http://localhost:5173']);
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => {
    // Preserve the raw request body for webhook signature verification
    // (e.g. Moralis Streams uses sha3(rawBody + secret))
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.use('/health', healthRoutes);

// Static file serving for uploads (Persistent Disk)
// 生产环境路径：/opt/render/project/src/uploads
// 本地开发路径：{项目根}/uploads
app.use('/uploads', express.static(UPLOAD_ROOT, {
  maxAge: '7d', // 图片7天缓存
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800');
  },
}));

// Helper: set cache-control headers based on file type
function staticCacheHeaders(res: express.Response, filePath: string) {
  if (filePath.endsWith('.html')) {
    // HTML entry points must never be cached — they reference hashed assets
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (/\.[a-f0-9]{8,}\.(js|css)$/.test(filePath)) {
    // Vite content-hashed JS/CSS — immutable, long cache
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    // Other static assets (images, fonts, etc.) — short cache
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}

async function ensureStrategyTables() {
  // Inline SQL — do NOT read from file. SQL files are NOT copied to dist/ by tsc.
  const statements = [
    `CREATE TABLE IF NOT EXISTS strategy_bots (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bot_token   TEXT NOT NULL UNIQUE,
      bot_name    TEXT,
      username    TEXT,
      is_active   BOOLEAN DEFAULT true,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS strategy_bot_groups (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      strategy_bot_id UUID REFERENCES strategy_bots(id) ON DELETE CASCADE,
      chat_id         TEXT NOT NULL,
      chat_title      TEXT,
      language        TEXT,
      is_active       BOOLEAN DEFAULT true,
      joined_at       TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(strategy_bot_id, chat_id)
    )`,
    `CREATE TABLE IF NOT EXISTS strategy_configs (
      id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      strategy_bot_id             UUID REFERENCES strategy_bots(id) ON DELETE CASCADE,
      name                        TEXT NOT NULL,
      is_active                   BOOLEAN DEFAULT true,
      auto_send_daily             BOOLEAN DEFAULT false,
      coin_rotation               JSONB NOT NULL DEFAULT '[]',
      send_times                  JSONB NOT NULL DEFAULT '[]',
      custom_text                 TEXT,
      custom_text_translations    JSONB,
      media_url                   TEXT,
      media_telegram_file_id      TEXT,
      target_group_ids            JSONB NOT NULL DEFAULT '[]',
      current_coin_index          INT DEFAULT 0,
      daily_send_limit            INT NOT NULL DEFAULT 0,
      created_at                  TIMESTAMPTZ DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE strategy_configs ADD COLUMN IF NOT EXISTS daily_send_limit INT NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS idx_strategy_configs_bot_id ON strategy_configs(strategy_bot_id)`,
    `CREATE INDEX IF NOT EXISTS idx_strategy_configs_active_auto ON strategy_configs(is_active, auto_send_daily)`,
    `CREATE INDEX IF NOT EXISTS idx_strategy_bot_groups_bot_id ON strategy_bot_groups(strategy_bot_id)`,
  ];

  let successCount = 0;
  for (const statement of statements) {
    try {
      await dbQuery(statement);
      successCount++;
    } catch (err: any) {
      if (!String(err?.message || '').includes('already exists')) {
        console.error('[startup] Strategy table error:', err?.message || err);
      }
    }
  }
  console.log(`✓ [startup] Strategy tables ensured (${successCount}/${statements.length} statements OK)`);
}

// Static file serving for admin-panel SPA
const adminDistPath = path.join(__dirname, 'public/admin');
app.use('/admin', express.static(adminDistPath, {
  setHeaders: (res, filePath) => staticCacheHeaders(res, filePath),
}));
app.get('/admin/*', generalLimiter, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(adminDistPath, 'index.html'));
});

// Static file serving for mini-app SPA
const appDistPath = path.join(__dirname, 'public/app');
app.use('/app', express.static(appDistPath, {
  setHeaders: (res, filePath) => staticCacheHeaders(res, filePath),
}));
app.get('/app/*', generalLimiter, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(appDistPath, 'index.html'));
});

// Rate limiting — applied before route handlers.
// More-specific paths (e.g. /api/auth/login) are intentionally listed after
// the broad /api limiter so that sensitive endpoints are subject to both the
// general cap and their own stricter cap (defense-in-depth).
app.use('/webhook', webhookLimiter);
app.use('/api', generalLimiter);
app.use('/api/admin', adminLimiter);
app.use('/api/auth/login', loginLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/users', userRoutes);  // alias for admin panel
app.use('/api/admin', adminRoutes);
app.use('/api/admin/admin-users', adminUsersRoutes);
app.use('/api/redpackets', redPacketRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/admin/audit-logs', auditLogsRoutes);
app.use('/api/admin/system-settings', systemSettingsRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/bot-auth', botAuthRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/strategy-bots', strategyBotRoutes);
app.use('/api/strategy-configs', strategyConfigRoutes);
app.use('/webhook/deposit', depositWebhookRoutes);
app.use('/webhook', webhookRoutes);

// New NFT platform routes
app.use('/api/nft', nftRoutes);
app.use('/api/auctions', luckyAuctionRoutes);
app.use('/api/admin/auctions', auctionAdminRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/admin/trading', tradingAdminRoutes);
app.use('/api/charity', charityRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin/wallet', walletAdminRoutes);
app.use('/api/admin/qrcode', qrcodeRoutes);
app.use('/api/qrcode', qrcodeRoutes);
app.use('/api/miniapp/bot-token', miniappBotTokenRoutes);
app.use('/api/miniapp', miniappRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin/db-repair', dbRepairRoutes);

// Landing — public API (no auth required)
app.use('/api/landing', landingPublicRoutes);
// Landing — admin API (requires admin auth)
app.use('/api/admin/landing', landingRoutes);

// Landing static files — must be registered after all /api routes and before the error handler
const landingDistPath = path.join(__dirname, 'public');
app.use('/', express.static(landingDistPath, {
  index: 'index.html',
  setHeaders: (res, filePath) => staticCacheHeaders(res, filePath),
}));
// Catch-all: serve index.html for non-API/admin/app paths
app.get('*', generalLimiter, (req, res, next) => {
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/admin') ||
    req.path.startsWith('/app') ||
    req.path.startsWith('/uploads') ||
    req.path.startsWith('/health') ||
    req.path.startsWith('/webhook')
  ) {
    return next();
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(landingDistPath, 'index.html'));
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
const startServer = async () => {
  try {
    // 确保图片上传目录存在（Persistent Disk 挂载后首次运行时创建子目录）
    ensureUploadDirs();

    // 1. Wait for DB to become reachable (handles Render cold starts)
    await waitForDb();

    // 2. Connect to Redis (optional, non-fatal)
    let redisAvailable = false;
    try {
      await connectRedis();
      console.log('✓ Redis connected');
      redisAvailable = true;
    } catch (err) {
      console.warn('⚠ Redis connection failed, continuing without cache:', err);
    }

    // 3. Run database migrations (auto-create all tables)
    await runMigrations();

    // 3.1 Ensure strategy-related tables exist even if migration tracking was inconsistent
    await ensureStrategyTables();

    // Initialise rate limiters (requires Redis; skipped gracefully if Redis is unavailable)
    if (redisAvailable) {
      initLimiters();
    } else {
      console.warn('⚠ Rate limiters not initialized (Redis unavailable)');
    }

    // Load all active bots into the bot manager
    await botManager.loadAllBots();

    // Auto-register webhooks for bots that don't have one configured yet
    await botManager.registerWebhooksIfNeeded();

    // Check Binance API connectivity
    await checkBinanceConnectivity();

    // Start OKX WebSocket price service (real-time tickers, no API key needed)
    try {
      const { query } = await import('./db');
      const pairsResult = await query(
        `SELECT DISTINCT binance_symbol FROM trading_pairs
         WHERE pair_type = 'real' AND binance_symbol IS NOT NULL AND is_active = true`,
        []
      );
      const symbols: string[] = pairsResult.rows.map((r: any) => r.binance_symbol as string);
      if (symbols.length > 0) {
        startPriceWs(symbols);
        console.log(`✓ OKX WebSocket price service started (${symbols.length} pairs)`);
      } else {
        console.warn('⚠ No active real trading pairs found, OKX WebSocket not started');
      }
    } catch (wsErr: any) {
      console.warn(`⚠ Failed to start OKX WebSocket price service: ${wsErr.message}`);
    }

    // Start deposit checker job
    startDepositChecker();

    // Start sweep scheduler (fund consolidation, runs every hour)
    startSweepScheduler();

    // Start real price snapshot job FIRST (writes price_points for real pairs every 3s)
    startRealPriceSnapshot();

    // Start period snapshot job (pending → active, every 5 seconds)
    startPeriodSnapshot();

    // Start auto-settle job AFTER (active → settled, every 10 seconds)
    startAutoSettle();

    console.log('✓ Trading lifecycle jobs registered: real-price-snapshot(3s) → period-snapshot(5s) → auto-settle(10s)');

    // Start cleanup job
    startCleanupJob();

    // Start red packet expiry job
    startRedPacketExpiryJob();

    // Start symbol library sync job
    startSymbolLibrarySync();

    // Start mini app background rotation job
    startMiniAppBgRotationJob();

    // Start price generator for custom trading pairs
    startPriceGenerator();

    // Start NFT daily settlement job (10:00 UTC+8 / 02:00 UTC every day)
    startNFTDailySettle();

    // Start real price sync job (syncs 24h change for real pairs every 60s)
    startRealPriceSync();

    // Start charity progress auto-increment job
    startCharityProgressJob();

    // Start strategy bot scheduler (checks every minute for scheduled sends)
    startStrategyBotScheduler();

    const server = http.createServer(app);

    // Attach WebSocket price broadcast service
    attachPriceBroadcast(server);

    server.listen(PORT, () => {
      console.log(`✓ Backend server running on port ${PORT}`);
      console.log(`✓ Price broadcast WebSocket: ws://localhost:${PORT}/ws/prices`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
      console.log(`✓ Admin panel: http://localhost:${PORT}/admin`);
      console.log(`✓ Mini App: http://localhost:${PORT}/app`);
    });

    // Graceful shutdown
    const gracefulShutdown = () => {
      stopPriceBroadcast();
      stopRealPriceSync();
      server.close();
      process.exit(0);
    };
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
