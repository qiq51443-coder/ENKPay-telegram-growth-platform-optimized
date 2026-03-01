import express from 'express';
import axios from 'axios';
import { query, transaction } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';

const router = express.Router();

/**
 * GET /api/admin/trading/pairs
 * Get all trading pairs (including inactive)
 */
router.get('/pairs', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT * FROM trading_pairs
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    );

    const countResult = await query('SELECT COUNT(*) FROM trading_pairs');

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
    console.error('Get pairs error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/trading/pairs/real
 * Add real trading pair (Binance)
 */
router.post('/pairs/real', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { symbol, display_name, binance_symbol, base_currency, quote_currency } = req.body;

    if (!symbol || !binance_symbol) {
      return res.status(400).json({ error: 'symbol and binance_symbol are required' });
    }

    // Validate binance_symbol exists on Binance API
    const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://api.binance.com';
    try {
      await axios.get(`${BINANCE_API_URL}/api/v3/ticker/price?symbol=${binance_symbol}`, { timeout: 5000 });
    } catch (validationError: any) {
      return res.status(400).json({ error: `Invalid binance_symbol: "${binance_symbol}" does not exist on Binance` });
    }

    const result = await query(
      `INSERT INTO trading_pairs 
       (symbol, display_name, pair_type, binance_symbol, base_currency, quote_currency)
       VALUES ($1, $2, 'real', $3, $4, $5)
       RETURNING *`,
      [symbol, display_name || symbol, binance_symbol, base_currency, quote_currency]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Real trading pair added successfully',
    });
  } catch (error: any) {
    console.error('Add real pair error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/trading/pairs/custom
 * Add custom trading pair (manual control)
 */
router.post('/pairs/custom', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { symbol, display_name, base_currency, quote_currency, initial_price } = req.body;

    if (!symbol || !initial_price) {
      return res.status(400).json({ error: 'symbol and initial_price are required' });
    }

    const result = await transaction(async (client) => {
      // Create pair
      const pairResult = await client.query(
        `INSERT INTO trading_pairs 
         (symbol, display_name, pair_type, base_currency, quote_currency)
         VALUES ($1, $2, 'custom', $3, $4)
         RETURNING *`,
        [symbol, display_name || symbol, base_currency, quote_currency]
      );

      const pair = pairResult.rows[0];

      // Add initial price point
      await client.query(
        `INSERT INTO price_points (pair_id, price, timestamp)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [pair.id, parseFloat(initial_price)]
      );

      return pair;
    });

    res.json({
      success: true,
      data: result,
      message: 'Custom trading pair added successfully',
    });
  } catch (error: any) {
    console.error('Add custom pair error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/trading/pairs/:id
 * Update trading pair
 */
router.put('/pairs/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const updateFields: any = {};
    const params: any[] = [];
    let paramCount = 1;

    const allowedFields = [
      'display_name',
      'binance_symbol',
      'base_currency',
      'quote_currency',
      'is_active',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateFields[field] = `$${paramCount}`;
        params.push(req.body[field]);
        paramCount++;
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const setClause = Object.keys(updateFields)
      .map((key) => `${key} = ${updateFields[key]}`)
      .join(', ');

    const result = await query(
      `UPDATE trading_pairs 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trading pair not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Trading pair updated successfully',
    });
  } catch (error: any) {
    console.error('Update pair error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/trading/pairs/:id
 * Delete trading pair (soft delete)
 */
router.delete('/pairs/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await query(
      'UPDATE trading_pairs SET is_active = false WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Trading pair deactivated successfully',
    });
  } catch (error: any) {
    console.error('Delete pair error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/trading/pairs/:id/price-points
 * Add manual price point for custom pair
 */
router.post('/pairs/:id/price-points', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { price, timestamp } = req.body;

    if (!price) {
      return res.status(400).json({ error: 'price is required' });
    }

    // Verify pair is custom type
    const pairResult = await query(
      'SELECT * FROM trading_pairs WHERE id = $1',
      [id]
    );

    if (pairResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trading pair not found' });
    }

    if (pairResult.rows[0].pair_type !== 'custom') {
      return res.status(400).json({ 
        error: 'Price points can only be manually added to custom pairs' 
      });
    }

    const result = await query(
      `INSERT INTO price_points (pair_id, price, timestamp)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, parseFloat(price), timestamp || new Date()]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Price point added successfully',
    });
  } catch (error: any) {
    console.error('Add price point error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/trading/pairs/:id/presets
 * Create price preset (predefined price movements)
 */
router.post('/pairs/:id/presets', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description, price_sequence, interval_seconds } = req.body;

    if (!name || !price_sequence) {
      return res.status(400).json({ error: 'name and price_sequence are required' });
    }

    // Verify pair exists
    const pairResult = await query(
      'SELECT * FROM trading_pairs WHERE id = $1',
      [id]
    );

    if (pairResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trading pair not found' });
    }

    const result = await query(
      `INSERT INTO price_presets 
       (pair_id, name, description, price_sequence, interval_seconds)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        id,
        name,
        description,
        JSON.stringify(price_sequence),
        interval_seconds || 60,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Price preset created successfully',
    });
  } catch (error: any) {
    console.error('Create preset error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/trading/presets/:id/activate
 * Activate price preset
 */
router.put('/presets/:id/activate', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await transaction(async (client) => {
      // Get preset
      const presetResult = await client.query(
        'SELECT * FROM price_presets WHERE id = $1',
        [id]
      );

      if (presetResult.rows.length === 0) {
        throw new Error('Price preset not found');
      }

      const preset = presetResult.rows[0];

      // Deactivate other presets for this pair
      await client.query(
        `UPDATE price_presets 
         SET is_active = false 
         WHERE pair_id = $1 AND id != $2`,
        [preset.pair_id, id]
      );

      // Activate this preset
      await client.query(
        `UPDATE price_presets 
         SET is_active = true, activated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [id]
      );

      // TODO: Trigger background job to apply price sequence

      return preset;
    });

    res.json({
      success: true,
      data: result,
      message: 'Price preset activated successfully',
    });
  } catch (error: any) {
    console.error('Activate preset error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/trading/sessions
 * Get all trading sessions
 */
router.get('/sessions', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 50, pair_id, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT 
        s.*,
        p.symbol,
        p.display_name
      FROM trading_sessions s
      JOIN trading_pairs p ON s.pair_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (pair_id) {
      params.push(pair_id);
      queryText += ` AND s.pair_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      queryText += ` AND s.status = $${params.length}`;
    }

    queryText += ` ORDER BY s.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/trading/sessions
 * Create trading session
 */
router.post('/sessions', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { pair_id, start_time, end_time, settlement_time } = req.body;

    if (!pair_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO trading_sessions 
       (pair_id, start_time, end_time, settlement_time, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [pair_id, start_time, end_time, settlement_time]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Trading session created successfully',
    });
  } catch (error: any) {
    console.error('Create session error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/trading/rules
 * List all trading rules
 */
router.get('/rules', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const result = await query(
      `SELECT 
         tr.*,
         tp.symbol as pair_symbol,
         tp.display_name as pair_display_name
       FROM trading_rules tr
       LEFT JOIN trading_pairs tp ON tr.pair_id = tp.id
       ORDER BY tr.created_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    );

    const countResult = await query('SELECT COUNT(*) FROM trading_rules');

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
    console.error('Get rules error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/trading/rules
 * Create trading rule
 */
router.post('/rules', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      pair_id,
      session_id,
      rule_name,
      direction,
      odds = 1.95,
      min_bet = 1.0,
      max_bet = 10000.0,
      duration_seconds = 60,
      is_active = true,
    } = req.body;

    if (!pair_id || !rule_name || !direction) {
      return res.status(400).json({
        error: 'pair_id, rule_name, and direction are required',
      });
    }

    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({
        error: 'direction must be "up" or "down"',
      });
    }

    const result = await query(
      `INSERT INTO trading_rules 
       (pair_id, session_id, rule_name, direction, odds, min_bet, max_bet, 
        duration_seconds, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        pair_id,
        session_id || null,
        rule_name,
        direction,
        odds,
        min_bet,
        max_bet,
        duration_seconds,
        is_active,
        req.user?.id || null,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Trading rule created successfully',
    });
  } catch (error: any) {
    console.error('Create rule error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/trading/rules/:id
 * Update trading rule
 */
router.put('/rules/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const updateFields: any = {};
    const params: any[] = [];
    let paramCount = 1;

    const allowedFields = [
      'rule_name',
      'direction',
      'odds',
      'min_bet',
      'max_bet',
      'duration_seconds',
      'is_active',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateFields[field] = `$${paramCount}`;
        params.push(req.body[field]);
        paramCount++;
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    const setClause = Object.keys(updateFields)
      .map((key) => `${key} = ${updateFields[key]}`)
      .join(', ');

    const result = await query(
      `UPDATE trading_rules 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trading rule not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Trading rule updated successfully',
    });
  } catch (error: any) {
    console.error('Update rule error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/trading/rules/:id
 * Delete trading rule
 */
router.delete('/rules/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM trading_rules WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Trading rule deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete rule error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/trading/sessions
 * Get all trading sessions with settlement info
 */
router.get('/sessions', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = '';
    const params: any[] = [Number(limit), offset];
    
    if (status) {
      whereClause = 'WHERE ts.status = $3';
      params.push(status);
    }

    const result = await query(
      `SELECT 
         ts.*,
         tp.symbol as pair_symbol,
         tp.display_name as pair_display_name,
         tr.rule_name,
         tr.direction as rule_direction,
         tr.odds as rule_odds
       FROM trading_sessions ts
       JOIN trading_pairs tp ON ts.pair_id = tp.id
       LEFT JOIN trading_rules tr ON ts.rule_id = tr.id
       ${whereClause}
       ORDER BY ts.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    const countQuery = status
      ? 'SELECT COUNT(*) FROM trading_sessions WHERE status = $1'
      : 'SELECT COUNT(*) FROM trading_sessions';
    const countParams = status ? [status] : [];
    const countResult = await query(countQuery, countParams);

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
    console.error('Get sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/trading/sessions/:id/settle
 * Manually settle a trading session
 */
router.post('/sessions/:id/settle', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { result_direction, settlement_price } = req.body;

    if (!result_direction || !settlement_price) {
      return res.status(400).json({
        error: 'result_direction and settlement_price are required',
      });
    }

    if (!['up', 'down'].includes(result_direction)) {
      return res.status(400).json({
        error: 'result_direction must be "up" or "down"',
      });
    }

    const { settleSession } = require('../services/trading-settlement.service');
    const result = await settleSession(
      parseInt(id),
      result_direction,
      parseFloat(settlement_price)
    );

    res.json({
      success: true,
      data: result,
      message: 'Session settled successfully',
    });
  } catch (error: any) {
    console.error('Settle session error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
