import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { connectRedis } from './utils/cache';
import { startDepositChecker } from './jobs/deposit-checker';

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

// New NFT platform routes
import nftRoutes from './routes/nft';
import auctionRoutes from './routes/auction';
import tradingRoutes from './routes/trading';
import tradingAdminRoutes from './routes/trading-admin';
import charityRoutes from './routes/charity';
import walletRoutes from './routes/wallet';
import walletAdminRoutes from './routes/wallet-admin';

dotenv.config();

const app = express();
const PORT = process.env.BACKEND_PORT || 3000;

// Middleware
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [];
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Static file serving for NFT uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/admin-users', adminUsersRoutes);
app.use('/api/redpackets', redPacketRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/admin/audit-logs', auditLogsRoutes);
app.use('/api/admin/system-settings', systemSettingsRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);
app.use('/webhook', webhookRoutes);

// New NFT platform routes
app.use('/api/nft', nftRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/admin/trading', tradingAdminRoutes);
app.use('/api/charity', charityRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin/wallet', walletAdminRoutes);

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
    // Connect to Redis
    await connectRedis();
    console.log('✓ Redis connected');

    // Start deposit checker job
    startDepositChecker();

    app.listen(PORT, () => {
      console.log(`✓ Backend server running on port ${PORT}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
      console.log(`✓ Static files: http://localhost:${PORT}/uploads`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
