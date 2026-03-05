import express from 'express';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db';
import { authenticateBot, AuthRequest } from '../middleware/auth';
import { getUserBalance, validateTransfer, validateWithdrawal } from '../services/balance.service';
import { generateUserDepositAddress, getUserDepositAddresses } from '../services/deposit.service';
import { walletLimiter } from '../middleware/rateLimiter';

const router = express.Router();

/**
 * GET /api/wallet/balance/:userId
 * Get user balance details with unlock progress
 */
router.get('/balance/:userId', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const balance = await getUserBalance(parseInt(userId));
    
    res.json({
      success: true,
      data: balance,
    });
  } catch (error: any) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/wallet/transfer
 * Transfer funds between users
 * Body: { from_user_id, to_identifier, amount, memo }
 * to_identifier can be robot_user_id or username
 */
router.post('/transfer', walletLimiter, authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { from_user_id, to_identifier, amount, memo } = req.body;

    if (!from_user_id || !to_identifier || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const transferAmount = parseFloat(amount);
    if (transferAmount <= 0) {
      return res.status(400).json({ error: 'Invalid transfer amount' });
    }

    // Validate transfer
    const validation = await validateTransfer(from_user_id, transferAmount);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Find recipient user by robot_user_id or username
    const recipientResult = await query(
      `SELECT id, telegram_user_id, username, first_name 
       FROM users 
       WHERE robot_user_id = $1 OR username = $1`,
      [to_identifier]
    );

    if (recipientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recipient user not found' });
    }

    const recipient = recipientResult.rows[0];

    if (recipient.id === from_user_id) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }

    // Get transfer fee configuration
    const configResult = await query(
      `SELECT value FROM platform_config WHERE key = 'transfer_fee_rate'`
    );
    const feeRate = configResult.rows.length > 0 ? parseFloat(configResult.rows[0].value) : 0.02;

    const fee = transferAmount * feeRate;
    const actualReceived = transferAmount;
    const totalCost = transferAmount + fee;

    // Perform transfer in transaction
    await transaction(async (client) => {
      // Deduct from sender
      await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance - $1,
             total_transferred_out = total_transferred_out + $2
         WHERE id = $3`,
        [totalCost, transferAmount, from_user_id]
      );

      // Add to recipient
      await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance + $1,
             total_transferred_in = total_transferred_in + $1
         WHERE id = $2`,
        [actualReceived, recipient.id]
      );

      // Record transfer
      await client.query(
        `INSERT INTO transfer_records 
         (from_user_id, to_user_id, amount, fee, actual_received, 
          to_bot_username, to_telegram_id, memo, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed')`,
        [
          from_user_id,
          recipient.id,
          transferAmount,
          fee,
          actualReceived,
          recipient.username,
          recipient.telegram_user_id,
          memo || null,
        ]
      );
    });

    res.json({
      success: true,
      message: 'Transfer completed successfully',
      data: {
        amount: transferAmount,
        fee,
        total_cost: totalCost,
        actual_received: actualReceived,
        recipient: {
          id: recipient.id,
          username: recipient.username,
          first_name: recipient.first_name,
        },
      },
    });

    // TODO: Send notification to recipient via Bot
  } catch (error: any) {
    console.error('Transfer error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/wallet/deposit-address/:userId
 * Get or generate deposit address for user
 * Query: network_id (optional, if not provided, returns all networks)
 */
router.get('/deposit-address/:userId', walletLimiter, authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { network_id } = req.query;

    if (network_id) {
      // Generate/get address for specific network
      const address = await generateUserDepositAddress(
        parseInt(userId),
        parseInt(network_id as string)
      );
      
      res.json({
        success: true,
        data: { address, network_id: parseInt(network_id as string) },
      });
    } else {
      // Get all deposit addresses for user
      const addresses = await getUserDepositAddresses(parseInt(userId));
      
      res.json({
        success: true,
        data: addresses,
      });
    }
  } catch (error: any) {
    console.error('Get deposit address error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/wallet/withdraw
 * Submit withdrawal request
 * Body: { user_id, network_id, amount, to_address }
 */
router.post('/withdraw', walletLimiter, authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, network_id, amount, to_address } = req.body;

    if (!user_id || !network_id || !amount || !to_address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const withdrawAmount = parseFloat(amount);
    if (withdrawAmount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    // Validate withdrawal
    const validation = await validateWithdrawal(user_id, withdrawAmount);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Get withdrawal fee configuration
    const configResult = await query(
      `SELECT value FROM platform_config WHERE key = 'withdraw_fee_rate'`
    );
    const feeRate = configResult.rows.length > 0 ? parseFloat(configResult.rows[0].value) : 0.02;

    const fee = withdrawAmount * feeRate;
    const actualAmount = withdrawAmount - fee;
    const totalCost = withdrawAmount;

    // Create withdrawal record and freeze balance
    const result = await transaction(async (client) => {
      // Deduct from wallet_balance and add to frozen_balance
      await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance - $1,
             frozen_balance = frozen_balance + $1
         WHERE id = $2`,
        [totalCost, user_id]
      );

      // Create withdrawal record
      const insertResult = await client.query(
        `INSERT INTO withdrawal_records 
         (user_id, network_id, amount, fee, actual_amount, to_address, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id`,
        [user_id, network_id, withdrawAmount, fee, actualAmount, to_address]
      );

      return insertResult.rows[0];
    });

    res.json({
      success: true,
      message: 'Withdrawal request submitted for review',
      data: {
        withdrawal_id: result.id,
        amount: withdrawAmount,
        fee,
        actual_amount: actualAmount,
        status: 'pending',
      },
    });
  } catch (error: any) {
    console.error('Withdraw error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/wallet/transactions/:userId
 * Get user transaction history
 * Query: page, limit, type (deposit|withdrawal|transfer)
 */
router.get('/transactions/:userId', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const transactions: any[] = [];

    if (!type || type === 'deposit') {
      const deposits = await query(
        `SELECT 
           'deposit' as type,
           id,
           amount,
           status,
           created_at,
           tx_hash,
           network_id
         FROM deposit_records
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, Number(limit), offset]
      );
      transactions.push(...deposits.rows);
    }

    if (!type || type === 'withdrawal') {
      const withdrawals = await query(
        `SELECT 
           'withdrawal' as type,
           id,
           amount,
           status,
           created_at,
           to_address,
           network_id
         FROM withdrawal_records
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, Number(limit), offset]
      );
      transactions.push(...withdrawals.rows);
    }

    if (!type || type === 'transfer') {
      const transfers = await query(
        `SELECT 
           'transfer' as type,
           id,
           amount,
           'completed' as status,
           created_at,
           to_user_id,
           from_user_id
         FROM transfer_records
         WHERE from_user_id = $1 OR to_user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, Number(limit), offset]
      );
      transactions.push(...transfers.rows);
    }

    // Sort by created_at descending
    transactions.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    res.json({
      success: true,
      data: transactions.slice(0, Number(limit)),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: transactions.length,
      },
    });
  } catch (error: any) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/wallet/transfers/:userId
 * Get user transfer records
 */
router.get('/transfers/:userId', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT 
         tr.*,
         fu.username as from_username,
         fu.first_name as from_first_name,
         tu.username as to_username,
         tu.first_name as to_first_name
       FROM transfer_records tr
       LEFT JOIN users fu ON tr.from_user_id = fu.id
       LEFT JOIN users tu ON tr.to_user_id = tu.id
       WHERE tr.from_user_id = $1 OR tr.to_user_id = $1
       ORDER BY tr.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, Number(limit), offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) FROM transfer_records 
       WHERE from_user_id = $1 OR to_user_id = $1`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].count),
      },
    });
  } catch (error: any) {
    console.error('Get transfers error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/wallet/withdraw-password/:userId
 * Check if user has set a withdraw password (bot use)
 */
router.get('/withdraw-password/:userId', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    const result = await query(
      `SELECT withdraw_password FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      has_password: !!user.withdraw_password,
    });
  } catch (error: any) {
    console.error('Get withdraw password error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/wallet/withdraw-password
 * Set withdraw password for user (bot use)
 * Body: { user_id, password }
 */
router.post('/withdraw-password', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, password } = req.body;

    if (!user_id || !password) {
      return res.status(400).json({ error: 'user_id and password are required' });
    }

    if (!/^\d{4}$/.test(password)) {
      return res.status(400).json({ error: 'Password must be exactly 4 digits' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      `UPDATE users SET withdraw_password = $1 WHERE id = $2 RETURNING id`,
      [hashedPassword, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'Withdraw password set successfully' });
  } catch (error: any) {
    console.error('Set withdraw password error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/wallet/verify-withdraw-password
 * Verify withdraw password for user (bot use)
 * Body: { user_id, password }
 */
router.post('/verify-withdraw-password', walletLimiter, authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, password } = req.body;

    if (!user_id || !password) {
      return res.status(400).json({ error: 'user_id and password are required' });
    }

    const result = await query(
      `SELECT withdraw_password FROM users WHERE id = $1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const storedHash = result.rows[0].withdraw_password;
    if (!storedHash) {
      return res.json({ valid: false });
    }

    const valid = await bcrypt.compare(password, storedHash);
    res.json({ valid });
  } catch (error: any) {
    console.error('Verify withdraw password error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
