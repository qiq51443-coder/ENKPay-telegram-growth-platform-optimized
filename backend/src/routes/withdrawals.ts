import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import TelegramAPI from '../utils/telegram';
import { getNotifyTemplate, formatNotification } from '../utils/notify';

/**
 * @deprecated This router operates on the legacy `withdrawals` table.
 * New withdrawal requests are stored in `withdrawal_records` and managed via
 * `wallet-admin.ts` (`/api/admin/wallet/withdrawals`).
 * This route is kept for backwards compatibility with the admin panel.
 */
const router = express.Router();

// Get all withdrawals
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, status, botId } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT w.*, 
        u.telegram_id, u.username, u.first_name, u.wallet_balance as user_balance,
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
        wallet_balance: row.user_balance,
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
        'UPDATE users SET balance = balance - $1, wallet_balance = COALESCE(wallet_balance, 0) - $1 WHERE id = $2',
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
        const userResult = await query(
          'SELECT telegram_id, language_code, wallet_balance FROM users WHERE id = $1',
          [withdrawal.user_id]
        );

        if (userResult.rows.length > 0) {
          const { telegram_id, language_code, wallet_balance } = userResult.rows[0];
          const lang = language_code || 'en';
          const currentBalance = parseFloat(wallet_balance || '0').toFixed(2);
          const withdrawAmount = parseFloat(withdrawal.amount).toFixed(2);
          const fee = parseFloat(withdrawal.fee || '0').toFixed(2);
          const actual = (parseFloat(withdrawal.amount) - parseFloat(withdrawal.fee || '0')).toFixed(2);
          const reviewedAt = withdrawal.reviewed_at
            ? new Date(withdrawal.reviewed_at).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
            : new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
          const createdAt = withdrawal.created_at
            ? new Date(withdrawal.created_at).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
            : '-';

          let notificationMessage: string;
          if (status === 'approved') {
            const template = getNotifyTemplate(lang, 'withdraw_approved_notify');
            notificationMessage = formatNotification(template, {
              order_id: withdrawal.order_id || '-',
              amount: withdrawAmount,
              fee,
              actual,
              address: withdrawal.wallet_address || '',
              network: withdrawal.network_name || '-',
              time: reviewedAt,
              created_at: createdAt,
              balance: currentBalance,
            });
          } else {
            const template = getNotifyTemplate(lang, 'withdraw_rejected_notify');
            notificationMessage = formatNotification(template, {
              order_id: withdrawal.order_id || '-',
              amount: withdrawAmount,
              address: withdrawal.wallet_address || '',
              network: withdrawal.network_name || '-',
              time: reviewedAt,
              created_at: createdAt,
              balance: currentBalance,
              reason: admin_note || '-',
            });
          }

          await telegram.sendMessage(telegram_id, notificationMessage);
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
