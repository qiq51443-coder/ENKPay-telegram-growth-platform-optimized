import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import TelegramAPI from '../utils/telegram';

const router = express.Router();

// Get all bots
router.get('/bots', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, name, username, is_active, webhook_url, created_at, updated_at 
       FROM bots 
       ORDER BY created_at DESC`
    );

    res.json({ bots: result.rows });
  } catch (error) {
    console.error('Get bots error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create bot
router.post('/bots', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, token } = req.body;

    if (!name || !token) {
      return res.status(400).json({ error: 'Name and token required' });
    }

    // Verify token with Telegram
    const telegram = new TelegramAPI(token);
    try {
      const info = await telegram.getWebhookInfo();
      
      const result = await query(
        `INSERT INTO bots (name, token, is_active)
         VALUES ($1, $2, true)
         RETURNING id, name, username, is_active, created_at`,
        [name, token]
      );

      // Initialize bot settings
      await query(
        `INSERT INTO bot_settings (bot_id)
         VALUES ($1)`,
        [result.rows[0].id]
      );

      res.json({ bot: result.rows[0] });
    } catch (error) {
      return res.status(400).json({ error: 'Invalid bot token' });
    }
  } catch (error) {
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bot
router.put('/bots/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, is_active, webhook_url } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      params.push(name);
      updates.push(`name = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active);
      updates.push(`is_active = $${params.length}`);
    }
    if (webhook_url !== undefined) {
      params.push(webhook_url);
      updates.push(`webhook_url = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    const result = await query(
      `UPDATE bots SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bot not found' });
    }

    res.json({ bot: result.rows[0] });
  } catch (error) {
    console.error('Update bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dashboard stats
router.get('/dashboard/stats', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId } = req.query;

    let whereClause = '';
    const params: any[] = [];
    
    if (botId) {
      params.push(botId);
      whereClause = `WHERE bot_id = $${params.length}`;
    }

    const [userStats, transactionStats, bindingStats, redPacketStats] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE platform_bound = true) as bound_users,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as new_today,
          COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '24 hours') as active_today
        FROM users ${whereClause}
      `, params),
      query(`
        SELECT 
          COALESCE(SUM(amount), 0) as total_rewards,
          COUNT(*) as total_transactions,
          COALESCE(SUM(amount) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0) as rewards_today
        FROM transactions t
        JOIN users u ON t.user_id = u.id
        ${whereClause.replace('bot_id', 'u.bot_id')}
      `, params),
      query(`
        SELECT 
          COUNT(*) as total_bindings,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_bindings,
          COUNT(*) FILTER (WHERE status = 'approved') as approved_bindings
        FROM platform_bindings
        ${whereClause}
      `, params),
      query(`
        SELECT 
          COUNT(*) as total_red_packets,
          COALESCE(SUM(claimed_amount), 0) as total_claimed_amount,
          COUNT(*) FILTER (WHERE status = 'active') as active_red_packets
        FROM red_packets
        ${whereClause}
      `, params)
    ]);

    res.json({
      users: userStats.rows[0],
      transactions: transactionStats.rows[0],
      bindings: bindingStats.rows[0],
      redPackets: redPacketStats.rows[0]
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
