import express from 'express';
import { query, transaction } from '../db';
import { authenticateBot, AuthRequest } from '../middleware/auth';
import { authenticateMiniApp, MiniAppAuthRequest } from '../middleware/miniapp-auth';
import { getPairPrice, getKlineData, getCachedKlineData, cacheKlineData } from '../services/price.service';
import { triggerFirstTradeReward } from '../services/invitation-reward.service';
import { autoUnlockRewardBalance } from '../services/balance.service';

const router = express.Router();

/**
 * GET /api/trading/pairs
 * List active trading pairs
 */
router.get('/pairs', async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         id, symbol, COALESCE(display_name, name, symbol) as display_name, pair_type, base_currency, quote_currency,
         binance_symbol, is_active, created_at
       FROM trading_pairs
       WHERE is_active = true
       ORDER BY COALESCE(display_name, name, symbol)`
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
    const pairId = parseInt(id);
    const limitNum = Number(limit);
    const intervalStr = String(interval);

    // Get pair type and binance symbol
    const pairResult = await query(
      `SELECT pair_type, binance_symbol FROM trading_pairs WHERE id = $1`,
      [pairId]
    );

    if (pairResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trading pair not found' });
    }

    const pair = pairResult.rows[0];
    let klineData;

    if (pair.pair_type === 'real' && pair.binance_symbol) {
      // Fetch real K-line data from Binance; fall back to empty array if unreachable
      try {
        klineData = await getKlineData(pair.binance_symbol, intervalStr, limitNum);
        // Async cache to DB without blocking response
        cacheKlineData(pairId, intervalStr, klineData).catch((err: any) => {
          console.error('Failed to cache kline data:', err);
        });
      } catch (binanceErr) {
        console.warn('Binance kline fetch failed, returning empty array:', binanceErr);
        klineData = [];
      }
    } else {
      // Return cached K-line data from DB for custom pairs
      klineData = await getCachedKlineData(pairId, intervalStr, limitNum);
    }

    res.json({
      success: true,
      data: klineData,
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
        COALESCE(p.display_name, p.name, p.symbol) as display_name
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
        `SELECT s.*, p.symbol, COALESCE(p.display_name, p.name, p.symbol) as display_name 
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
        'SELECT wallet_balance, COALESCE(red_packet_credits, 0) AS red_packet_credits FROM users WHERE id = $1',
        [user_id]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const walletBal = parseFloat(String(userResult.rows[0].wallet_balance ?? 0));
      const redPacketBal = parseFloat(String(userResult.rows[0].red_packet_credits ?? 0));
      const totalAvailable = walletBal + redPacketBal;
      if (totalAvailable < orderAmount) {
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

      // Deduct from red_packet_credits first, then wallet_balance
      const fromRedPacket = Math.min(redPacketBal, orderAmount);
      const fromWallet = orderAmount - fromRedPacket;
      if (fromRedPacket > 0) {
        await client.query(
          'UPDATE users SET red_packet_credits = red_packet_credits - $1 WHERE id = $2',
          [fromRedPacket, user_id]
        );
      }
      if (fromWallet > 0) {
        await client.query(
          'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
          [fromWallet, user_id]
        );
      }

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
        COALESCE(p.display_name, p.name, p.symbol) as display_name,
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

/**
 * GET /api/trading/rules
 * Get all active trading rules (no pair filter, for miniApp use)
 */
router.get('/rules', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, duration_seconds, odds, min_bet, max_bet, is_active
       FROM trading_rules
       WHERE is_active = true
       ORDER BY duration_seconds ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Get trading rules error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trading/pairs/:id/rules
 * Get trading rules for a pair, optionally filtered by duration
 */
router.get('/pairs/:id/rules', async (req, res) => {
  try {
    const { id } = req.params;
    const { duration } = req.query;

    let queryText = `
      SELECT id, duration_seconds, odds, min_bet, max_bet, is_active
      FROM trading_rules
      WHERE (pair_id = $1 OR pair_id IS NULL) AND is_active = true
    `;
    const params: any[] = [id];

    if (duration) {
      params.push(Number(duration));
      queryText += ` AND duration_seconds = $${params.length}`;
    }

    queryText += ' ORDER BY duration_seconds ASC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get rules error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/trading/quick-session
 * Create a quick trading session for a pair+duration and place an order atomically
 * Uses Telegram WebApp initData for authentication
 */
router.post('/quick-session', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const { pair_id, duration, direction, amount } = req.body;
    const telegramId = req.telegramUser?.id;

    if (!telegramId) {
      return res.status(401).json({ error: 'Unauthorized: no Telegram user' });
    }

    if (!pair_id || !duration || !direction || !amount) {
      return res.status(400).json({ error: 'Missing required fields: pair_id, duration, direction, amount' });
    }

    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: 'Invalid direction. Must be up or down' });
    }

    const orderAmount = parseFloat(amount);
    const durationSeconds = parseInt(duration, 10);

    if (isNaN(orderAmount) || orderAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      return res.status(400).json({ error: 'Invalid duration' });
    }

    // Look up the internal database user ID from the Telegram user ID (trusted from middleware)
    const userLookup = await query(
      `SELECT id FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [telegramId]
    );

    if (userLookup.rows.length === 0) {
      return res.status(404).json({ error: 'User not found. Please start the bot first.' });
    }

    const user_id = userLookup.rows[0].id;

    const result = await transaction(async (client) => {
      // Get trading pair
      const pairResult = await client.query(
        'SELECT id, symbol, display_name, is_active FROM trading_pairs WHERE id = $1',
        [pair_id]
      );
      if (pairResult.rows.length === 0 || !pairResult.rows[0].is_active) {
        throw new Error('Trading pair not found or inactive');
      }

      // Get applicable rule
      const ruleResult = await client.query(
        `SELECT id, odds, min_bet, max_bet
         FROM trading_rules
         WHERE pair_id = $1 AND duration_seconds = $2 AND is_active = true
         LIMIT 1`,
        [pair_id, durationSeconds]
      );

      let ruleId: number | null = null;
      let odds = 1.95;
      let minBet = 1.0;
      let maxBet = 10000.0;

      if (ruleResult.rows.length > 0) {
        const rule = ruleResult.rows[0];
        ruleId = rule.id;
        odds = parseFloat(rule.odds);
        minBet = parseFloat(rule.min_bet);
        maxBet = parseFloat(rule.max_bet);
      }

      if (orderAmount < minBet) throw new Error(`Minimum bet is ${minBet}`);
      if (orderAmount > maxBet) throw new Error(`Maximum bet is ${maxBet}`);

      // Check for existing active order on this pair
      const existingOrderResult = await client.query(
        `SELECT id FROM trading_orders 
         WHERE user_id = $1 AND pair_id = $2 AND status IN ('active', 'pending')
         LIMIT 1`,
        [user_id, pair_id]
      );
      if (existingOrderResult.rows.length > 0) {
        throw new Error('You already have an active order for this trading pair. Please wait for settlement before placing a new order.');
      }

      // Check user balance
      const userResult = await client.query(
        'SELECT wallet_balance, COALESCE(red_packet_credits, 0) AS red_packet_credits FROM users WHERE id = $1',
        [user_id]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      const walletBal = parseFloat(String(userResult.rows[0].wallet_balance ?? 0));
      const redPacketBal = parseFloat(String(userResult.rows[0].red_packet_credits ?? 0));
      const totalAvailable = walletBal + redPacketBal;
      if (totalAvailable < orderAmount) throw new Error('Insufficient balance');

      // Create a new session
      const now = new Date();
      const endTime = new Date(now.getTime() + durationSeconds * 1000);

      const sessionResult = await client.query(
        `INSERT INTO trading_sessions (pair_id, rule_id, status, start_time, end_time)
         VALUES ($1, $2, 'active', $3, $4)
         RETURNING *`,
        [pair_id, ruleId, now, endTime]
      );
      const session = sessionResult.rows[0];

      // Get current price
      const priceResult = await client.query(
        `SELECT price FROM price_points WHERE pair_id = $1 ORDER BY timestamp DESC LIMIT 1`,
        [pair_id]
      );
      if (priceResult.rows.length === 0) throw new Error('Price data not available');
      const entryPrice = parseFloat(priceResult.rows[0].price);

      // Deduct from red_packet_credits first, then wallet_balance
      const fromRedPacket = Math.min(redPacketBal, orderAmount);
      const fromWallet = orderAmount - fromRedPacket;
      if (fromRedPacket > 0) {
        await client.query(
          'UPDATE users SET red_packet_credits = red_packet_credits - $1 WHERE id = $2',
          [fromRedPacket, user_id]
        );
      }
      if (fromWallet > 0) {
        await client.query(
          'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
          [fromWallet, user_id]
        );
      }

      // Create order
      const orderResult = await client.query(
        `INSERT INTO trading_orders
         (session_id, user_id, pair_id, direction, amount, entry_price, rule_id, odds, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
         RETURNING *`,
        [session.id, user_id, pair_id, direction, orderAmount, entryPrice, ruleId, odds]
      );

      return {
        session,
        order: orderResult.rows[0],
        odds,
        expected_profit: parseFloat((orderAmount * odds - orderAmount).toFixed(2)),
      };
    });

    // Fire-and-forget: check if reward balance can be auto-unlocked after this trade
    autoUnlockRewardBalance(Number(user_id)).catch((err: any) =>
      console.error('[trading] autoUnlockRewardBalance failed:', err)
    );

    res.json({
      success: true,
      data: result,
      message: 'Session created and order placed successfully',
    });
  } catch (error: any) {
    console.error('Quick session error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trading/orders/my
 * Get the current user's trading orders (mini-app auth)
 */
router.get('/orders/my', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    const { limit = 50 } = req.query;

    const userResult = await query(
      `SELECT id FROM users WHERE telegram_id = $1 LIMIT 1`,
      [telegramId]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;

    const result = await query(
      `SELECT 
         o.id, o.direction, o.amount, o.entry_price, o.close_price, o.odds, o.status, o.created_at,
         p.symbol, COALESCE(p.display_name, p.name, p.symbol) as display_name,
         s.start_time as session_start, s.end_time as session_end
       FROM trading_orders o
       JOIN trading_pairs p ON o.pair_id = p.id
       JOIN trading_sessions s ON o.session_id = s.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [userId, Number(limit)]
    );

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Get my orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
