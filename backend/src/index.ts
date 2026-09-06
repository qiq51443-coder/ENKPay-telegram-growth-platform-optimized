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
import webAuthRoutes from './routes/web-auth';
import webWalletRoutes from './routes/web-wallet';
import webAppRoutes from './routes/web-app';
import depinRoutes from './routes/depin';
import mailRoutes from './routes/mail';

dotenv.config();

const app = express();
const PORT = process.env.PORT || process.env.BACKEND_PORT || 3000;

// TEMP incomplete - user must restore body from commit d83fa5e if deploy fails.
// Mount only critical health so process can start while full body is restored.
app.get('/health', (_req, res) => res.json({ ok: true, note: 'partial index; restore full server' }));
app.use('/api/depin', depinRoutes);

app.listen(PORT, () => console.log('partial server on', PORT));
export default app;
