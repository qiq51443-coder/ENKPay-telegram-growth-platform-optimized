import express from 'express';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db';
import { authenticateBot, AuthRequest } from '../middleware/auth';
import { getUserBalance, validateTransfer, validateWithdrawal } from '../services/balance.service';
import { generateUserDepositAddress, getUserDepositAddresses } from '../services/deposit.service';
import { walletLimiter } from '../middleware/rateLimiter';
import TelegramAPI from '../utils/telegram';
import { getNotifyTemplate, formatNotification } from '../utils/notify';
import { generateOrderId } from '../utils/orderId';

const router = express.Router();

// Withdraw password security settings
const WITHDRAW_PASSWORD_MAX_ATTEMPTS = 5;
const WITHDRAW_PASSWORD_LOCK_MINUTES = 15;

// Apply rate limiting to all wallet routes
router.use(walletLimiter);

/**
 * GET /api/wallet/networks
 * Get active deposit networks (for bot dynamic network selection)
 */
router.get('/networks', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT id, network_name, network_display, chain_name, min_deposit_amount, is_active
       FROM deposit_networks
       WHERE is_active = true
       ORDER BY sort_order, network_name`
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Get networks error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/wallet/networks/:id
 * Get a single deposit network by id (for bot efficiency — avoids fetching full list)
 */
router.get('/networks/:id', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, network_name, network_display, chain_name, min_deposit_amount, is_active
       FROM deposit_networks
       WHERE id = $1 AND is_active = true`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Network not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('Get network error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Resolve a network identifier (numeric id or chain_name string like 'BSC', 'ETH', 'TRC')
 * to a numeric network id. Returns null if the network is not found.
 * Falls back to matching by network_name so that bot network IDs like 'TRC'
 * resolve correctly even when chain_name is stored as 'TRON'.
 */
async function resolveNetworkId(networkId: string | number): Promise<number | null> {
  if (!isNaN(Number(networkId))) {
    return parseInt(networkId as string);
  }
  const result = await query(
    `SELECT id FROM deposit_networks WHERE (chain_name = $1 OR network_name = $1) AND is_active = true LIMIT 1`,
    [networkId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0].id;
}

/**
 * Send Telegram notifications to both parties after a successful transfer.
 * Errors are caught and logged — notification failure must never affect the transfer.
 */
async function notifyTransferParties(
  senderId: number,
  recipientId: number,
  recipientDisplayName: string,
  amount: number,
  fee: number,
  actualReceived: number,
  orderId: string
): Promise<void> {
  // Fetch sender info (telegram_id, language_code, updated balance, bot_token)
  const senderResult = await query(
    `SELECT u.telegram_id, u.language_code, u.wallet_balance, u.first_name, u.username,
            b.token AS bot_token
     FROM users u
     JOIN bots b ON u.bot_id = b.id
     WHERE u.id = $1 AND b.is_active = true`,
    [senderId]
  );

  // Fetch recipient info (telegram_id, language_code, updated balance, bot_token)
  const recipientResult = await query(
    `SELECT u.telegram_id, u.language_code, u.wallet_balance, b.token AS bot_token
     FROM users u
     JOIN bots b ON u.bot_id = b.id
     WHERE u.id = $1 AND b.is_active = true`,
    [recipientId]
  );

  // Notify sender
  if (senderResult.rows.length > 0) {
    const { telegram_id, language_code, wallet_balance, bot_token } = senderResult.rows[0];
    if (telegram_id && bot_token) {
      try {
        const lang = language_code || 'en';
        const template = getNotifyTemplate(lang, 'transfer_sent_notify');
        const message = formatNotification(template, {
          order_id: orderId,
          recipient: recipientDisplayName,
          amount: amount.toFixed(2),
          fee: fee.toFixed(2),
          actual: actualReceived.toFixed(2),
          balance: parseFloat(wallet_balance || '0').toFixed(2),
        });
        const tg = new TelegramAPI(bot_token);
        await tg.sendMessage(telegram_id, message);
      } catch (err) {
        console.error(`Failed to notify sender ${senderId} of transfer:`, err);
      }
    }
  }

  // Notify recipient
  if (recipientResult.rows.length > 0) {
    const { telegram_id, language_code, wallet_balance, bot_token } = recipientResult.rows[0];
    if (telegram_id && bot_token) {
      try {
        const lang = language_code || 'en';
        const senderDisplay = senderResult.rows.length > 0
          ? (senderResult.rows[0].first_name || senderResult.rows[0].username || String(senderId))
          : String(senderId);
        const template = getNotifyTemplate(lang, 'transfer_received_notify');
        const message = formatNotification(template, {
          order_id: orderId,
          sender: senderDisplay,
          amount: actualReceived.toFixed(2),
          balance: parseFloat(wallet_balance || '0').toFixed(2),
        });
        const tg = new TelegramAPI(bot_token);
        await tg.sendMessage(telegram_id, message);
      } catch (err) {
        console.error(`Failed to notify recipient ${recipientId} of transfer:`, err);
      }
    }
  }
}

/**
 * GET /api/wallet/balance/:userId
 * Get user balance details with unlock progress.
 * Resolves the canonical user (earliest-created record for the same telegram_id)
 * so that balance is always read from the authoritative record regardless of
 * which bot's user-record UUID was passed by the caller.
 */
router.get('/balance/:userId', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    // Look up the user to obtain their telegram_id
    const userRow = await query(
      `SELECT id, telegram_id FROM users WHERE id = $1`,
      [userId]
    );
    if (userRow.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Resolve the canonical user (earliest-created record for this telegram_id)
    const telegramId = userRow.rows[0].telegram_id;
    const canonicalRow = await query(
      `SELECT id FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [telegramId]
    );
    if (canonicalRow.rows.length === 0) {
      return res.status(404).json({ error: 'Canonical user record not found' });
    }
    const canonicalId = canonicalRow.rows[0].id;

    const balance = await getUserBalance(parseInt(canonicalId));

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
router.post('/transfer', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { from_user_id, to_identifier, amount, memo } = req.body;

    if (!from_user_id || !to_identifier || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const transferAmount = parseFloat(amount);
    if (transferAmount <= 0) {
      return res.status(400).json({ error: 'Invalid transfer amount' });
    }

    // Validate transfer (amount/format checks only — balance re-checked inside transaction)
    const validation = await validateTransfer(from_user_id, transferAmount);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Get sender's bot_id to restrict recipient search to the same bot
    const senderBotResult = await query(
      `SELECT bot_id FROM users WHERE id = $1`,
      [from_user_id]
    );
    if (senderBotResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sender not found' });
    }
    const senderBotId = senderBotResult.rows[0].bot_id;

    // Find recipient user by robot_user_id or username, restricted to the same bot
    const recipientResult = await query(
      `SELECT id, telegram_id, username, first_name 
       FROM users 
       WHERE (robot_user_id = $1 OR username = $1) AND bot_id = $2`,
      [to_identifier, senderBotId]
    );

    if (recipientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recipient user not found' });
    }

    // Guard against duplicate usernames across edge cases
    if (recipientResult.rows.length > 1) {
      return res.status(400).json({
        error: 'Ambiguous recipient: multiple users found with that identifier. Please use a unique ID.',
      });
    }

    const recipient = recipientResult.rows[0];

    if (String(recipient.id) === String(from_user_id)) {
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

    // Generate order ID before transaction
    const transferOrderId = await generateOrderId('transfer_records');

    // Perform transfer in transaction
    await transaction(async (client) => {
      // Lock sender row and re-validate balance inside the transaction (prevents double-spend)
      const senderRow = await client.query(
        `SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE`,
        [from_user_id]
      );
      if (senderRow.rows.length === 0) throw new Error('Sender not found');
      const senderBalance = parseFloat(senderRow.rows[0].wallet_balance) || 0;
      if (senderBalance < totalCost) {
        throw new Error(`Insufficient balance. Available: ${senderBalance.toFixed(2)} USDT, Required: ${totalCost.toFixed(2)} USDT`);
      }

      // Deduct from sender
      const deductResult = await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance - $1,
             total_transferred_out = total_transferred_out + $2
         WHERE id = $3 AND wallet_balance >= $1`,
        [totalCost, transferAmount, from_user_id]
      );
      if (deductResult.rowCount === 0) {
        throw new Error('Insufficient balance');
      }

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
         (order_id, from_user_id, to_user_id, amount, fee, actual_received, 
          to_bot_username, to_telegram_id, memo, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')`,
        [
          transferOrderId,
          from_user_id,
          recipient.id,
          transferAmount,
          fee,
          actualReceived,
          recipient.username,
          recipient.telegram_id,
          memo || null,
        ]
      );
    });

    res.json({
      success: true,
      message: 'Transfer completed successfully',
      data: {
        order_id: transferOrderId,
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
    notifyTransferParties(
      from_user_id,
      recipient.id,
      recipient.first_name || recipient.username || String(recipient.id),
      transferAmount,
      fee,
      actualReceived,
      transferOrderId
    ).catch((err) => console.error('Transfer notification failed:', err));
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
router.get('/deposit-address/:userId', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const { network_id } = req.query;

    if (isNaN(Number(userId))) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    if (network_id) {
      // Resolve network_id: support numeric id or chain_name string (e.g. 'BSC', 'ETH', 'TRC')
      const numericNetworkId = await resolveNetworkId(network_id as string);
      if (numericNetworkId === null) {
        return res.status(404).json({ error: `Network '${network_id}' not found` });
      }

      // Generate/get address for specific network
      const address = await generateUserDepositAddress(userId, numericNetworkId);
      
      res.json({
        success: true,
        data: { address, network_id: numericNetworkId },
      });
    } else {
      // Get all deposit addresses for user
      const addresses = await getUserDepositAddresses(userId);
      
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
router.post('/withdraw', authenticateBot, async (req: AuthRequest, res) => {
  try {
    let { user_id, network_id, amount, to_address } = req.body;

    if (!user_id || !network_id || !amount || !to_address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Resolve network_id: support numeric id or chain_name string (e.g. 'BSC', 'ETH', 'TRC')
    const numericNetworkId = await resolveNetworkId(network_id);
    if (numericNetworkId === null) {
      return res.status(404).json({ error: `Network '${network_id}' not found` });
    }
    network_id = numericNetworkId;

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

    // Generate order ID before transaction
    const withdrawOrderId = await generateOrderId('withdrawal_records');

    // Create withdrawal record and freeze balance
    const result = await transaction(async (client) => {
      // Lock user row and re-validate balance inside transaction (prevents double-spend)
      const userRow = await client.query(
        `SELECT wallet_balance, frozen_balance FROM users WHERE id = $1 FOR UPDATE`,
        [user_id]
      );
      if (userRow.rows.length === 0) throw new Error('User not found');
      const availBalance = parseFloat(userRow.rows[0].wallet_balance) || 0;
      if (availBalance < totalCost) {
        throw new Error(`Insufficient balance. Available: ${availBalance.toFixed(2)} USDT, Required: ${totalCost.toFixed(2)} USDT`);
      }

      // Deduct from wallet_balance and add to frozen_balance
      const deductResult = await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance - $1,
             frozen_balance = frozen_balance + $1
         WHERE id = $2 AND wallet_balance >= $1`,
        [totalCost, user_id]
      );
      if (deductResult.rowCount === 0) {
        throw new Error('Insufficient balance');
      }

      // Create withdrawal record
      const insertResult = await client.query(
        `INSERT INTO withdrawal_records 
         (order_id, user_id, network_id, amount, fee, actual_amount, to_address, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         RETURNING id, order_id`,
        [withdrawOrderId, user_id, network_id, withdrawAmount, fee, actualAmount, to_address]
      );

      return insertResult.rows[0];
    });

    res.json({
      success: true,
      message: 'Withdrawal request submitted for review',
      data: {
        order_id: result.order_id,
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
           order_id,
           amount,
           status,
           created_at,
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
           order_id,
           amount,
           status,
           created_at,
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
           order_id,
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

    if (!/^\d{6,}$/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 digits' });
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
router.post('/verify-withdraw-password', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, password } = req.body;

    if (!user_id || !password) {
      return res.status(400).json({ error: 'user_id and password are required' });
    }

    const result = await query(
      `SELECT withdraw_password, withdraw_password_attempts, withdraw_password_locked_until
       FROM users WHERE id = $1`,
      [user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { withdraw_password: storedHash, withdraw_password_attempts, withdraw_password_locked_until } = result.rows[0];

    // Check lockout
    if (withdraw_password_locked_until && new Date(withdraw_password_locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(withdraw_password_locked_until).getTime() - Date.now()) / 60000);
      return res.status(429).json({ valid: false, error: `Account locked due to too many failed attempts. Try again in ${remaining} minute(s).` });
    }

    if (!storedHash) {
      return res.json({ valid: false });
    }

    const valid = await bcrypt.compare(password, storedHash);

    if (!valid) {
      const attempts = (withdraw_password_attempts || 0) + 1;
      if (attempts >= WITHDRAW_PASSWORD_MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + WITHDRAW_PASSWORD_LOCK_MINUTES * 60 * 1000);
        await query(
          `UPDATE users SET withdraw_password_attempts = $1, withdraw_password_locked_until = $2 WHERE id = $3`,
          [attempts, lockedUntil, user_id]
        );
        return res.status(429).json({ valid: false, error: `Too many failed attempts. Account locked for ${WITHDRAW_PASSWORD_LOCK_MINUTES} minutes.` });
      }
      await query(
        `UPDATE users SET withdraw_password_attempts = $1 WHERE id = $2`,
        [attempts, user_id]
      );
    } else {
      // Reset on success
      await query(
        `UPDATE users SET withdraw_password_attempts = 0, withdraw_password_locked_until = NULL WHERE id = $1`,
        [user_id]
      );
    }

    res.json({ valid });
  } catch (error: any) {
    console.error('Verify withdraw password error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
