import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { connectRedis } from './utils/cache';
import { startDepositChecker } from './jobs/deposit-checker';
import { startSweepScheduler } from './jobs/sweep-scheduler';
import { checkBinanceConnectivity } from './services/price.service';
import { startAutoSettle } from './jobs/auto-settle';
import { startCleanupJob } from './jobs/cleanup';
import { startRedPacketExpiryJob } from './jobs/redpacket-expiry';
import { startSymbolLibrarySync } from './jobs/symbol-library-sync';
import { startPriceGenerator } from './services/price-generator.service';
import { generalLimiter, loginLimiter, webhookLimiter, adminLimiter, initLimiters } from './middleware/rateLimiter';
import { botManager } from './services/bot-manager.service';
import { runMigrations } from './db/migrate';
import { waitForDb } from './db';

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

// New NFT platform routes
import nftRoutes from './routes/nft';
import luckyAuctionRoutes from './routes/auctions';
import auctionAdminRoutes from './routes/auction-admin';
import tradingRoutes from './routes/trading';
import tradingAdminRoutes from './routes/trading-admin';
import charityRoutes from './routes/charity';
import walletRoutes from './routes/wallet';
import walletAdminRoutes from './routes/wallet-admin';
import depositWebhookRoutes from './routes/webhook-deposit';
import miniappRoutes from './routes/miniapp';
import miniappBotTokenRoutes from './routes/miniapp-bot-token';
import profileRoutes from './routes/profile';
import dbRepairRoutes from './routes/db-repair';

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Static file serving for uploads (legacy)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
app.use('/webhook', webhookRoutes);

// Deposit webhook routes (for blockchain notifications)
app.use('/webhook/deposit', depositWebhookRoutes);

// New NFT platform routes
app.use('/api/nft', nftRoutes);
app.use('/api/auctions', luckyAuctionRoutes);
app.use('/api/admin/auctions', auctionAdminRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/admin/trading', tradingAdminRoutes);
app.use('/api/charity', charityRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin/wallet', walletAdminRoutes);
app.use('/api/miniapp', miniappRoutes);
app.use('/api/miniapp/bot-token', miniappBotTokenRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin/db-repair', dbRepairRoutes);

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

    // Start deposit checker job
    startDepositChecker();

    // Start sweep scheduler (fund consolidation, runs every hour)
    startSweepScheduler();

    // Start auto-settle job
    startAutoSettle();

    // Start cleanup job
    startCleanupJob();

    // Start red packet expiry job
    startRedPacketExpiryJob();

    // Start symbol library sync job
    startSymbolLibrarySync();

    // Start price generator for custom trading pairs
    startPriceGenerator();

    app.listen(PORT, () => {
      console.log(`✓ Backend server running on port ${PORT}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
      console.log(`✓ Admin panel: http://localhost:${PORT}/admin`);
      console.log(`✓ Mini App: http://localhost:${PORT}/app`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
