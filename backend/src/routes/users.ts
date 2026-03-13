import express from 'express';
import axios from 'axios';
import { query } from '../db';
import { authenticateAdmin, authenticateBot, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';

const router = express.Router();

// Get all users
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, search, botId, binding_status, account_status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT u.*, 
        COUNT(i.id) as invite_count,
        (SELECT COUNT(*) FROM invitations WHERE invitee_id = u.id) as invited_by_count,
        (SELECT COUNT(*) FROM users u2 WHERE u2.telegram_id = u.telegram_id) as bot_count
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

    if (binding_status === 'bound') {
      queryText += ` AND u.platform_bound = true`;
    } else if (binding_status === 'unbound') {
      queryText += ` AND u.platform_bound = false`;
    } else if (binding_status === 'pending') {
      params.push('pending');
      queryText += ` AND u.platform_status = $${params.length}`;
    }

    if (account_status) {
      const validAccountStatuses = ['active', 'suspended', 'banned'];
      if (validAccountStatuses.includes(account_status as string)) {
        params.push(account_status);
        queryText += ` AND u.account_status = $${params.length}`;
      }
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

    if (binding_status === 'bound') {
      countQuery += ` AND platform_bound = true`;
    } else if (binding_status === 'unbound') {
      countQuery += ` AND platform_bound = false`;
    } else if (binding_status === 'pending') {
      countParams.push('pending');
      countQuery += ` AND platform_status = $${countParams.length}`;
    }

    if (account_status) {
      const validAccountStatuses = ['active', 'suspended', 'banned'];
      if (validAccountStatuses.includes(account_status as string)) {
        countParams.push(account_status);
        countQuery += ` AND account_status = $${countParams.length}`;
      }
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
      `SELECT * FROM users WHERE telegram_id = $1`,
      [telegramId]
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

    // Check if user already exists (by telegram_id — single account per user)
    const existing = await query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegram_id]
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

    // Create user — ON CONFLICT (telegram_id) guarantees single account across all bots
    const result = await query(
      `INSERT INTO users (bot_id, telegram_id, username, first_name, last_name, language_code, invited_by, red_packet_credits)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (telegram_id) DO UPDATE SET last_active_at = NOW()
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
        (SELECT username FROM users WHERE id = u.invited_by) as invited_by_username,
        b.name as bot_name,
        (u.withdraw_password IS NOT NULL) as withdraw_password_set
      FROM users u
      LEFT JOIN invitations i ON i.inviter_id = u.id
      LEFT JOIN bots b ON u.bot_id = b.id
      WHERE u.id = $1
      GROUP BY u.id, b.name`,
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
    const { balance, account_status, platform_status, red_packet_credits, language_code } = req.body;

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
    if (language_code !== undefined) {
      params.push(language_code);
      updates.push(`language_code = $${params.length}`);
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

// Get users invited by this user
router.get('/:id/invitees', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.created_at, u.account_status
       FROM users u
       INNER JOIN invitations inv ON inv.invitee_id = u.id
       WHERE inv.inviter_id = $1
       ORDER BY u.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, Number(limit), offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM invitations WHERE inviter_id = $1`,
      [id]
    );

    res.json({
      invitees: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (error) {
    console.error('Get invitees error:', error);
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

    // delta is negative for subtract operations; both balance >= 0 checks prevent negative balances
    // When adding balance (delta > 0), also increment total_recharged so withdrawal/transfer
    // restrictions based on total_recharged are correctly satisfied.
    const result = await query(
      `UPDATE users
       SET balance = balance + $1,
           wallet_balance = COALESCE(wallet_balance, 0) + $1,
           total_recharged = CASE WHEN $1 > 0 THEN COALESCE(total_recharged, 0) + $1 ELSE total_recharged END
       WHERE id = $2
         AND (balance + $1) >= 0
         AND (COALESCE(wallet_balance, 0) + $1) >= 0
       RETURNING *`,
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

    // Insert transaction record
    const updatedUser = result.rows[0];
    const balanceAfter = parseFloat(String(updatedUser.wallet_balance ?? updatedUser.balance));
    await query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        type === 'add' ? 'admin_credit' : 'admin_debit',
        type === 'add' ? numAmount : -numAmount,
        balanceAfter,
        reason || (type === 'add' ? 'Admin balance credit' : 'Admin balance debit'),
      ]
    );

    // Notify user via Telegram bot
    try {
      if (updatedUser.bot_id && updatedUser.telegram_id) {
        const botResult = await query('SELECT token FROM bots WHERE id = $1', [updatedUser.bot_id]);
        if (botResult.rows.length > 0) {
          const token = botResult.rows[0].token;
          const newBalance = balanceAfter.toFixed(2);
          const changeText = type === 'add' ? `+${numAmount.toFixed(2)}` : `-${numAmount.toFixed(2)}`;
          const msgText = `💰 Your account balance has been adjusted by an admin\nChange: <b>${changeText} USDT</b>\nCurrent balance: <b>${newBalance} USDT</b>${reason ? `\nNote: ${reason}` : ''}`;
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: updatedUser.telegram_id,
            text: msgText,
            parse_mode: 'HTML',
          }).catch(() => {/* non-critical */});
        }
      }
    } catch {/* non-critical */}

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Adjust balance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by unique_id (accessible by bot)
router.get('/unique/:uniqueId', authenticateBot, async (req: AuthRequest, res) => {
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

// Reset user withdraw password (admin)
router.put('/:id/reset-withdraw-password', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE users SET withdraw_password = NULL WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'Withdraw password reset successfully' });
  } catch (error) {
    console.error('Reset withdraw password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
