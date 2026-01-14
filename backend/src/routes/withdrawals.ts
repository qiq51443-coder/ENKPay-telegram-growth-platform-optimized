import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import TelegramAPI from '../utils/telegram';

const router = express.Router();

// Get all withdrawals
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, status, botId } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT w.*, 
        u.telegram_id, u.username, u.first_name, u.balance as user_balance,
        b.name as bot_name
      FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      JOIN bots b ON w.bot_id = b.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      queryText += ` AND w.status = $${params.length}`;
    }

    if (botId) {
      params.push(botId);
      queryText += ` AND w.bot_id = $${params.length}`;
    }

    queryText += ` ORDER BY w.created_at DESC`;
    
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    // Enrich user data for each withdrawal
    const withdrawals = result.rows.map(row => ({
      ...row,
      user: {
        telegram_id: row.telegram_id,
        username: row.username,
        first_name: row.first_name,
        balance: row.user_balance
      }
    }));

    res.json({ withdrawals });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Review withdrawal request
router.put('/:id/review', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, admin_note } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Get withdrawal details
    const withdrawalResult = await query(
      'SELECT * FROM withdrawals WHERE id = $1',
      [id]
    );

    if (withdrawalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    const withdrawal = withdrawalResult.rows[0];

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: 'Withdrawal already processed' });
    }

    // If approved, deduct from user balance
    if (status === 'approved') {
      // Check user balance
      const userResult = await query(
        'SELECT balance FROM users WHERE id = $1',
        [withdrawal.user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userBalance = userResult.rows[0].balance;
      if (userBalance < withdrawal.amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Deduct balance
      await query(
        'UPDATE users SET balance = balance - $1 WHERE id = $2',
        [withdrawal.amount, withdrawal.user_id]
      );

      // Record transaction
      const newBalance = userBalance - withdrawal.amount;
      await query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [withdrawal.user_id, 'withdrawal', -withdrawal.amount, newBalance, 'Withdrawal approved']
      );
    }

    // Update withdrawal status
    const result = await query(
      `UPDATE withdrawals 
       SET status = $1, admin_note = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, admin_note, req.user?.id, id]
    );

    // Send notification to user
    try {
      const botResult = await query('SELECT token FROM bots WHERE id = $1', [withdrawal.bot_id]);
      if (botResult.rows.length > 0) {
        const telegram = new TelegramAPI(botResult.rows[0].token);
        const userResult = await query('SELECT telegram_id FROM users WHERE id = $1', [withdrawal.user_id]);
        
        if (userResult.rows.length > 0) {
          const notificationMessage = status === 'approved'
            ? `✅ Your withdrawal request has been approved!\n\n💰 Amount: $${withdrawal.amount}\n📤 The funds will be sent to your wallet address shortly.`
            : `❌ Your withdrawal request was rejected.\n\n${admin_note ? `Reason: ${admin_note}` : 'Please contact support for more information.'}`;
          
          await telegram.sendMessage(
            userResult.rows[0].telegram_id,
            notificationMessage
          );
        }
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }

    res.json({ withdrawal: result.rows[0] });
  } catch (error) {
    console.error('Review withdrawal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
