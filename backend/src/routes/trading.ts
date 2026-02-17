import express from 'express';
import { query, transaction } from '../db';
import { authenticateBot, AuthRequest } from '../middleware/auth';
import { getPairPrice, getKlineData, getCachedKlineData } from '../services/price.service';
import { triggerFirstTradeReward } from '../services/invitation-reward.service';

const router = express.Router();

/**
 * GET /api/trading/pairs
 * List active trading pairs
 */
router.get('/pairs', async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         id, symbol, display_name, pair_type, base_currency, quote_currency,
         binance_symbol, is_active, created_at
       FROM trading_pairs
       WHERE is_active = true
       ORDER BY display_name`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get pairs error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trading/pairs/:id/price
 * Get current price for trading pair
 */
router.get('/pairs/:id/price', async (req, res) => {
  try {
    const { id } = req.params;

    // Get price using price service
    const priceData = await getPairPrice(parseInt(id));

    res.json({
      success: true,
      data: priceData,
    });
  } catch (error: any) {
    console.error('Get price error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trading/pairs/:id/kline
 * Get kline/candlestick data
 */
router.get('/pairs/:id/kline', async (req, res) => {
  try {
    const { id } = req.params;
    const { interval = '1m', limit = 100 } = req.query;

    // TODO: Implement kline aggregation based on interval
    const result = await query(
      `SELECT 
         timestamp,
         price as close,
         price as open,
         price as high,
         price as low,
         0 as volume
       FROM price_points
       WHERE pair_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [id, Number(limit)]
    );

    res.json({
      success: true,
      data: result.rows.reverse(),
    });
  } catch (error: any) {
    console.error('Get kline error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trading/sessions
 * Get current and upcoming trading sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const { pair_id } = req.query;

    let queryText = `
      SELECT 
        s.*,
        p.symbol,
        p.display_name
      FROM trading_sessions s
      JOIN trading_pairs p ON s.pair_id = p.id
      WHERE s.status IN ('pending', 'active')
    `;
    const params: any[] = [];

    if (pair_id) {
      params.push(pair_id);
      queryText += ` AND s.pair_id = $${params.length}`;
    }

    queryText += ` ORDER BY s.start_time`;

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
 * POST /api/trading/sessions/:id/order
 * Place trading order for session
 */
router.post('/sessions/:id/order', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { user_id, direction, amount } = req.body;

    if (!user_id || !direction || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: 'Invalid direction. Must be up or down' });
    }

    const orderAmount = parseFloat(amount);
    if (orderAmount <= 0) {
      return res.status(400).json({ error: 'Invalid order amount' });
    }

    const result = await transaction(async (client) => {
      // Get session details
      const sessionResult = await client.query(
        `SELECT s.*, p.symbol, p.display_name 
         FROM trading_sessions s
         JOIN trading_pairs p ON s.pair_id = p.id
         WHERE s.id = $1`,
        [id]
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Trading session not found');
      }

      const session = sessionResult.rows[0];

      // Verify session is active and accepting orders
      if (session.status !== 'active') {
        throw new Error('Trading session is not active');
      }

      const now = new Date();
      if (now < new Date(session.start_time) || now > new Date(session.end_time)) {
        throw new Error('Trading session is not in valid time range');
      }

      // Get trading rule for this session (if exists)
      let ruleId = session.rule_id;
      let odds = 1.95; // Default odds
      let minBet = 1.0;
      let maxBet = 10000.0;

      if (ruleId) {
        const ruleResult = await client.query(
          `SELECT id, odds, min_bet, max_bet, is_active
           FROM trading_rules
           WHERE id = $1`,
          [ruleId]
        );

        if (ruleResult.rows.length > 0 && ruleResult.rows[0].is_active) {
          const rule = ruleResult.rows[0];
          odds = parseFloat(rule.odds);
          minBet = parseFloat(rule.min_bet);
          maxBet = parseFloat(rule.max_bet);
        }
      }

      // Check min/max bet amounts
      if (orderAmount < minBet) {
        throw new Error(`Minimum bet amount is ${minBet}`);
      }
      if (orderAmount > maxBet) {
        throw new Error(`Maximum bet amount is ${maxBet}`);
      }

      // Get user balance
      const userResult = await client.query(
        'SELECT wallet_balance FROM users WHERE id = $1',
        [user_id]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      if (userResult.rows[0].wallet_balance < orderAmount) {
        throw new Error('Insufficient balance');
      }

      // Get current price
      const priceResult = await client.query(
        `SELECT price FROM price_points 
         WHERE pair_id = $1 
         ORDER BY timestamp DESC 
         LIMIT 1`,
        [session.pair_id]
      );

      if (priceResult.rows.length === 0) {
        throw new Error('Price data not available');
      }

      const entryPrice = parseFloat(priceResult.rows[0].price);

      // Deduct balance
      await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance - $1
         WHERE id = $2`,
        [orderAmount, user_id]
      );

      // Create order with rule_id and odds
      const orderResult = await client.query(
        `INSERT INTO trading_orders 
         (session_id, user_id, pair_id, direction, amount, entry_price, rule_id, odds, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
         RETURNING *`,
        [id, user_id, session.pair_id, direction, orderAmount, entryPrice, ruleId, odds]
      );

      // Trigger first trade reward for referrer
      await triggerFirstTradeReward(client, user_id);

      return orderResult.rows[0];
    });

    res.json({
      success: true,
      data: result,
      message: 'Order placed successfully',
    });
  } catch (error: any) {
    console.error('Place order error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trading/my-orders
 * Get user's trading orders
 */
router.get('/my-orders', authenticateBot, async (req: AuthRequest, res) => {
  try {
    const { user_id, page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    let queryText = `
      SELECT 
        o.*,
        p.symbol,
        p.display_name,
        s.start_time as session_start,
        s.end_time as session_end,
        s.status as session_status
      FROM trading_orders o
      JOIN trading_pairs p ON o.pair_id = p.id
      JOIN trading_sessions s ON o.session_id = s.id
      WHERE o.user_id = $1
    `;
    const params: any[] = [user_id];

    if (status) {
      params.push(status);
      queryText += ` AND o.status = $${params.length}`;
    }

    queryText += ` ORDER BY o.created_at DESC`;
    params.push(Number(limit), offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(queryText, params);

    let countQuery = 'SELECT COUNT(*) FROM trading_orders WHERE user_id = $1';
    const countParams: any[] = [user_id];
    if (status) {
      countParams.push(status);
      countQuery += ' AND status = $2';
    }

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
    console.error('Get orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
