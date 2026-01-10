import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';

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

export default router;
