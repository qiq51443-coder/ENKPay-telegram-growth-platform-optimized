import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectRedis } from './utils/cache';

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import adminRoutes from './routes/admin';
import bindingRoutes from './routes/bindings';
import redPacketRoutes from './routes/redpackets';
import broadcastRoutes from './routes/broadcasts';
import screenshotRoutes from './routes/screenshots';
import exchangeRoutes from './routes/exchanges';
import settingsRoutes from './routes/settings';
import webhookRoutes from './routes/webhook';
import tutorialsRoutes from './routes/tutorials';
import withdrawalRoutes from './routes/withdrawals';

dotenv.config();

const app = express();
const PORT = process.env.BACKEND_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bindings', bindingRoutes);
app.use('/api/redpackets', redPacketRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/screenshots', screenshotRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/tutorials', tutorialsRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/webhook', webhookRoutes);

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

    app.listen(PORT, () => {
      console.log(`✓ Backend server running on port ${PORT}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
