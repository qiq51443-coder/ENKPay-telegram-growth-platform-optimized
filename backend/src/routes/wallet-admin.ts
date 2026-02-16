import express from 'express';
import { query, transaction } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { encrypt, decrypt, addManualDepositAddress } from '../services/deposit.service';

const router = express.Router();

/**
 * GET /api/admin/wallet/networks
 * Get all deposit networks
 */
router.get('/networks', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT 
         id, network_name, network_display, chain_name, currency,
         master_address, hd_derivation_path, min_confirmations,
         scan_interval_seconds, min_deposit_amount, deposit_fee,
         is_active, sort_order, explorer_url, created_at, updated_at
       FROM deposit_networks
       ORDER BY sort_order, id`
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
      deposit_fee = 0,
      explorer_url,
      sort_order = 0,
    } = req.body;

    if (!network_name || !network_display || !chain_name || !hd_derivation_path) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const encryptedMnemonic = hd_mnemonic ? encrypt(hd_mnemonic) : null;

    const result = await query(
      `INSERT INTO deposit_networks 
       (network_name, network_display, chain_name, currency, master_address,
        hd_derivation_path, hd_mnemonic_encrypted, min_confirmations,
        scan_interval_seconds, min_deposit_amount, deposit_fee, explorer_url, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        deposit_fee,
        explorer_url,
        sort_order,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
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
      'deposit_fee',
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
      JOIN deposit_networks dn ON uda.network_id = dn.id
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
      JOIN deposit_networks dn ON dr.network_id = dn.id
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

    res.json({
      success: true,
      data: result.rows,
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
        wr.*,
        u.username, u.first_name, u.robot_user_id,
        dn.network_name, dn.network_display
      FROM withdrawal_records wr
      JOIN users u ON wr.user_id = u.id
      JOIN deposit_networks dn ON wr.network_id = dn.id
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

    res.json({
      success: true,
      data: result.rows,
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

      return { action };
    });

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
        tu.username as to_username, tu.first_name as to_first_name
      FROM transfer_records tr
      LEFT JOIN users fu ON tr.from_user_id = fu.id
      LEFT JOIN users tu ON tr.to_user_id = tu.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (user_id) {
      params.push(user_id);
      queryText += ` AND (tr.from_user_id = $${params.length} OR tr.to_user_id = $${params.length})`;
    }

    queryText += ` ORDER BY tr.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get transfers error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
