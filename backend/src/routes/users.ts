import express from 'express';
import { query } from '../db';
import { authenticateAdmin, authenticateBot, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Get all users
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, search, botId } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT u.*, 
        COUNT(i.id) as invite_count,
        (SELECT COUNT(*) FROM invitations WHERE invitee_id = u.id) as invited_by_count
      FROM users u
      LEFT JOIN invitations i ON i.inviter_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (botId) {
      params.push(botId);
      queryText += ` AND u.bot_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      queryText += ` AND (u.username ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.robot_user_id ILIKE $${params.length})`;
    }

    queryText += ` GROUP BY u.id ORDER BY u.created_at DESC`;
    
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
    const countParams: any[] = [];
    if (botId) {
      countParams.push(botId);
      countQuery += ` AND bot_id = $${countParams.length}`;
    }
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (username ILIKE $${countParams.length} OR first_name ILIKE $${countParams.length} OR robot_user_id ILIKE $${countParams.length})`;
    }

    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      users: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by telegram ID (for bot)
router.get('/telegram/:telegramId', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { telegramId } = req.params;

    const result = await query(
      `SELECT * FROM users WHERE telegram_id = $1 AND bot_id = $2`,
      [telegramId, req.botId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user by telegram ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user (for bot)
router.post('/', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { telegram_id, username, first_name, last_name, language_code, invite_code_used } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ error: 'Telegram ID required' });
    }

    // Check if user already exists
    const existing = await query(
      'SELECT * FROM users WHERE telegram_id = $1 AND bot_id = $2',
      [telegram_id, req.botId]
    );

    if (existing.rows.length > 0) {
      return res.json({ user: existing.rows[0] });
    }

    // Handle invite code
    let invitedBy = null;
    if (invite_code_used) {
      const inviterResult = await query(
        'SELECT id FROM users WHERE invite_code = $1',
        [invite_code_used]
      );
      if (inviterResult.rows.length > 0) {
        invitedBy = inviterResult.rows[0].id;
      }
    }

    // Get bot settings for initial credits
    const settingsResult = await query(
      'SELECT new_user_credits FROM bot_settings WHERE bot_id = $1',
      [req.botId]
    );
    const initialCredits = settingsResult.rows[0]?.new_user_credits || 3;

    // Create user
    const result = await query(
      `INSERT INTO users (bot_id, telegram_id, username, first_name, last_name, language_code, invited_by, red_packet_credits)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.botId, telegram_id, username, first_name, last_name, language_code || 'en', invitedBy, initialCredits]
    );

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by ID
router.get('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT u.*, 
        COUNT(DISTINCT i.id) as invite_count,
        (SELECT username FROM users WHERE id = u.invited_by) as invited_by_username
      FROM users u
      LEFT JOIN invitations i ON i.inviter_id = u.id
      WHERE u.id = $1
      GROUP BY u.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get transactions
    const transactions = await query(
      `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id]
    );

    res.json({
      user: result.rows[0],
      transactions: transactions.rows,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user
router.put('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { balance, account_status, platform_status, red_packet_credits } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (balance !== undefined) {
      params.push(balance);
      updates.push(`balance = $${params.length}`);
    }
    if (account_status) {
      params.push(account_status);
      updates.push(`account_status = $${params.length}`);
    }
    if (platform_status) {
      params.push(platform_status);
      updates.push(`platform_status = $${params.length}`);
    }
    if (red_packet_credits !== undefined) {
      params.push(red_packet_credits);
      updates.push(`red_packet_credits = $${params.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user transactions
router.get('/:id/transactions', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;

    const result = await query(
      `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [id, limit]
    );

    res.json({ transactions: result.rows });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user invite stats
router.get('/:id/invites', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT COUNT(*) as total FROM invitations WHERE inviter_id = $1`,
      [id]
    );

    res.json({ total: parseInt(result.rows[0].total) });
  } catch (error) {
    console.error('Get invite stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user statistics
router.get('/stats/overview', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { botId } = req.query;

    let whereClause = '';
    const params: any[] = [];
    
    if (botId) {
      params.push(botId);
      whereClause = `WHERE bot_id = $${params.length}`;
    }

    const stats = await query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE platform_bound = true) as bound_users,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as new_today,
        COUNT(*) FILTER (WHERE last_active_at > NOW() - INTERVAL '24 hours') as active_today,
        SUM(balance) as total_balance,
        AVG(balance) as avg_balance
      FROM users ${whereClause}
    `, params);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Freeze user
router.post('/:id/freeze', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE users SET is_frozen = true WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Freeze user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unfreeze user
router.post('/:id/unfreeze', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      'UPDATE users SET is_frozen = false WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Unfreeze user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Adjust user balance (admin)
router.post('/:id/adjust-balance', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { amount, type, reason } = req.body;

    if (!amount || !type || !['add', 'subtract'].includes(type)) {
      return res.status(400).json({ error: 'Invalid amount or type (add/subtract)' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const delta = type === 'add' ? numAmount : -numAmount;

    const result = await query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2 AND (balance + $1) >= 0 RETURNING *',
      [delta, id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'User not found or insufficient balance' });
    }

    // Log the adjustment
    await query(
      `INSERT INTO balance_adjustments (user_id, admin_id, amount, type, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, req.user?.id, numAmount, type, reason || '']
    );

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Adjust balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by unique_id
router.get('/unique/:uniqueId', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { uniqueId } = req.params;
    const result = await query(
      'SELECT * FROM users WHERE unique_id = $1',
      [uniqueId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user by unique_id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
