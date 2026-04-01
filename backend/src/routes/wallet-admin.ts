import express from 'express';
import { query, transaction } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { encrypt, decrypt, addManualDepositAddress, clearMnemonicCache } from '../services/deposit.service';
import { createMoralisStream, addAddressToStream, deleteStream } from '../services/moralis-stream.service';
import { resolveChainType, MORALIS_CHAIN_IDS } from '../utils/chain';
import { adminLimiter } from '../middleware/rateLimiter';
import TelegramAPI from '../utils/telegram';
import { getNotifyTemplate, formatNotification } from '../utils/notify';

const router = express.Router();

// Apply admin rate limiting to all wallet-admin routes
router.use(adminLimiter);

/**
 * GET /api/admin/wallet/networks
 * Get all deposit networks
 */
router.get('/networks', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT 
         dn.id, dn.network_name, dn.network_display, dn.chain_name, dn.currency,
         dn.master_address, dn.hd_derivation_path, dn.min_confirmations,
         dn.scan_interval_seconds, dn.min_deposit_amount, dn.max_deposit_amount, dn.deposit_fee,
         dn.contract_address, dn.decimals,
         dn.is_active, dn.sort_order, dn.explorer_url, dn.created_at, dn.updated_at,
         dn.listener_mode, dn.moralis_stream_id,
         COALESCE(
           (SELECT json_agg(bdn.bot_id)
            FROM bot_deposit_networks bdn
            WHERE bdn.network_id = dn.id AND bdn.is_active = true),
           '[]'::json
         ) AS bot_bindings
       FROM deposit_networks dn
       ORDER BY dn.sort_order, dn.id`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get networks error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/wallet/networks
 * Create a new deposit network
 */
router.post('/networks', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      network_name,
      network_display,
      chain_name,
      currency = 'USDT',
      master_address,
      hd_derivation_path,
      hd_mnemonic,
      min_confirmations = 1,
      scan_interval_seconds = 30,
      min_deposit_amount = 10,
      max_deposit_amount,
      deposit_fee = 0,
      contract_address,
      decimal_places,
      explorer_url,
      sort_order,
      bot_ids,
    } = req.body;

    if (!network_name || !network_display || !chain_name || !hd_derivation_path) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate numeric fields
    if (isNaN(Number(min_deposit_amount)) || Number(min_deposit_amount) < 0) {
      return res.status(400).json({ error: 'min_deposit_amount must be a non-negative number' });
    }
    if (max_deposit_amount !== undefined && (isNaN(Number(max_deposit_amount)) || Number(max_deposit_amount) <= 0)) {
      return res.status(400).json({ error: 'max_deposit_amount must be a positive number' });
    }
    if (max_deposit_amount !== undefined && Number(max_deposit_amount) <= Number(min_deposit_amount)) {
      return res.status(400).json({ error: 'max_deposit_amount must be greater than min_deposit_amount' });
    }

    // Check uniqueness of network_name
    const existing = await query(
      'SELECT id FROM deposit_networks WHERE network_name = $1',
      [network_name]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `Network name '${network_name}' already exists` });
    }

    // Auto-compute sort_order if not provided
    let resolvedSortOrder = sort_order;
    if (resolvedSortOrder === undefined || resolvedSortOrder === null) {
      const maxOrderResult = await query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM deposit_networks');
      resolvedSortOrder = maxOrderResult.rows[0].next_order;
    }

    const encryptedMnemonic = hd_mnemonic ? encrypt(hd_mnemonic) : null;

    const result = await query(
      `INSERT INTO deposit_networks 
       (network_name, network_display, chain_name, currency, master_address,
        hd_derivation_path, hd_mnemonic_encrypted, min_confirmations,
        scan_interval_seconds, min_deposit_amount, max_deposit_amount, deposit_fee,
        contract_address, decimals, explorer_url, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        network_name,
        network_display,
        chain_name,
        currency,
        master_address,
        hd_derivation_path,
        encryptedMnemonic,
        min_confirmations,
        scan_interval_seconds,
        min_deposit_amount,
        max_deposit_amount || null,
        deposit_fee,
        contract_address || null,
        decimal_places !== undefined ? Number(decimal_places) : null,
        explorer_url,
        resolvedSortOrder,
      ]
    );

    const network = result.rows[0];

    // Clear mnemonic cache so the next derivation picks up the new mnemonic
    if (encryptedMnemonic && network.id) {
      clearMnemonicCache(Number(network.id));
    }

    // Bind bots if provided
    if (Array.isArray(bot_ids) && bot_ids.length > 0) {
      for (const botId of bot_ids) {
        await query(
          `INSERT INTO bot_deposit_networks (bot_id, network_id, is_active)
           VALUES ($1, $2, true)
           ON CONFLICT (bot_id, network_id) DO UPDATE SET is_active = true`,
          [botId, network.id]
        );
      }
    }

    res.json({
      success: true,
      data: network,
      message: 'Deposit network created successfully',
    });
  } catch (error: any) {
    console.error('Create network error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/wallet/networks/:id
 * Update deposit network
 */
router.put('/networks/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const updateFields: any = {};
    const params: any[] = [];
    let paramCount = 1;

    const allowedFields = [
      'network_display',
      'master_address',
      'min_confirmations',
      'scan_interval_seconds',
      'min_deposit_amount',
      'max_deposit_amount',
      'deposit_fee',
      'contract_address',
      'decimals',
      'is_active',
      'sort_order',
      'explorer_url',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateFields[field] = `$${paramCount}`;
        params.push(req.body[field]);
        paramCount++;
      }
    }

    // Accept decimal_places as an alias for the decimals column
    if (req.body.decimal_places !== undefined && req.body.decimals === undefined) {
      updateFields.decimals = `$${paramCount}`;
      params.push(Number(req.body.decimal_places));
      paramCount++;
    }

    if (req.body.hd_mnemonic) {
      updateFields.hd_mnemonic_encrypted = `$${paramCount}`;
      params.push(encrypt(req.body.hd_mnemonic));
      paramCount++;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const setClause = Object.keys(updateFields)
      .map((key) => `${key} = ${updateFields[key]}`)
      .join(', ');

    const result = await query(
      `UPDATE deposit_networks 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Network not found' });
    }

    // Clear mnemonic cache whenever the mnemonic is updated so the next
    // address derivation picks up the fresh value.
    if (req.body.hd_mnemonic) {
      clearMnemonicCache(Number(id));
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Network updated successfully',
    });
  } catch (error: any) {
    console.error('Update network error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/wallet/networks/:id/derived-addresses
 * Clear all hd_derived addresses for a specific network (or all networks if id = 'all')
 * so the correct algorithm re-derives fresh addresses on next request.
 */
router.delete('/networks/:id/derived-addresses', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    let result;
    if (id === 'all') {
      result = await query(
        `DELETE FROM user_deposit_addresses WHERE source = 'hd_derived' RETURNING id`
      );
      clearMnemonicCache();
    } else {
      result = await query(
        `DELETE FROM user_deposit_addresses WHERE source = 'hd_derived' AND network_id = $1 RETURNING id`,
        [id]
      );
      clearMnemonicCache(Number(id));
    }
    res.json({
      success: true,
      deleted_count: result.rows.length,
      message: `已清除 ${result.rows.length} 条派生地址，下次用户请求充值时将自动重新派生正确地址`,
    });
  } catch (error: any) {
    console.error('Clear derived addresses error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/wallet/networks/:id
 * Delete deposit network
 */
router.delete('/networks/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM deposit_networks WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Network deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete network error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/wallet/networks/:id/bots
 * Update bot assignments for a deposit network
 */
router.put('/networks/:id/bots', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { bot_ids } = req.body;

    if (!Array.isArray(bot_ids)) {
      return res.status(400).json({ error: 'bot_ids must be an array' });
    }

    // Use a transaction to atomically replace bot bindings
    await transaction(async (client) => {
      // Mark all existing bindings for this network as inactive
      await client.query(
        'UPDATE bot_deposit_networks SET is_active = false WHERE network_id = $1',
        [id]
      );
      // Upsert new bindings as active
      for (const botId of bot_ids) {
        await client.query(
          `INSERT INTO bot_deposit_networks (bot_id, network_id, is_active)
           VALUES ($1, $2, true)
           ON CONFLICT (bot_id, network_id) DO UPDATE SET is_active = true`,
          [botId, id]
        );
      }
    });

    res.json({ success: true, message: 'Bot bindings updated successfully' });
  } catch (error: any) {
    console.error('Update network bots error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/wallet/deposit-addresses
 * Get all user deposit addresses
 */
router.get('/deposit-addresses', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 50, user_id, network_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT 
        uda.*,
        u.username, u.first_name, u.robot_user_id,
        dn.network_name, dn.network_display
      FROM user_deposit_addresses uda
      JOIN users u ON uda.user_id = u.id
      LEFT JOIN deposit_networks dn ON uda.network_id = dn.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (user_id) {
      params.push(user_id);
      queryText += ` AND uda.user_id = $${params.length}`;
    }

    if (network_id) {
      params.push(network_id);
      queryText += ` AND uda.network_id = $${params.length}`;
    }

    queryText += ` ORDER BY uda.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get deposit addresses error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/wallet/deposit-addresses
 * Manually add/update user deposit address
 */
router.post('/deposit-addresses', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { user_id, network_id, address } = req.body;

    if (!user_id || !network_id || !address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await addManualDepositAddress(user_id, network_id, address);

    res.json({
      success: true,
      message: 'Deposit address added/updated successfully',
    });
  } catch (error: any) {
    console.error('Add deposit address error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/wallet/deposit-addresses/:id
 * Delete deposit address
 */
router.delete('/deposit-addresses/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await query(
      'UPDATE user_deposit_addresses SET is_active = false WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Deposit address deactivated successfully',
    });
  } catch (error: any) {
    console.error('Delete deposit address error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/wallet/deposits
 * Get all deposit records
 */
router.get('/deposits', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 50, status, user_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT 
        dr.*,
        u.username, u.first_name, u.robot_user_id,
        dn.network_name, dn.network_display
      FROM deposit_records dr
      JOIN users u ON dr.user_id = u.id
      LEFT JOIN deposit_networks dn ON dr.network_id = dn.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      queryText += ` AND dr.status = $${params.length}`;
    }

    if (user_id) {
      params.push(user_id);
      queryText += ` AND dr.user_id = $${params.length}`;
    }

    queryText += ` ORDER BY dr.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    // Structure response: nest user/network fields into sub-objects for admin panel compatibility
    const deposits = result.rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      network_id: row.network_id,
      amount: row.amount,
      actual_amount: row.actual_amount,
      tx_hash: row.tx_hash,
      from_address: row.from_address,
      to_address: row.to_address,
      status: row.status,
      order_id: row.order_id,
      block_number: row.block_number,
      confirmations: row.confirmations,
      required_confirmations: row.required_confirmations,
      created_at: row.created_at,
      confirmed_at: row.credited_at,
      credited_at: row.credited_at,
      user: {
        telegram_id: row.robot_user_id,
        username: row.username,
        first_name: row.first_name,
      },
      network: {
        network_name: row.network_name,
        network_display: row.network_display,
      },
    }));

    res.json({
      success: true,
      deposits,        // primary field: matches frontend response.deposits
      data: deposits,  // compatibility alias
    });
  } catch (error: any) {
    console.error('Get deposits error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/wallet/withdrawals
 * Get all withdrawal records
 */
router.get('/withdrawals', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 50, status, user_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT 
        wr.id, wr.user_id, wr.network_id,
        wr.amount, wr.fee, wr.actual_amount,
        wr.to_address AS wallet_address,
        wr.to_address,
        wr.tx_hash, wr.status, wr.admin_note,
        wr.reviewed_at, wr.completed_at, wr.created_at, wr.order_id,
        u.username, u.first_name, u.robot_user_id, u.unique_id,
        u.telegram_id AS user_telegram_id,
        u.wallet_balance AS user_wallet_balance,
        dn.network_name, dn.network_display
      FROM withdrawal_records wr
      JOIN users u ON wr.user_id = u.id
      LEFT JOIN deposit_networks dn ON wr.network_id = dn.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      queryText += ` AND wr.status = $${params.length}`;
    }

    if (user_id) {
      params.push(user_id);
      queryText += ` AND wr.user_id = $${params.length}`;
    }

    queryText += ` ORDER BY wr.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    // Structure response: nest user fields into a `user` object for admin panel compatibility
    const rows = result.rows.map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      network_id: row.network_id,
      amount: row.amount,
      fee: row.fee,
      actual_amount: row.actual_amount,
      wallet_address: row.wallet_address,
      to_address: row.to_address,
      tx_hash: row.tx_hash,
      status: row.status,
      admin_note: row.admin_note,
      reviewed_at: row.reviewed_at,
      completed_at: row.completed_at,
      created_at: row.created_at,
      order_id: row.order_id,
      network_name: row.network_name,
      network_display: row.network_display,
      user: {
        telegram_id: row.user_telegram_id,
        username: row.username,
        first_name: row.first_name,
        robot_user_id: row.robot_user_id,
        unique_id: row.unique_id,
        wallet_balance: parseFloat(String(row.user_wallet_balance ?? 0)),
      },
    }));

    res.json({
      success: true,
      data: rows,
    });
  } catch (error: any) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/wallet/withdrawals/:id/review
 * Review (approve/reject) withdrawal
 */
router.put('/withdrawals/:id/review', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { action, admin_note, tx_hash } = req.body; // action: approved | rejected

    if (!action || !['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const result = await transaction(async (client) => {
      // Get withdrawal details
      const withdrawalResult = await client.query(
        'SELECT * FROM withdrawal_records WHERE id = $1',
        [id]
      );

      if (withdrawalResult.rows.length === 0) {
        throw new Error('Withdrawal not found');
      }

      const withdrawal = withdrawalResult.rows[0];

      if (withdrawal.status !== 'pending') {
        throw new Error('Withdrawal already processed');
      }

      if (action === 'approved') {
        // Move from frozen_balance to total_withdrawn
        await client.query(
          `UPDATE users 
           SET frozen_balance = frozen_balance - $1,
               total_withdrawn = total_withdrawn + $2
           WHERE id = $3`,
          [withdrawal.amount, withdrawal.actual_amount, withdrawal.user_id]
        );

        // Update withdrawal status
        await client.query(
          `UPDATE withdrawal_records 
           SET status = 'approved',
               admin_note = $1,
               tx_hash = $2,
               reviewed_by = $3,
               reviewed_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [admin_note, tx_hash, req.user?.id, id]
        );
      } else {
        // Rejected - return frozen amount to wallet
        await client.query(
          `UPDATE users 
           SET frozen_balance = frozen_balance - $1,
               wallet_balance = wallet_balance + $1
           WHERE id = $2`,
          [withdrawal.amount, withdrawal.user_id]
        );

        // Update withdrawal status
        await client.query(
          `UPDATE withdrawal_records 
           SET status = 'rejected',
               admin_note = $1,
               reviewed_by = $2,
               reviewed_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [admin_note, req.user?.id, id]
        );
      }

      return { action, withdrawal };
    });

    // Notify user via Telegram after transaction completes
    try {
      const userResult = await query(
        `SELECT u.telegram_id, u.language_code, u.wallet_balance, u.first_name,
                b.token AS bot_token
         FROM users u
         LEFT JOIN bots b ON u.bot_id = b.id
         WHERE u.id = $1`,
        [result.withdrawal.user_id]
      );
      if (userResult.rows.length > 0) {
        // Fallback: if bot_token is null, get any active bot token
        if (!userResult.rows[0].bot_token) {
          const botRes = await query('SELECT token FROM bots WHERE is_active = true LIMIT 1');
          if (botRes.rows.length > 0) {
            userResult.rows[0].bot_token = botRes.rows[0].token;
          }
        }
        const { telegram_id, language_code, bot_token } = userResult.rows[0];
        // Normalize language code: zh-hans/zh-cn/zh-tw → zh; keep first 2 chars for others
        const rawLang = (language_code || '').toLowerCase();
        const lang = rawLang.startsWith('zh') ? 'zh' : (rawLang.slice(0, 2) || 'en');
        const tg = new TelegramAPI(bot_token);

        // Resolve network display name for notification
        let networkDisplay = '-';
        try {
          const netRow = await query(
            'SELECT network_display, network_name FROM deposit_networks WHERE id = $1 LIMIT 1',
            [result.withdrawal.network_id]
          );
          if (netRow.rows.length > 0) {
            networkDisplay = netRow.rows[0].network_display || netRow.rows[0].network_name;
          }
        } catch {}

        const reviewedAt = result.withdrawal.reviewed_at
          ? new Date(result.withdrawal.reviewed_at).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
          : new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
        const createdAt = result.withdrawal.created_at
          ? new Date(result.withdrawal.created_at).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
          : '-';

        if (action === 'approved') {
          const template = getNotifyTemplate(lang, 'withdraw_approved_notify');
          const message = formatNotification(template, {
            order_id: result.withdrawal.order_id || '-',
            amount: parseFloat(result.withdrawal.amount).toFixed(2),
            fee: parseFloat(result.withdrawal.fee || '0').toFixed(2),
            actual: parseFloat(result.withdrawal.actual_amount || result.withdrawal.amount).toFixed(2),
            address: result.withdrawal.to_address || '',
            network: networkDisplay,
            time: reviewedAt,
            created_at: createdAt,
            balance: parseFloat(userResult.rows[0].wallet_balance || '0').toFixed(2),
          });
          await tg.sendMessage(telegram_id, message);
        } else {
          const updatedUser = await query(
            'SELECT wallet_balance FROM users WHERE id = $1',
            [result.withdrawal.user_id]
          );
          const restoredBalance = parseFloat(String(updatedUser.rows[0]?.wallet_balance ?? 0)).toFixed(2);
          const template = getNotifyTemplate(lang, 'withdraw_rejected_notify');
          const msg = formatNotification(template, {
            order_id: result.withdrawal.order_id || '-',
            amount: parseFloat(result.withdrawal.amount).toFixed(2),
            address: result.withdrawal.to_address || '',
            network: networkDisplay,
            time: reviewedAt,
            created_at: createdAt,
            balance: restoredBalance,
            reason: admin_note || '-',
          });
          await tg.sendMessage(telegram_id, msg);
        }
      }
    } catch (notifyErr) {
      console.error('Failed to notify user of withdrawal review:', notifyErr);
    }

    res.json({
      success: true,
      message: `Withdrawal ${result.action} successfully`,
    });
  } catch (error: any) {
    console.error('Review withdrawal error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/wallet/transfers
 * Get all transfer records
 */
router.get('/transfers', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 50, user_id } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT 
        tr.*,
        fu.username as from_username, fu.first_name as from_first_name,
        fu.unique_id as from_unique_id, fu.telegram_id as from_telegram_id,
        tu.username as to_username, tu.first_name as to_first_name,
        tu.unique_id as to_unique_id, tu.telegram_id as to_telegram_id
      FROM transfer_records tr
      LEFT JOIN users fu ON tr.from_user_id = fu.id
      LEFT JOIN users tu ON tr.to_user_id = tu.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (user_id) {
      params.push(user_id);
      params.push(user_id);
      queryText += ` AND (tr.from_user_id = $${params.length - 1} OR tr.to_user_id = $${params.length})`;
    }

    queryText += ` ORDER BY tr.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    const transfers = result.rows.map((row: any) => ({
      id: row.id,
      from_user_id: row.from_user_id,
      to_user_id: row.to_user_id,
      amount: row.amount,
      fee_amount: row.fee_amount,
      actual_amount: row.actual_amount,
      status: row.status,
      order_id: row.order_id,
      created_at: row.created_at,
      from_user: {
        telegram_id: row.from_telegram_id,
        username: row.from_username,
        first_name: row.from_first_name,
        unique_id: row.from_unique_id,
      },
      to_user: {
        telegram_id: row.to_telegram_id,
        username: row.to_username,
        first_name: row.to_first_name,
        unique_id: row.to_unique_id,
      },
    }));

    res.json({
      success: true,
      transfers,
      data: transfers,
    });
  } catch (error: any) {
    console.error('Get transfers error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/wallet/networks/:id/stream/setup
 * Configure Moralis Streams (EVM) or TronGrid Webhook (TRC) for a network.
 * Body: { moralis_api_key?: string, trongrid_api_key?: string, webhook_url: string }
 */
router.post('/networks/:id/stream/setup', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { moralis_api_key, trongrid_api_key, webhook_url } = req.body;

    if (!webhook_url) {
      return res.status(400).json({ error: 'webhook_url is required' });
    }

    const networkResult = await query(
      `SELECT id, network_name, chain_name FROM deposit_networks WHERE id = $1`,
      [id]
    );
    if (networkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Network not found' });
    }
    const network = networkResult.rows[0];
    const chainType = resolveChainType(network.chain_name);

    if (chainType !== 'TRON') {
      // EVM chain — use Moralis Streams
      if (!moralis_api_key) {
        return res.status(400).json({ error: 'moralis_api_key is required for EVM chains' });
      }

      const moralisChain = MORALIS_CHAIN_IDS[chainType] || '0x1';

      const { id: streamId } = await createMoralisStream(
        moralis_api_key,
        webhook_url,
        `${network.network_name}-deposit`,
        [moralisChain]
      );

      const encryptedApiKey = encrypt(moralis_api_key);

      await query(
        `UPDATE deposit_networks
         SET listener_mode = 'stream',
             moralis_stream_id = $1,
             webhook_api_key_encrypted = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [streamId, encryptedApiKey, id]
      );

      // Sync all existing active addresses to the new stream
      const addressesResult = await query(
        `SELECT address FROM user_deposit_addresses WHERE network_id = $1 AND is_active = true`,
        [id]
      );
      const syncErrors: string[] = [];
      for (const row of addressesResult.rows) {
        try {
          await addAddressToStream(moralis_api_key, streamId, row.address);
        } catch (err: any) {
          syncErrors.push(row.address);
          console.error(`Failed to add address ${row.address} to Moralis Stream:`, err.message);
        }
      }

      return res.json({
        success: true,
        message: `Moralis Stream created (${streamId}). Synced ${addressesResult.rows.length - syncErrors.length}/${addressesResult.rows.length} addresses.`,
        stream_id: streamId,
        sync_errors: syncErrors.length > 0 ? syncErrors : undefined,
      });
    } else {
      // TRC chain — store TronGrid API key only (no programmatic address subscription)
      if (!trongrid_api_key) {
        return res.status(400).json({ error: 'trongrid_api_key is required for TRC chains' });
      }

      const encryptedApiKey = encrypt(trongrid_api_key);

      await query(
        `UPDATE deposit_networks
         SET listener_mode = 'stream',
             webhook_api_key_encrypted = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [encryptedApiKey, id]
      );

      return res.json({
        success: true,
        message: 'TronGrid API key saved. Please manually configure the webhook URL in TronGrid Dashboard.',
        webhook_url,
      });
    }
  } catch (error: any) {
    console.error('Stream setup error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/wallet/networks/:id/stream/sync
 * Batch sync all active addresses for this network to Moralis Stream.
 */
router.post('/networks/:id/stream/sync', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const networkResult = await query(
      `SELECT id, chain_name, moralis_stream_id, webhook_api_key_encrypted, listener_mode
       FROM deposit_networks WHERE id = $1`,
      [id]
    );
    if (networkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Network not found' });
    }
    const network = networkResult.rows[0];

    if (network.listener_mode !== 'stream') {
      return res.status(400).json({ error: 'Network is not in stream mode' });
    }

    const chainType = resolveChainType(network.chain_name);
    if (chainType === 'TRON') {
      return res.status(400).json({ error: 'TronGrid does not support programmatic address sync' });
    }

    if (!network.moralis_stream_id || !network.webhook_api_key_encrypted) {
      return res.status(400).json({ error: 'Moralis stream not configured. Please run setup first.' });
    }

    const apiKey = decrypt(network.webhook_api_key_encrypted);
    const addressesResult = await query(
      `SELECT address FROM user_deposit_addresses WHERE network_id = $1 AND is_active = true`,
      [id]
    );

    const syncErrors: string[] = [];
    for (const row of addressesResult.rows) {
      try {
        await addAddressToStream(apiKey, network.moralis_stream_id, row.address);
      } catch (err: any) {
        syncErrors.push(row.address);
        console.error(`Failed to sync address ${row.address}:`, err.message);
      }
    }

    res.json({
      success: true,
      message: `Synced ${addressesResult.rows.length - syncErrors.length}/${addressesResult.rows.length} addresses to Moralis Stream.`,
      sync_errors: syncErrors.length > 0 ? syncErrors : undefined,
    });
  } catch (error: any) {
    console.error('Stream sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/wallet/networks/:id/stream
 * Delete Moralis Stream and switch network back to polling mode.
 */
router.delete('/networks/:id/stream', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const networkResult = await query(
      `SELECT id, chain_name, moralis_stream_id, webhook_api_key_encrypted, listener_mode
       FROM deposit_networks WHERE id = $1`,
      [id]
    );
    if (networkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Network not found' });
    }
    const network = networkResult.rows[0];

    const chainType = resolveChainType(network.chain_name);
    if (chainType !== 'TRON' && network.moralis_stream_id && network.webhook_api_key_encrypted) {
      try {
        const apiKey = decrypt(network.webhook_api_key_encrypted);
        await deleteStream(apiKey, network.moralis_stream_id);
      } catch (err: any) {
        console.error('Failed to delete Moralis Stream (continuing):', err.message);
      }
    }

    await query(
      `UPDATE deposit_networks
       SET listener_mode = 'polling',
           moralis_stream_id = NULL,
           webhook_api_key_encrypted = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Stream deleted. Network switched back to polling mode.',
    });
  } catch (error: any) {
    console.error('Stream delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
