import express from 'express';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { query, transaction } from '../db';
import { authenticateAdmin, authenticateBot, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';
import { sendCrossBotNotification } from '../utils/cross-bot-notify';

const router = express.Router();

// Get all users
router.get('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, search, botId, account_status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT u.*, 
        COUNT(i.id) as invite_count,
        (SELECT COUNT(*) FROM invitations WHERE invitee_id = u.id) as invited_by_count,
        (SELECT COUNT(*) FROM users u2 WHERE u2.telegram_id = u.telegram_id) as bot_count,
        b.username as bot_username,
        b.name as bot_display_name
      FROM users u
      LEFT JOIN invitations i ON i.inviter_id = u.id
      LEFT JOIN bots b ON u.bot_id = b.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (botId) {
      params.push(botId);
      queryText += ` AND u.bot_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      queryText += ` AND (u.username ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.robot_user_id ILIKE $${params.length} OR u.unique_id ILIKE $${params.length})`;
    }

    if (account_status) {
      const validAccountStatuses = ['active', 'suspended', 'banned'];
      if (validAccountStatuses.includes(account_status as string)) {
        params.push(account_status);
        queryText += ` AND u.account_status = $${params.length}`;
      }
    }

    queryText += ` GROUP BY u.id, b.username, b.name ORDER BY u.created_at DESC`;
    
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
      countQuery += ` AND (username ILIKE $${countParams.length} OR first_name ILIKE $${countParams.length} OR robot_user_id ILIKE $${countParams.length} OR unique_id ILIKE $${countParams.length})`;
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

    // Give new users 5 USDT red packet balance
    const initialRedPacketBalance = 5.00;

    // Create user — ON CONFLICT (telegram_id) guarantees single account across all bots
    const result = await query(
      `INSERT INTO users (bot_id, telegram_id, username, first_name, last_name, language_code, invited_by, red_packet_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (telegram_id) DO UPDATE SET last_active_at = NOW()
       RETURNING *, (xmax = 0) AS is_new_insert`,
      [req.botId, telegram_id, username, first_name, last_name, language_code || 'en', invitedBy, initialRedPacketBalance]
    );

    if (invitedBy && result.rows[0]?.is_new_insert) {
      await query(
        `INSERT INTO invitations (inviter_id, invitee_id)
         VALUES ($1, $2)
         ON CONFLICT (inviter_id, invitee_id) DO NOTHING`,
        [invitedBy, result.rows[0].id]
      )
        .then((inviteInsertResult) => {
          if (inviteInsertResult.rowCount === 0) {
            console.warn('Invitation record already exists:', { inviterId: invitedBy, inviteeId: result.rows[0].id });
          }
        })
        .catch((inviteInsertError) => {
          console.warn('Create invitation record failed:', inviteInsertError);
        });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all web-registered (email) accounts — must be before /:id to avoid route conflict
router.get('/web-accounts', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT id, email, register_type, wallet_balance, reward_balance,
             admin_set_login_password, admin_set_withdraw_password,
             withdraw_password IS NOT NULL AS withdraw_password_set,
             created_at, last_active_at, account_status
      FROM users
      WHERE register_type = 'email'
    `;
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      queryText += ` AND email ILIKE $${params.length}`;
    }

    queryText += ` ORDER BY created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    let countQuery = `SELECT COUNT(*) FROM users WHERE register_type = 'email'`;
    const countParams: any[] = [];
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND email ILIKE $1`;
    }
    const countResult = await query(countQuery, countParams);

    res.json({
      users: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0]?.count || '0'),
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (error) {
    console.error('Get web accounts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user by ID
router.get('/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    let realDepositTotal = 0;
    let approvedWithdrawalTotal = 0;

    const result = await query(
      `SELECT u.*,
        (
          SELECT COUNT(DISTINCT sub.uid) FROM (
            SELECT invitee_id AS uid FROM invitations WHERE inviter_id = u.id
            UNION
            SELECT id AS uid FROM users WHERE invited_by = u.id
          ) sub
        ) as invite_count,
        (SELECT username FROM users WHERE id = u.invited_by) as invited_by_username,
        (SELECT JSON_BUILD_OBJECT(
          'id', inv_user.id,
          'telegram_id', inv_user.telegram_id,
          'username', inv_user.username,
          'first_name', inv_user.first_name,
          'account_status', inv_user.account_status
        ) FROM users inv_user WHERE inv_user.id = u.invited_by) AS inviter_info,
        b.name as bot_name,
        (u.withdraw_password IS NOT NULL) as withdraw_password_set
      FROM users u
      LEFT JOIN bots b ON u.bot_id = b.id
      WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    try {
      const depositTotalResult = await query(
        `SELECT COALESCE(SUM(amount), 0) AS real_deposit_total
         FROM deposit_records
         WHERE user_id = $1 AND status IN ('credited', 'confirmed')`,
        [id]
      );
      realDepositTotal = parseFloat(String(depositTotalResult.rows[0]?.real_deposit_total ?? 0));
    } catch (depositError) {
      console.warn('Failed to fetch real deposit total for user', id, depositError);
    }

    try {
      const withdrawalTotalResult = await query(
        `SELECT COALESCE(SUM(amount), 0) AS approved_withdrawal_total
         FROM withdrawal_records
         WHERE user_id = $1 AND status IN ('approved', 'completed')`,
        [id]
      );
      approvedWithdrawalTotal = parseFloat(String(withdrawalTotalResult.rows[0]?.approved_withdrawal_total ?? 0));
    } catch (withdrawalError) {
      console.warn('Failed to fetch approved withdrawal total for user', id, withdrawalError);
    }

    const user = {
      ...result.rows[0],
      real_deposit_total: realDepositTotal,
      approved_withdrawal_total: approvedWithdrawalTotal,
    };

    // Attempt to fetch transaction history; don't fail the whole request if tables don't exist yet
    let transactionRows: any[] = [];
    try {
      const transactions = await query(
        `SELECT id, type, amount, status, created_at, description, order_id
         FROM (
           -- All ledger transactions (includes nft_purchase, nft_income, nft_principal_return,
           --   product_purchase, product_yield, product_refund, auction_*, reward, etc.)
           SELECT id::text, type, ABS(amount)::numeric AS amount,
                  'completed' AS status, created_at, description,
                  reference_id::text AS order_id
           FROM transactions WHERE user_id = $1

           UNION ALL

           -- Deposits
           SELECT id::text, 'deposit' AS type, amount::numeric, status,
                  created_at, tx_hash AS description, NULL AS order_id
           FROM deposit_records WHERE user_id = $1

           UNION ALL

           -- Withdrawals
           SELECT id::text, 'withdrawal' AS type, amount::numeric, status,
                  created_at, to_address AS description, order_id
           FROM withdrawal_records WHERE user_id = $1

           UNION ALL

           -- Incoming transfers
           SELECT id::text, 'transfer_in' AS type, amount::numeric, status,
                  created_at, NULL AS description, order_id
           FROM transfer_records WHERE to_user_id = $1

           UNION ALL

           -- Outgoing transfers
           SELECT id::text, 'transfer_out' AS type, amount::numeric, status,
                  created_at, NULL AS description, order_id
           FROM transfer_records WHERE from_user_id = $1

           UNION ALL

           -- Trading orders (instant trades)
           SELECT id::text,
                  CASE WHEN profit >= 0 THEN 'trade_win' ELSE 'trade_loss' END AS type,
                  CASE WHEN profit >= 0 THEN (amount * odds)::numeric ELSE amount::numeric END AS amount,
                  status, created_at, pair_id::text AS description, id::text AS order_id
           FROM trading_orders WHERE user_id = $1
         ) AS combined
         ORDER BY created_at DESC LIMIT 100`,
        [id]
      );
      transactionRows = transactions.rows;
    } catch (txError) {
      console.warn('Failed to fetch transaction history for user', id, txError);
      // Gracefully degrade: return user info without transactions
    }

    // NFT orders (table may not exist yet)
    try {
      const nftRows = await query(
        `SELECT id::text, 'nft_purchase' AS type, total_amount::numeric AS amount,
                status, created_at, NULL AS description, NULL AS order_id
         FROM nft_orders WHERE user_id = $1`,
        [id]
      );
      transactionRows = [...transactionRows, ...nftRows.rows];
    } catch {
      // Table does not exist yet — ignore
    }

    // Supplement from nft_income_records (dedup against transactions table entries)
    try {
      const nftIncomeRows = await query(
        `SELECT
           ir.id::text,
           'nft_income' AS type,
           ir.amount::numeric AS amount,
           'completed' AS status,
           ir.created_at,
           p.name AS description,
           ir.holding_id::text AS order_id
         FROM nft_income_records ir
         JOIN nft_products p ON ir.product_id = p.id
         WHERE ir.user_id = $1`,
        [id]
      );
      const existingIds = new Set(transactionRows.map((r: any) => r.id));
      const newRows = nftIncomeRows.rows.filter((r: any) => !existingIds.has(r.id));
      if (newRows.length > 0) {
        transactionRows = [...transactionRows, ...newRows];
      }
    } catch {
      // nft_income_records table may not exist — ignore
    }

    // Sort combined results and cap at 100
    transactionRows.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    transactionRows = transactionRows.slice(0, 100);

    res.json({
      user,
      transactions: transactionRows,
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
    const { balance, account_status, platform_status, language_code } = req.body;

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

    let inviteeRows: any[] = [];
    try {
      const result = await query(
        `SELECT 
          u.id, u.telegram_id, u.username, u.first_name, u.last_name, 
          u.created_at, u.account_status,
          COALESCE(inv.reward_paid, false) AS reward_paid,
          COALESCE(inv.reward_amount, 0) AS reward_amount,
        COALESCE(inv.ignore_reward, false) AS ignore_reward,
        inv.id AS invitation_id,
        (SELECT MIN(created_at) FROM deposit_records WHERE user_id = u.id AND status IN ('confirmed', 'credited')) AS first_deposit_at
       FROM users u
       LEFT JOIN invitations inv ON inv.invitee_id = u.id AND inv.inviter_id = $1
       WHERE u.invited_by = $1 OR inv.inviter_id = $1
       ORDER BY u.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, Number(limit), offset]
      );
      inviteeRows = result.rows;
    } catch (qErr: any) {
      // PostgreSQL error 42703 = "undefined_column": reward_amount column may not
      // exist yet if migration 1051 hasn't been applied – degrade gracefully
      if (qErr.code === '42703') {
      const fallback = await query(
        `SELECT 
          u.id, u.telegram_id, u.username, u.first_name, u.last_name, 
          u.created_at, u.account_status,
          COALESCE(inv.reward_paid, false) AS reward_paid,
          0 AS reward_amount,
          false AS ignore_reward,
          inv.id AS invitation_id,
          (SELECT MIN(created_at) FROM deposit_records WHERE user_id = u.id AND status IN ('confirmed', 'credited')) AS first_deposit_at
         FROM users u
         LEFT JOIN invitations inv ON inv.invitee_id = u.id AND inv.inviter_id = $1
         WHERE u.invited_by = $1 OR inv.inviter_id = $1
         ORDER BY u.created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, Number(limit), offset]
      );
      inviteeRows = fallback.rows;
      } else {
      throw qErr;
      }
    }

    const countResult = await query(
      `SELECT COUNT(DISTINCT sub.uid) FROM (
         SELECT invitee_id AS uid FROM invitations WHERE inviter_id = $1
         UNION
         SELECT id AS uid FROM users WHERE invited_by = $1
       ) sub`,
      [id]
    );

    res.json({
      invitees: inviteeRows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (error) {
    console.error('Get invitees error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manually grant invite reward to an invitee's inviter
router.post('/:id/invitees/:inviteeId/grant-reward', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id: inviterId, inviteeId } = req.params;

    // Load reward amount from system_settings (enabled flag is not checked for manual dispatch)
    let rewardAmount = 2.00;
    try {
      const settingsResult = await query(
        `SELECT key, value FROM system_settings WHERE key = 'invite_reward_amount'`
      );
      for (const row of settingsResult.rows) {
        if (row.key === 'invite_reward_amount') {
          const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
          rewardAmount = parseFloat(String(parsed)) || 2.00;
        }
      }
    } catch {
      // Use default if system_settings unavailable
    }

    // Fetch invitee info for the notification message
    const inviteeResult = await query(
      `SELECT username, telegram_id, first_name FROM users WHERE id = $1`,
      [inviteeId]
    );
    const invitee = inviteeResult.rows[0] || {};

    await transaction(async (client) => {
      // Check invitation exists and is not already paid
      const invResult = await client.query(
        `SELECT id, reward_paid FROM invitations WHERE invitee_id = $1 AND inviter_id = $2`,
        [inviteeId, inviterId]
      );
      if (invResult.rows.length > 0 && invResult.rows[0].reward_paid) {
        throw new Error('Reward already paid');
      }

      // Credit inviter's wallet_balance
      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
        [rewardAmount, inviterId]
      );

      // Read updated balance for transaction record
      const balanceResult = await client.query(
        `SELECT wallet_balance FROM users WHERE id = $1`,
        [inviterId]
      );
      const balanceAfter = parseFloat(String(balanceResult.rows[0]?.wallet_balance ?? 0));

      // Mark invitation as rewarded and clear any ignore flag
      if (invResult.rows.length > 0) {
        await client.query(
          `UPDATE invitations SET reward_paid = true, reward_amount = $1, ignore_reward = false WHERE invitee_id = $2 AND inviter_id = $3`,
          [rewardAmount, inviteeId, inviterId]
        );
      } else {
        await client.query(
          `INSERT INTO invitations (inviter_id, invitee_id, reward_amount, reward_paid)
           VALUES ($1, $2, $3, true)`,
          [inviterId, inviteeId, rewardAmount]
        );
      }

      // Record transaction
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [inviterId, 'referral_reward', rewardAmount, balanceAfter, 'Invitation reward (admin dispatch)', inviteeId]
      );
    });

    // Send Telegram notification to inviter (non-blocking)
    try {
      const inviteeName = invitee.username ? `@${invitee.username}` : (invitee.first_name || String(invitee.telegram_id || ''));
      const inviteeTelegramId = invitee.telegram_id ? String(invitee.telegram_id) : '';
      const amountStr = rewardAmount.toFixed(2);
      const friendLabel = inviteeTelegramId ? `${inviteeName} ${inviteeTelegramId}` : inviteeName;
      const notifyText = `收到资金${amountStr}USDT！\n你邀请的好友（${friendLabel}）的邀请奖励 ${amountStr}USDT 已到账！`;
      await sendCrossBotNotification({
        userId: inviterId,
        buildMessage: () => notifyText,
      });
    } catch (notifyErr) {
      console.error('Failed to notify inviter of reward:', notifyErr);
    }

    res.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'Reward already paid') {
      return res.status(400).json({ error: 'Reward already paid' });
    }
    console.error('Grant invite reward error:', error);
    res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

// Mark an invitation reward as ignored (skip granting it)
router.post('/:id/invitees/:inviteeId/ignore-reward', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id: inviterId, inviteeId } = req.params;
    const existing = await query(
      `SELECT id FROM invitations WHERE invitee_id = $1 AND inviter_id = $2`,
      [inviteeId, inviterId]
    );

    if (existing.rows.length > 0) {
      await query(
        `UPDATE invitations SET ignore_reward = true WHERE invitee_id = $1 AND inviter_id = $2`,
        [inviteeId, inviterId]
      );
    } else {
      await query(
        `INSERT INTO invitations (inviter_id, invitee_id, ignore_reward)
         VALUES ($1, $2, true)
         ON CONFLICT (inviter_id, invitee_id) DO UPDATE
         SET ignore_reward = true`,
        [inviterId, inviteeId]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Ignore invite reward error:', error);
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
        AVG(balance) as avg_balance,
        COUNT(*) FILTER (WHERE total_recharged > 0) as recharged_users,
        COALESCE(SUM(total_recharged), 0) as total_recharged_amount
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

    // Send freeze notification via Telegram bot
    try {
      const frozenUser = result.rows[0];
      if (frozenUser.bot_id && frozenUser.telegram_id) {
        const botResult = await query('SELECT token FROM bots WHERE id = $1', [frozenUser.bot_id]);
        if (botResult.rows.length > 0) {
          const token = botResult.rows[0].token;
          const freezeMessages: Record<string, string> = {
            zh: '您因违反规则账号已被管理员冻结，如需申诉，请联系客服',
            en: 'Your account has been frozen by the administrator due to a violation of the rules. If you wish to appeal, please contact customer service.',
            fr: 'Votre compte a été gelé par l\'administrateur en raison d\'une violation des règles. Si vous souhaitez faire appel, veuillez contacter le service client.',
            es: 'Su cuenta ha sido congelada por el administrador debido a una violación de las reglas. Si desea apelar, comuníquese con el servicio al cliente.',
            ar: 'تم تجميد حسابك من قبل المسؤول بسبب انتهاك القواعد. إذا كنت ترغب في الاستئناف، يرجى الاتصال بخدمة العملاء.',
            ja: '規則違反のため、管理者によってアカウントが凍結されました。異議申し立てをご希望の場合は、カスタマーサービスにお問い合わせください。',
          };
          const lang = String(frozenUser.language_code || 'en');
          const msgBody = freezeMessages[lang] ?? freezeMessages['en'];
          const msgText = `🔒 ${msgBody}`;
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: frozenUser.telegram_id,
            text: msgText,
            parse_mode: 'HTML',
          }).catch((err) => console.debug('Freeze notification failed:', err));
        }
      }
    } catch (err) { console.debug('Freeze notification error:', err); }

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

    // Generate a cryptographically secure random 6-digit numeric password
    const newPassword = String(randomInt(100000, 1000000));
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const result = await query(
      `UPDATE users
          SET withdraw_password = $2, admin_set_withdraw_password = $3,
              withdraw_password_attempts = 0, withdraw_password_locked_until = NULL
        WHERE id = $1
        RETURNING id`,
      [id, passwordHash, newPassword]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, message: 'Withdraw password reset successfully', new_password: newPassword });
  } catch (error) {
    console.error('Reset withdraw password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset user login password (web/email accounts)
router.post('/:id/reset-login-password', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Generate a cryptographically secure random 8-character alphanumeric password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let newPassword = '';
    for (let i = 0; i < 8; i++) {
      newPassword += chars[randomInt(chars.length)];
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const result = await query(
      `UPDATE users
          SET password_hash = $2, admin_set_login_password = $3
        WHERE id = $1 AND register_type = 'email'
        RETURNING id`,
      [id, passwordHash, newPassword]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or not a web account' });
    }

    res.json({ success: true, message: 'Login password reset successfully', new_password: newPassword });
  } catch (error) {
    console.error('Reset login password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
