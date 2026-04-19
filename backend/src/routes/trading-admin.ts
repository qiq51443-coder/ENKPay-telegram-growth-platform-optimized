import express from 'express';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { query, transaction } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';
import { syncBinanceSymbols, getSymbolLibrary } from '../services/symbol-library.service';
import { subscribeAdditionalPairs, unsubscribePairs } from '../services/price-ws.service';
import { getDayOpenPrice, binanceFetch } from '../services/price.service';
import { coinIconUpload, toPublicUrl, UPLOAD_ROOT } from '../services/storage.service';

const router = express.Router();

function toOkxInstId(binanceSymbol: string): string {
  for (const quote of ['USDT', 'USDC', 'BTC', 'ETH', 'BNB']) {
    if (binanceSymbol.endsWith(quote)) {
      const base = binanceSymbol.slice(0, -quote.length);
      return `${base}-${quote}`;
    }
  }
  return binanceSymbol.slice(0, -4) + '-' + binanceSymbol.slice(-4);
}

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
       ORDER BY sort_order ASC, created_at DESC
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

    // Validate binance_symbol format (alphanumeric only) and check existence on OKX
    if (!/^[A-Z0-9]+$/.test(binance_symbol)) {
      return res.status(400).json({ error: 'binance_symbol must be alphanumeric uppercase (e.g. BTCUSDT)' });
    }
    const OKX_BASE = process.env.OKX_API_URL || 'https://www.okx.com';
    try {
      const instId = toOkxInstId(binance_symbol);
      const r = await axios.get(`${OKX_BASE}/api/v5/market/ticker?instId=${instId}`, { timeout: 5000 });
      if (r.data?.code !== '0' || !r.data?.data?.length) {
        return res.status(400).json({ error: `Invalid symbol: "${binance_symbol}" not found on OKX` });
      }
    } catch (validationError: any) {
      console.warn(`[trading-admin] OKX symbol validation failed for ${binance_symbol}:`, validationError.message);
    }

    const effectiveName = display_name || symbol;

    // Attempt to auto-fetch icon URL from CoinCap (non-fatal)
    let iconUrl: string | null = null;
    const baseAsset = (base_currency || (binance_symbol || '').replace(/USDT$|BTC$|ETH$|BNB$/i, '')).toLowerCase();
    try {
      const iconCandidates = [
        `https://assets.coincap.io/assets/icons/${baseAsset}@2x.png`,
        `https://cryptoicons.org/api/icon/${baseAsset}/200`,
      ];
      for (const url of iconCandidates) {
        try {
          const r = await axios.head(url, { timeout: 3000 });
          if (r.status === 200) { iconUrl = url; break; }
        } catch { /* try next */ }
      }
    } catch { /* ignore icon errors */ }

    const result = await query(
      `INSERT INTO trading_pairs 
       (symbol, name, display_name, pair_type, binance_symbol, base_currency, quote_currency, icon_url)
       VALUES ($1, $2, $3, 'real', $4, $5, $6, $7)
       RETURNING *`,
      [symbol, effectiveName, effectiveName, binance_symbol, base_currency, quote_currency, iconUrl]
    );

    try {
      subscribeAdditionalPairs([binance_symbol]);
    } catch (wsErr: any) {
      console.warn('[trading-admin] subscribeAdditionalPairs failed:', wsErr?.message || wsErr);
    }

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
    const { symbol, display_name, base_currency, quote_currency, initial_price, icon_url } = req.body;

    if (!symbol || !initial_price) {
      return res.status(400).json({ error: 'symbol and initial_price are required' });
    }

    const result = await transaction(async (client) => {
      // Create pair
      const effectiveName = display_name || symbol;
      const pairResult = await client.query(
        `INSERT INTO trading_pairs 
         (symbol, name, display_name, pair_type, base_currency, quote_currency, custom_initial_price, icon_url)
         VALUES ($1, $2, $3, 'custom', $4, $5, $6, $7)
         RETURNING *`,
        [symbol, effectiveName, effectiveName, base_currency, quote_currency, parseFloat(initial_price), icon_url || null]
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
 * PUT /api/admin/trading/pairs/sort-order
 * Batch-update sort_order for trading pairs (atomic transaction)
 * Body: { orders: [{ id: number, sort_order: number }, ...] }
 */
router.put('/pairs/sort-order', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'orders must be a non-empty array of { id, sort_order }' });
    }

    await transaction(async (client) => {
      for (const item of orders) {
        if (item.id === undefined || item.sort_order === undefined) continue;
        await client.query(
          'UPDATE trading_pairs SET sort_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [Number(item.sort_order), item.id]
        );
      }
    });

    res.json({ success: true, message: 'Sort order updated' });
  } catch (error: any) {
    console.error('Update sort order error:', error);
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
 * Permanently delete a trading pair and all associated data
 */
router.delete('/pairs/:id', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Refuse to delete if there are active trading sessions for this pair
    const activeSessions = await query(
      `SELECT COUNT(*) FROM trading_sessions WHERE pair_id = $1 AND status = 'active'`,
      [id]
    );
    if (parseInt(activeSessions.rows[0].count) > 0) {
      return res.status(409).json({
        error: '该交易对存在进行中的交易场次，无法删除。请先等待或结算所有活跃场次。',
      });
    }

    const pairToDelete = await query(
      'SELECT binance_symbol FROM trading_pairs WHERE id = $1',
      [id]
    );
    const binanceSymbol: string | null = pairToDelete.rows[0]?.binance_symbol ?? null;

    // Hard delete — related rows (price_points, price_presets, trading_sessions,
    // trading_rules, trading_orders) have ON DELETE CASCADE in the schema.
    const result = await query(
      'DELETE FROM trading_pairs WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trading pair not found' });
    }

    if (binanceSymbol) {
      try {
        unsubscribePairs([binanceSymbol]);
      } catch (wsErr: any) {
        console.warn('[trading-admin] unsubscribePairs failed:', wsErr?.message || wsErr);
      }
    }

    res.json({
      success: true,
      message: 'Trading pair permanently deleted',
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
 * GET /api/admin/trading/pairs/:id/presets
 * Get price presets for a trading pair
 */
router.get('/pairs/:id/presets', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, name AS preset_name, description, price_sequence AS price_data,
              interval_seconds AS duration_seconds, is_active, created_at,
              NULL AS start_price, NULL AS end_price
       FROM price_presets
       WHERE pair_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    res.json({ presets: result.rows });
  } catch (error: any) {
    console.error('Get presets error:', error);
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
        COALESCE(p.display_name, p.name, p.symbol) as display_name
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

    // start_at/end_at mirror start_time/end_time for backward compatibility with
    // databases where migration 1008 has not yet been applied (start_at/end_at NOT NULL).
    const result = await query(
      `INSERT INTO trading_sessions 
       (pair_id, start_time, end_time, settlement_time, status, start_at, end_at)
       VALUES ($1, $2, $3, $4, 'pending', $2, $3)
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
         COALESCE(tp.display_name, tp.name, tp.symbol) as pair_display_name
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

    if (direction && !['up', 'down'].includes(direction)) {
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
        pair_id || null,
        session_id || null,
        rule_name || null,
        direction || null,
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
         COALESCE(tp.display_name, tp.name, tp.symbol) as pair_display_name,
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
    const { settlement_price } = req.body;

    if (!settlement_price) {
      return res.status(400).json({
        error: 'settlement_price is required',
      });
    }

    // Query the stored open_price so the settlement direction is computed correctly
    // even when the caller does not supply it explicitly.
    const sessionRow = await query(
      `SELECT open_price FROM trading_sessions WHERE id = $1`,
      [id]
    );
    const dbOpenPrice =
      sessionRow.rows.length > 0 && sessionRow.rows[0].open_price != null
        ? parseFloat(sessionRow.rows[0].open_price)
        : undefined;

    const { settleSession } = require('../services/trading-settlement.service');
    const result = await settleSession(
      id,
      parseFloat(settlement_price),
      dbOpenPrice
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

/**
 * GET /api/admin/trading/symbol-library
 * Get paginated symbol library with optional keyword search
 */
router.get('/symbol-library', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 50, keyword } = req.query;

    const result = await getSymbolLibrary(
      Number(page),
      Number(limit),
      keyword ? String(keyword) : undefined
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Get symbol library error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/trading/symbol-library/sync
 * Sync exchange trading pairs into the local symbol library (OKX-first)
 */
router.post('/symbol-library/sync', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const syncedCount = await syncBinanceSymbols();

    res.json({
      success: true,
      message: `Successfully synced ${syncedCount} symbols from OKX`,
      synced_count: syncedCount,
    });
  } catch (error: any) {
    console.error('Sync symbol library error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/trading/pairs/from-library
 * Batch-add trading pairs from the symbol library
 */
router.post('/pairs/from-library', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { symbols } = req.body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'symbols must be a non-empty array' });
    }

    const added: any[] = [];
    const skipped: string[] = [];
    const errors: Array<{ symbol: string; error: string }> = [];

    for (const sym of symbols) {
      try {
        // Look up symbol in library
        const libraryResult = await query(
          `SELECT symbol, base_asset, quote_asset, display_name
           FROM binance_symbol_library
           WHERE symbol = $1`,
          [sym]
        );

        if (libraryResult.rows.length === 0) {
          errors.push({ symbol: sym, error: 'Symbol not found in library' });
          continue;
        }

        const lib = libraryResult.rows[0];

        // Check if already exists in trading_pairs
        const existingResult = await query(
          `SELECT id FROM trading_pairs WHERE binance_symbol = $1`,
          [sym]
        );

        if (existingResult.rows.length > 0) {
          skipped.push(sym);
          continue;
        }

        // Insert into trading_pairs
        // $1: symbol (used as the platform identifier), $3: binance_symbol (same value)
        // Attempt to auto-fetch icon_url (non-fatal)
        let bulkIconUrl: string | null = null;
        const baseAsset = (lib.base_asset || sym.replace(/USDT$|BTC$|ETH$|BNB$/i, '')).toLowerCase();
        try {
          const r = await axios.head(`https://assets.coincap.io/assets/icons/${baseAsset}@2x.png`, { timeout: 2000 });
          if (r.status === 200) bulkIconUrl = `https://assets.coincap.io/assets/icons/${baseAsset}@2x.png`;
        } catch { /* ignore */ }

        const insertResult = await query(
          `INSERT INTO trading_pairs
             (symbol, name, display_name, pair_type, binance_symbol, base_currency, quote_currency, is_active, icon_url)
           VALUES ($1, $2, $3, 'real', $4, $5, $6, true, $7)
            RETURNING *`,
          [
            sym,                         // symbol (platform identifier)
            lib.display_name || sym,     // name
            lib.display_name || sym,     // display_name
            sym,                         // binance_symbol
            lib.base_asset,              // base_currency
            lib.quote_asset,             // quote_currency
            bulkIconUrl,                 // icon_url
          ]
        );

        added.push(insertResult.rows[0]);
      } catch (err: any) {
        errors.push({ symbol: sym, error: err.message });
      }
    }

    const addedSymbols = added.map((p) => p.binance_symbol).filter(Boolean);
    if (addedSymbols.length > 0) {
      try {
        subscribeAdditionalPairs(addedSymbols);
      } catch (wsErr: any) {
        console.warn('[trading-admin] subscribeAdditionalPairs (bulk) failed:', wsErr?.message || wsErr);
      }
    }

    res.json({
      success: true,
      added,
      skipped,
      errors,
    });
  } catch (error: any) {
    console.error('Add pairs from library error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/admin/trading/pairs/:id/toggle
 * Toggle is_active status for a trading pair
 */
router.patch('/pairs/:id/toggle', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE trading_pairs
       SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, symbol, is_active`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trading pair not found' });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Toggle pair error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/trading/upload-icon
 * Upload a coin icon without binding to a specific pair — returns a persistent URL
 * Used by the Ant Design Upload component with action prop (for create form)
 */
router.post('/upload-icon', authenticateAdmin, adminLimiter, coinIconUpload.single('file'), (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ success: true, url: toPublicUrl(req.file.path) });
});

/**
 * POST /api/admin/trading/pairs/:id/icon
 * Upload a custom icon for a trading pair (multipart/form-data, field: icon)
 */
router.post(
  '/pairs/:id/icon',
  authenticateAdmin,
  coinIconUpload.single('icon'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      if (!req.file) {
        return res.status(400).json({ error: 'No icon file uploaded (field name: icon)' });
      }
      const iconUrl = toPublicUrl(req.file.path);

      // Delete old icon file if it was a locally-uploaded one
      const existing = await query('SELECT icon_url FROM trading_pairs WHERE id = $1', [id]);
      if (existing.rows.length > 0) {
        const oldIconUrl: string | null = existing.rows[0].icon_url;
        if (oldIconUrl && oldIconUrl.startsWith('/uploads/coin-icons/')) {
          const oldFilePath = path.join(UPLOAD_ROOT, oldIconUrl.replace(/^\/uploads\//, ''));
          fs.unlink(oldFilePath, (err) => { if (err) console.warn('Failed to delete old icon:', err.message); });
        }
      }

      const result = await query(
        'UPDATE trading_pairs SET icon_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING icon_url',
        [iconUrl, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Trading pair not found' });
      }
      res.json({ success: true, data: { icon_url: iconUrl } });
    } catch (error: any) {
      console.error('Upload icon error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/admin/trading/pairs/:id/icon/refresh
 * Re-fetch icon from CoinCap CDN for a real trading pair
 */
router.post('/pairs/:id/icon/refresh', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const pairResult = await query('SELECT * FROM trading_pairs WHERE id = $1', [id]);
    if (pairResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trading pair not found' });
    }
    const pair = pairResult.rows[0];
    const baseAsset = (pair.base_currency || (pair.binance_symbol || pair.symbol || '').replace(/USDT$|BTC$|ETH$|BNB$/i, '')).toLowerCase();
    let iconUrl: string | null = null;
    const iconCandidates = [
      `https://assets.coincap.io/assets/icons/${baseAsset}@2x.png`,
      `https://cryptoicons.org/api/icon/${baseAsset}/200`,
    ];
    for (const url of iconCandidates) {
      try {
        const r = await axios.head(url, { timeout: 3000 });
        if (r.status === 200) { iconUrl = url; break; }
      } catch { /* try next */ }
    }
    if (!iconUrl) {
      return res.status(404).json({ error: 'Could not find icon from CDN for this symbol' });
    }
    const result = await query(
      'UPDATE trading_pairs SET icon_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [iconUrl, id]
    );
    res.json({ success: true, data: result.rows[0], icon_url: iconUrl });
  } catch (error: any) {
    console.error('Refresh icon error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trading-admin/orders
 * Admin: query all trading orders with pagination and filters
 */
router.get('/orders', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { page = 1, limit = 20, status, pair_id, start_date, end_date } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let queryText = `
      SELECT
        o.id,
        o.user_id,
        u.username,
        u.telegram_id,
        o.pair_id,
        tp.symbol,
        COALESCE(tp.display_name, tp.name, tp.symbol) AS display_name,
        o.direction,
        o.amount,
        o.entry_price,
        o.close_price,
        o.settlement_price,
        o.odds,
        o.status,
        o.result,
        o.profit,
        o.created_at,
        o.settled_at,
        o.session_id,
        s.period_label,
        s.duration_seconds as session_duration_seconds,
        s.open_price AS session_open_price,
        s.settlement_price AS session_close_price
      FROM trading_orders o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN trading_pairs tp ON tp.id = o.pair_id
      LEFT JOIN trading_sessions s ON s.id = o.session_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) { params.push(status); queryText += ` AND o.status = $${params.length}`; }
    if (pair_id) { params.push(Number(pair_id)); queryText += ` AND o.pair_id = $${params.length}`; }
    if (start_date) { params.push(start_date); queryText += ` AND o.created_at >= $${params.length}`; }
    if (end_date) { params.push(end_date); queryText += ` AND o.created_at <= $${params.length}`; }

    queryText += ` ORDER BY o.created_at DESC`;
    params.push(Number(limit));
    queryText += ` LIMIT $${params.length}`;
    params.push(offset);
    queryText += ` OFFSET $${params.length}`;

    const result = await query(queryText, params);

    // Count query
    let countText = `SELECT COUNT(*) FROM trading_orders o WHERE 1=1`;
    const countParams: any[] = [];
    if (status) { countParams.push(status); countText += ` AND o.status = $${countParams.length}`; }
    if (pair_id) { countParams.push(Number(pair_id)); countText += ` AND o.pair_id = $${countParams.length}`; }
    if (start_date) { countParams.push(start_date); countText += ` AND o.created_at >= $${countParams.length}`; }
    if (end_date) { countParams.push(end_date); countText += ` AND o.created_at <= $${countParams.length}`; }
    const countResult = await query(countText, countParams);

    res.json({
      success: true,
      data: result.rows,
      pagination: { page: Number(page), limit: Number(limit), total: parseInt(countResult.rows[0].count) },
    });
  } catch (error: any) {
    console.error('Admin get orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trading-admin/sessions/today-results
 * Admin: get ALL period slots from UTC midnight to now for a pair.
 * Slots that have a DB session record return the real data (open_price, settlement_price,
 * result_direction, up/down order counts).  Slots with no DB record are synthesised from
 * Binance 1-minute kline data so the admin panel can always see every period of the day.
 */
router.get('/sessions/today-results', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { pair_id } = req.query;

    if (!pair_id) {
      return res.status(400).json({ error: 'pair_id is required' });
    }

    const pairNumId = Number(pair_id);

    // Fetch pair info for Binance kline lookup
    const pairResult = await query(
      `SELECT id, pair_type, binance_symbol FROM trading_pairs WHERE id = $1`,
      [pairNumId]
    );
    if (!pairResult.rows.length) {
      return res.status(404).json({ error: 'Pair not found' });
    }
    const pair = pairResult.rows[0];

    // Query all existing DB sessions for this pair today (any status)
    const dbSessionsResult = await query(
      `SELECT
         ts.id,
         ts.period_label,
         ts.start_time,
         ts.end_time,
         ts.duration_seconds,
         ts.open_price,
         ts.settlement_price,
         ts.result_direction,
         ts.status,
         COUNT(CASE WHEN "to".direction = 'up' THEN 1 END) AS up_count,
         COUNT(CASE WHEN "to".direction = 'down' THEN 1 END) AS down_count
       FROM trading_sessions ts
       LEFT JOIN trading_orders "to" ON "to".session_id = ts.id
         AND "to".status IN ('active', 'pending', 'settled')
       WHERE ts.pair_id = $1
         AND ts.start_time >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
       GROUP BY ts.id
       ORDER BY ts.start_time DESC`,
      [pairNumId]
    );

    // Build a lookup map: slot start time (truncated to second, as epoch ms) → DB row
    const dbSessionMap = new Map<number, any>();
    // Fallback map keyed by period_label for sessions that have one
    const dbSessionByLabel = new Map<string, any>();
    for (const s of dbSessionsResult.rows) {
      // Truncate to second precision to avoid sub-second mismatch
      const startMs = Math.round(new Date(s.start_time).getTime() / 1000) * 1000;
      dbSessionMap.set(startMs, s);
      if (s.period_label) {
        dbSessionByLabel.set(s.period_label, s);
      }
    }

    // Determine day boundaries
    const nowMs = Date.now();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();

    // Batch-fetch 1-minute klines from Binance for real pairs (covers open + close of every slot)
    // We store a map of klineStartMs → { open, close }
    const klineMap = new Map<number, { open: number; close: number }>();

    if (pair.pair_type === 'real' && pair.binance_symbol) {
      try {
        const BATCH_SIZE = 1000;
        let fetchFrom = dayStartMs;
        let keepFetching = true;

        while (keepFetching) {
          const klines = await binanceFetch('/api/v3/klines', {
            symbol: pair.binance_symbol,
            interval: '1m',
            startTime: fetchFrom,
            limit: BATCH_SIZE,
          });

          if (!Array.isArray(klines) || klines.length === 0) break;

          for (const k of klines) {
            klineMap.set(Number(k[0]), { open: parseFloat(k[1]), close: parseFloat(k[4]) });
          }

          if (klines.length < BATCH_SIZE) {
            keepFetching = false;
          } else {
            // Advance past the last returned candle
            fetchFrom = Number(klines[klines.length - 1][0]) + 60000;
            if (fetchFrom > nowMs) keepFetching = false;
          }
        }
      } catch (klineErr: any) {
        console.warn(`[today-results] Binance kline batch fetch failed for ${pair.binance_symbol}: ${klineErr.message}`);
        // Proceed with whatever klines were fetched; DB sessions are still returned correctly
      }
    }

    // Helper to compute period_label string matching period.service.ts format: YYYYMMDD-NNN
    function makePeriodLabel(slotStartMs: number, durationSeconds: number): string {
      const dayStartMs = Math.floor(slotStartMs / 86_400_000) * 86_400_000;
      const periodNumber = Math.floor((slotStartMs - dayStartMs) / (durationSeconds * 1000)) + 1;
      const d = new Date(dayStartMs);
      const yy = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${yy}${mo}${dd}-${String(periodNumber).padStart(3, '0')}`;
    }

    // Generate all slots for all three durations, merging with DB data
    const DURATIONS = [60, 300, 600];
    const allSlots: any[] = [];

    for (const duration of DURATIONS) {
      const durationMs = duration * 1000;
      let slotStart = dayStartMs;

      // Include every slot that has already started (slotStart <= nowMs).
      // Slots whose end_time is in the future are emitted as status='active' (no settlement data).
      while (slotStart <= nowMs) {
        const slotEnd = slotStart + durationMs;
        // Round to second precision for map lookup
        const keyMs = Math.round(slotStart / 1000) * 1000;
        // Match DB session by start_time first, then fall back to period_label
        const dbSession = dbSessionMap.get(keyMs) ?? dbSessionByLabel.get(makePeriodLabel(slotStart, duration));

        if (dbSession) {
          // DB record exists — use its data as-is
          allSlots.push(dbSession);
        } else {
          // Generate a virtual slot from Binance klines
          const isPast = slotEnd <= nowMs;

          let openPrice: number | null = null;
          let closePrice: number | null = null;
          let resultDirection: string | null = null;
          let status: string;

          if (pair.pair_type === 'real' && pair.binance_symbol) {
            // Open price: kline[1] (open) of the 1m candle that starts at slotStart
            const openKline = klineMap.get(slotStart);
            if (openKline) openPrice = openKline.open;

            if (isPast) {
              // Close price: kline[4] (close) of the 1m candle whose close time equals slotEnd.
              // A Binance 1m kline starting at T covers [T, T+59999ms], so the last candle
              // before slotEnd starts at slotEnd - 60000.
              const closeKlineStart = slotEnd - 60000;
              const closeKline = klineMap.get(closeKlineStart);
              if (closeKline) closePrice = closeKline.close;

              if (openPrice !== null && closePrice !== null) {
                if (closePrice > openPrice) resultDirection = 'up';
                else if (closePrice < openPrice) resultDirection = 'down';
                else resultDirection = 'draw';
              }
              status = 'no_orders';
            } else {
              // Currently running period
              status = 'active';
            }
          } else {
            // Custom pairs: we can't compute prices server-side without price_points
            status = isPast ? 'no_orders' : 'active';
          }

          const startDate = new Date(slotStart);
          allSlots.push({
            id: null,
            period_label: makePeriodLabel(slotStart, duration),
            start_time: startDate.toISOString(),
            end_time: new Date(slotEnd).toISOString(),
            duration_seconds: duration,
            open_price: openPrice !== null ? String(openPrice) : null,
            settlement_price: closePrice !== null ? String(closePrice) : null,
            result_direction: resultDirection,
            status,
            up_count: '0',
            down_count: '0',
          });
        }

        slotStart += durationMs;
      }
    }

    // Sort newest first (consistent with original query ordering)
    allSlots.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

    res.json({
      success: true,
      data: allSlots,
    });
  } catch (error: any) {
    console.error('Get today results error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/trading/sessions/stuck
 * Return sessions in 'active' or 'pending' state that have passed their end_time — useful for monitoring.
 */
router.get('/sessions/stuck', adminLimiter, authenticateAdmin, async (_req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT
         ts.id,
         ts.pair_id,
         tp.symbol,
         ts.status,
         ts.start_time,
         ts.end_time,
         ts.open_price,
         ts.settlement_price,
         EXTRACT(EPOCH FROM (NOW() - ts.end_time)) / 60 AS expired_minutes_ago
       FROM trading_sessions ts
       LEFT JOIN trading_pairs tp ON ts.pair_id = tp.id
       WHERE ts.end_time <= NOW()
         AND ts.status IN ('active', 'pending')
       ORDER BY ts.end_time ASC
       LIMIT 100`,
      []
    );
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (error: any) {
    console.error('Get stuck sessions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/trading/pairs-with-open-price
 * Return all active trading pairs together with the open_price of their current active session.
 * Used by the admin panel to display live pair status without multiple round-trips.
 */
router.get('/pairs-with-open-price', adminLimiter, authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT
         tp.id,
         tp.symbol,
         tp.name,
         COALESCE(tp.display_name, tp.name, tp.symbol) AS display_name,
         tp.pair_type,
         tp.binance_symbol,
         tp.is_active,
         tp.sort_order,
         tp.current_price,
         tp.price_change_24h,
         ts.id            AS session_id,
         ts.open_price,
         ts.start_time    AS session_start_time,
         ts.end_time      AS session_end_time,
         ts.duration_seconds
       FROM trading_pairs tp
       LEFT JOIN LATERAL (
         SELECT id, open_price, start_time, end_time, duration_seconds, status
         FROM trading_sessions
         WHERE pair_id = tp.id
           AND status IN ('active', 'pending')
         ORDER BY end_time ASC
         LIMIT 1
       ) ts ON true
       WHERE tp.is_active = true
       ORDER BY tp.sort_order ASC, tp.id ASC`,
      []
    );

    const rows = result.rows;

    // For real pairs with a binance_symbol, fetch today's UTC day open price in parallel
    const dayOpenPriceResults = await Promise.allSettled(
      rows.map((row: any) => {
        if (row.pair_type === 'real' && row.binance_symbol) {
          return getDayOpenPrice(row.binance_symbol);
        }
        return Promise.resolve(null);
      })
    );

    const data = rows.map((row: any, idx: number) => {
      const dayOpenResult = dayOpenPriceResults[idx];
      const day_open_price =
        dayOpenResult.status === 'fulfilled' && dayOpenResult.value != null
          ? String(dayOpenResult.value)
          : null;
      return { ...row, day_open_price };
    });

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get pairs with open price error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Result-mode control routes (three-mode settlement system)
// ---------------------------------------------------------------------------

/**
 * PUT /api/admin/trading/pairs/:id/result-mode
 * Set the result control mode for a custom trading pair.
 */
router.put('/pairs/:id/result-mode', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { mode, duration_seconds, preset_periods = 50, up_periods = 0, down_periods = 0 } = req.body;

    const validModes = ['random', 'preset', 'pay_more', 'pay_less'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: `mode 必须是以下之一: ${validModes.join(', ')}` });
    }
    const validDurations = [60, 300, 600];
    if (!validDurations.includes(Number(duration_seconds))) {
      return res.status(400).json({ error: 'duration_seconds 必须是 60、300 或 600 之一' });
    }
    if (Number(preset_periods) > 300 || Number(preset_periods) < 1) {
      return res.status(400).json({ error: 'preset_periods 范围为 1~300' });
    }

    // Mutual-exclusion check
    const pairRes = await query('SELECT result_mode_locked_duration FROM trading_pairs WHERE id = $1', [id]);
    if (pairRes.rows.length === 0) return res.status(404).json({ error: 'Trading pair not found' });

    const lockedDuration: number | null = pairRes.rows[0].result_mode_locked_duration;
    if (lockedDuration != null && lockedDuration !== Number(duration_seconds)) {
      const mins = Math.floor(lockedDuration / 60);
      return res.status(400).json({ error: `已有时段 ${mins}min 被锁定，请先清除该时段的设置` });
    }

    // Delete unconsumed schedule entries for this pair + duration
    await query(
      'DELETE FROM pair_result_schedule WHERE pair_id = $1 AND duration_seconds = $2 AND consumed = FALSE',
      [id, duration_seconds]
    );

    // Generate schedule entries based on mode
    const directions: ('up' | 'down')[] = [];
    if (mode === 'random') {
      for (let i = 0; i < Number(preset_periods); i++) {
        directions.push(Math.random() < 0.5 ? 'up' : 'down');
      }
    } else if (mode === 'preset') {
      const up = Number(up_periods);
      const down = Number(down_periods);
      const total = Number(preset_periods);
      if (up + down > total) {
        return res.status(400).json({ error: 'up_periods + down_periods 不能超过 preset_periods' });
      }
      const arr: ('up' | 'down')[] = [
        ...Array(up).fill('up' as const),
        ...Array(down).fill('down' as const),
        ...Array(total - up - down).fill('up' as const).map(() => Math.random() < 0.5 ? 'up' as const : 'down' as const),
      ];
      // Fisher-Yates shuffle
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      directions.push(...arr);
    }
    // pay_more / pay_less: generate 0 records (runtime dynamic)

    // Bulk insert schedule entries using fully parameterized query
    if (directions.length > 0) {
      const paramOffset = 3; // $1=pair_id, $2=duration_seconds, then $3...$N for directions
      const values = directions.map((_, idx) => `($1, $2, ${idx + 1}, $${paramOffset + idx})`).join(', ');
      await query(
        `INSERT INTO pair_result_schedule (pair_id, duration_seconds, seq, direction) VALUES ${values}`,
        [id, duration_seconds, ...directions]
      );
    }

    // Update trading_pairs
    const paramsJson = { preset_periods: Number(preset_periods), up_periods: Number(up_periods), down_periods: Number(down_periods) };
    await query(
      `UPDATE trading_pairs SET result_mode = $1, result_mode_params = $2, result_mode_locked_duration = $3 WHERE id = $4`,
      [mode, JSON.stringify(paramsJson), duration_seconds, id]
    );

    res.json({
      success: true,
      mode,
      locked_duration: Number(duration_seconds),
      preview: directions,
    });
  } catch (error: any) {
    console.error('Set result mode error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/trading/pairs/:id/result-preview
 * Get the upcoming result direction schedule for a custom pair.
 */
router.get('/pairs/:id/result-preview', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { duration_seconds } = req.query;

    const pairRes = await query(
      'SELECT result_mode, result_mode_params, result_mode_locked_duration FROM trading_pairs WHERE id = $1',
      [id]
    );
    if (pairRes.rows.length === 0) return res.status(404).json({ error: 'Trading pair not found' });

    const pair = pairRes.rows[0];
    const effectiveDuration = Number(duration_seconds) || pair.result_mode_locked_duration;

    // Unconsumed upcoming entries
    const unconsumedRes = await query(
      `SELECT seq, direction, consumed, period_label FROM pair_result_schedule
       WHERE pair_id = $1 AND duration_seconds = $2 AND consumed = FALSE
       ORDER BY seq ASC`,
      [id, effectiveDuration]
    );

    // Most recent 20 consumed entries
    const consumedRes = await query(
      `SELECT seq, direction, consumed, period_label FROM pair_result_schedule
       WHERE pair_id = $1 AND duration_seconds = $2 AND consumed = TRUE
       ORDER BY seq DESC LIMIT 20`,
      [id, effectiveDuration]
    );

    let nextDynamic: string | null = null;
    if (pair.result_mode === 'pay_more' || pair.result_mode === 'pay_less') {
      // Determine expected direction from current active session bets
      const activeBets = await query(
        `SELECT SUM(CASE WHEN o.direction='up' THEN o.amount ELSE 0 END) AS up_amount,
                SUM(CASE WHEN o.direction='down' THEN o.amount ELSE 0 END) AS down_amount
         FROM trading_sessions ts
         JOIN trading_orders o ON o.session_id = ts.id
         WHERE ts.pair_id = $1 AND ts.status IN ('active','pending')
           AND ts.duration_seconds = $2
           AND o.status IN ('active','pending')`,
        [id, effectiveDuration]
      );
      const upAmt = parseFloat(activeBets.rows[0]?.up_amount ?? '0');
      const downAmt = parseFloat(activeBets.rows[0]?.down_amount ?? '0');
      if (pair.result_mode === 'pay_more') {
        // favor majority (platform pays more to attract users)
        nextDynamic = upAmt >= downAmt ? 'up' : 'down';
      } else {
        // favor minority (platform profits more)
        nextDynamic = upAmt < downAmt ? 'up' : 'down';
      }
    }

    const preview = [
      ...consumedRes.rows.reverse().map((r: any) => ({ ...r, consumed: true })),
      ...unconsumedRes.rows.map((r: any) => ({ ...r, consumed: false })),
    ];

    res.json({
      success: true,
      mode: pair.result_mode,
      locked_duration: pair.result_mode_locked_duration,
      result_mode_params: pair.result_mode_params,
      next_dynamic: nextDynamic,
      preview,
    });
  } catch (error: any) {
    console.error('Get result preview error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/trading/pairs/:id/result-mode
 * Clear the result mode lock and all unconsumed schedule entries.
 */
router.delete('/pairs/:id/result-mode', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM pair_result_schedule WHERE pair_id = $1 AND consumed = FALSE', [id]);
    await query(
      `UPDATE trading_pairs SET result_mode = 'random', result_mode_locked_duration = NULL WHERE id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('Clear result mode error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
