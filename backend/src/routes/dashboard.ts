import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Apply rate limiting to all dashboard routes
router.use(adminLimiter);

/**
 * GET /admin/dashboard/overview
 * Get dashboard overview statistics
 */
router.get('/overview', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId } = req.query;

    let whereClause = '';
    const params: any[] = [];
    
    if (botId) {
      params.push(botId);
      whereClause = `WHERE bot_id = $${params.length}`;
    }

    // Get user statistics
    const userStats = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE platform_bound = true) as bound_users,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as new_today,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_this_week,
        COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '24 hours') as active_today,
        COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '7 days') as active_this_week
      FROM users ${whereClause}
    `, params);

    // Get transaction statistics
    const transactionStats = await query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_rewards,
        COUNT(*) as total_transactions,
        COALESCE(SUM(amount) FILTER (WHERE t.created_at > NOW() - INTERVAL '24 hours'), 0) as rewards_today,
        COALESCE(SUM(amount) FILTER (WHERE t.created_at > NOW() - INTERVAL '7 days'), 0) as rewards_this_week,
        COUNT(*) FILTER (WHERE t.created_at > NOW() - INTERVAL '24 hours') as transactions_today
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      ${whereClause.replace('bot_id', 'u.bot_id')}
    `, params);

    // Get binding statistics
    // Get red packet statistics
    const redPacketStats = await query(`
      SELECT 
        COUNT(*) as total_red_packets,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(claimed_amount), 0) as total_claimed_amount,
        COUNT(*) FILTER (WHERE status = 'active') as active_red_packets,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as created_today
      FROM red_packets
      ${whereClause}
    `, params);

    // Get withdrawal statistics
    const withdrawalStats = await query(`
      SELECT 
        COUNT(*) as total_withdrawals,
        COALESCE(SUM(amount), 0) as total_amount,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_withdrawals,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_withdrawals,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_withdrawals,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as withdrawals_today
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      ${whereClause.replace('bot_id', 'u.bot_id')}
    `, params);

    // Get bot statistics
    const botStats = await query(`
      SELECT 
        COUNT(*) as total_bots,
        COUNT(*) FILTER (WHERE is_active = true) as active_bots
      FROM bots
    `);

    res.json({
      users: userStats.rows[0],
      transactions: transactionStats.rows[0],
      redPackets: redPacketStats.rows[0],
      withdrawals: withdrawalStats.rows[0],
      bots: botStats.rows[0],
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get dashboard overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/dashboard/user-growth
 * Get user growth data over time
 */
router.get('/user-growth', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId, days = 30 } = req.query;
    const daysNum = parseInt(days as string, 10);

    // Validate days parameter
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      return res.status(400).json({ error: 'Days must be between 1 and 365' });
    }

    let whereClause = '';
    const params: any[] = [daysNum];
    
    if (botId) {
      params.push(botId);
      whereClause = `AND bot_id = $${params.length}`;
    }

    const result = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_users,
        COUNT(*) FILTER (WHERE platform_bound = true) as bound_users
      FROM users
      WHERE created_at > NOW() - INTERVAL '1 day' * $1
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, params);

    res.json({ growth: result.rows });
  } catch (error) {
    console.error('Get user growth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/dashboard/transaction-volume
 * Get transaction volume over time
 */
router.get('/transaction-volume', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId, days = 30 } = req.query;
    const daysNum = parseInt(days as string, 10);

    // Validate days parameter
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 365) {
      return res.status(400).json({ error: 'Days must be between 1 and 365' });
    }

    let whereClause = '';
    const params: any[] = [daysNum];
    
    if (botId) {
      params.push(botId);
      whereClause = `AND u.bot_id = $${params.length}`;
    }

    const result = await query(`
      SELECT 
        DATE(t.created_at) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(t.amount), 0) as total_amount,
        t.type as transaction_type
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.created_at > NOW() - INTERVAL '1 day' * $1
      ${whereClause}
      GROUP BY DATE(t.created_at), t.type
      ORDER BY date ASC, transaction_type
    `, params);

    res.json({ volume: result.rows });
  } catch (error) {
    console.error('Get transaction volume error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/dashboard/activity-summary
 * Get recent activity summary
 */
router.get('/activity-summary', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId, limit = 10 } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10), 50);

    let whereClause = '';
    const params: any[] = [limitNum];
    
    if (botId) {
      params.push(botId);
      whereClause = `WHERE u.bot_id = $${params.length}`;
    }

    // Get recent users
    const recentUsers = await query(`
      SELECT 
        u.id,
        u.telegram_id,
        u.username,
        u.first_name,
        u.last_name,
        u.created_at,
        u.platform_bound
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $1
    `, params);

    // Get recent transactions
    const recentTransactions = await query(`
      SELECT 
        t.id,
        t.type,
        t.amount,
        t.description,
        t.created_at,
        u.username as user_username,
        u.telegram_id as user_telegram_id
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $1
    `, params);

    // Get pending reviews
    const pendingWithdrawals = await query(`
      SELECT COUNT(*) as count
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      WHERE w.status = 'pending'
      ${botId ? `AND u.bot_id = $2` : ''}
    `, botId ? [botId] : []);

    res.json({
      recent_users: recentUsers.rows,
      recent_transactions: recentTransactions.rows,
      pending_reviews: {
        withdrawals: parseInt(pendingWithdrawals.rows[0]?.count || '0', 10),
      },
    });
  } catch (error) {
    console.error('Get activity summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/dashboard/top-users
 * Get top users by various metrics
 */
router.get('/top-users', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId, metric = 'balance', limit = 10 } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10), 50);

    let whereClause = '';
    const params: any[] = [];
    
    if (botId) {
      params.push(botId);
      whereClause = `WHERE bot_id = $${params.length}`;
    }

    params.push(limitNum);

    let orderByClause = 'u.balance DESC';
    let selectClause = 'u.balance as metric_value';

    if (metric === 'invites') {
      selectClause = 'COUNT(i.id) as metric_value';
      orderByClause = 'metric_value DESC';
    }

    const result = await query(`
      SELECT 
        u.id,
        u.telegram_id,
        u.username,
        u.first_name,
        u.last_name,
        ${selectClause}
      FROM users u
      ${metric === 'invites' ? 'LEFT JOIN invitations i ON u.id = i.inviter_id' : ''}
      ${whereClause}
      ${metric === 'invites' ? 'GROUP BY u.id, u.telegram_id, u.username, u.first_name, u.last_name' : ''}
      ORDER BY ${orderByClause}
      LIMIT $${params.length}
    `, params);

    res.json({ top_users: result.rows, metric });
  } catch (error) {
    console.error('Get top users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/dashboard/stats
 * Get 7 dashboard stat cards
 */
router.get('/stats', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    // Total users
    const userStats = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as new_today
      FROM users
    `);

    // Deposit total
    const depositStats = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_deposits
      FROM transactions WHERE type = 'deposit'
    `);

    // Withdrawal total
    const withdrawalStats = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_withdrawals
      FROM transactions WHERE type = 'withdrawal'
    `);

    // Total rewards
    const rewardStats = await query(`
      SELECT COALESCE(SUM(amount), 0) as total_rewards
      FROM transactions WHERE type IN ('reward', 'invite')
    `);

    // Red packet stats
    const redPacketStats = await query(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_red_packet_amount,
        COALESCE(SUM(claimed_amount), 0) as total_claimed_amount
      FROM red_packets
    `);

    res.json({
      total_users: parseInt(userStats.rows[0].total_users),
      new_today: parseInt(userStats.rows[0].new_today),
      total_deposits: parseFloat(depositStats.rows[0].total_deposits),
      total_withdrawals: parseFloat(withdrawalStats.rows[0].total_withdrawals),
      total_rewards: parseFloat(rewardStats.rows[0].total_rewards),
      total_red_packet_amount: parseFloat(redPacketStats.rows[0].total_red_packet_amount),
      total_claimed_amount: parseFloat(redPacketStats.rows[0].total_claimed_amount),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
