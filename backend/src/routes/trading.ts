import express from 'express';
import { query, transaction } from '../db';
import { authenticateBot, AuthRequest } from '../middleware/auth';
import { authenticateMiniApp, MiniAppAuthRequest } from '../middleware/miniapp-auth';
import { getPairPrice, getKlineData, cacheKlineData } from '../services/price.service';
import { triggerFirstTradeReward } from '../services/invitation-reward.service';
import { autoUnlockRewardBalance, autoUnlockRedPacketBalance } from '../services/balance.service';

const router = express.Router();

/**
 * Parse a kline interval string (e.g. '1m', '5m', '1h', '1d') into seconds.
 */
function parseIntervalToSeconds(interval: string): number {
  const match = interval.match(/^(\d+)(m|h|d)$/i);
  if (!match) return 60;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === 'm') return value * 60;
  if (unit === 'h') return value * 3600;
  if (unit === 'd') return value * 86400;
  return 60;
}

/** Minimum number of candles required before synthetic seed candles are injected. */
const MIN_CANDLES_FOR_CHART = 10;
/** Seed candle price jitter: each synthetic candle has a ±0.2% random variance. */
const SEED_JITTER_RANGE = 0.004;
const SEED_JITTER_OFFSET = 0.002;

/**
 * Check whether the PostgreSQL error is a "relation does not exist" error,
 * which typically means a required database migration has not been run.
 */
function isMissingTableError(err: any): boolean {
  // PostgreSQL error code 42P01 = "undefined_table"
  return err?.code === '42P01' || /relation .* does not exist/i.test(err?.message ?? '');
}

/**
 * Check whether the PostgreSQL error is an "undefined column" error (42703),
 * which means a required database migration has not been run.
 */
function isMissingColumnError(err: any): boolean {
  // PostgreSQL error code 42703 = "undefined_column"
  return err?.code === '42703' || /column .* does not exist/i.test(err?.message ?? '');
}

/**
 * GET /api/trading/health
 * Check trading feature readiness (tables present, at least one active pair).
 * Returns 200 when ready, 503 when migrations are missing, 500 on other errors.
 */
router.get('/health', async (_req, res) => {
  const checks: Record<string, boolean | string> = {};
  try {
    await query('SELECT 1 FROM trading_pairs LIMIT 1');
    checks.trading_pairs = true;
  } catch (err: any) {
    checks.trading_pairs = isMissingTableError(err) ? 'missing_migration' : err.message;
  }
  try {
    await query('SELECT 1 FROM trading_rules LIMIT 1');
    checks.trading_rules = true;
  } catch (err: any) {
    checks.trading_rules = isMissingTableError(err) ? 'missing_migration' : err.message;
  }
  try {
    await query('SELECT 1 FROM trading_sessions LIMIT 1');
    checks.trading_sessions = true;
  } catch (err: any) {
    checks.trading_sessions = isMissingTableError(err) ? 'missing_migration' : err.message;
  }
  try {
    await query('SELECT 1 FROM trading_orders LIMIT 1');
    checks.trading_orders = true;
  } catch (err: any) {
    checks.trading_orders = isMissingTableError(err) ? 'missing_migration' : err.message;
  }

  const allOk = Object.values(checks).every(v => v === true);
  const hasMissingMigration = Object.values(checks).some(v => v === 'missing_migration');

  if (allOk) {
    return res.json({ status: 'ok', checks });
  }

  const status = hasMissingMigration ? 503 : 500;
  return res.status(status).json({
    status: hasMissingMigration ? 'migration_required' : 'error',
    message: hasMissingMigration
      ? 'Trading feature is not ready. Please run: backend/db/migrations/200_trading_rules_and_settlement.sql'
      : 'Trading health check failed',
    checks,
  });
});


router.get('/pairs', async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         id, symbol, COALESCE(display_name, name, symbol) as display_name, pair_type, base_currency, quote_currency,
         binance_symbol, is_active, icon_url, sort_order, created_at
       FROM trading_pairs
       WHERE is_active = true
       ORDER BY sort_order ASC, created_at DESC`
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get pairs error:', error);
    if (isMissingTableError(error)) {
      return res.status(503).json({
        error: 'Trading feature is not ready',
        hint: 'Required database migrations have not been applied. ' +
              'Run: backend/db/migrations/200_trading_rules_and_settlement.sql',
      });
    }
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
      // Aggregate price data into OHLC candles for custom pairs
      const intervalSeconds = parseIntervalToSeconds(intervalStr);
      const intervalMs = intervalSeconds * 1000;

      const ohlcQuery = (table: string) => `
        SELECT
          (floor(extract(epoch from timestamp) / $3::float) * $4)::bigint AS open_time,
          (ARRAY_AGG(price ORDER BY timestamp ASC))[1]                    AS open,
          MAX(price)                                                       AS high,
          MIN(price)                                                       AS low,
          (ARRAY_AGG(price ORDER BY timestamp DESC))[1]                   AS close
        FROM ${table}
        WHERE pair_id = $1
          AND timestamp >= NOW() - make_interval(secs => $2::int * $3::int)
        GROUP BY floor(extract(epoch from timestamp) / $3::float)
        ORDER BY open_time DESC
        LIMIT $2`;

      try {
        // Query both price_points (auto-generated) and custom_price_points (admin-set)
        const [ppResult, cppResult] = await Promise.all([
          query(ohlcQuery('price_points'), [pairId, limitNum, intervalSeconds, intervalMs]),
          query(ohlcQuery('custom_price_points'), [pairId, limitNum, intervalSeconds, intervalMs]),
        ]);

        // Merge by open_time — price_points takes precedence over custom_price_points
        const mergedMap = new Map<number, any>();
        for (const row of [...cppResult.rows, ...ppResult.rows]) {
          mergedMap.set(parseFloat(row.open_time), row);
        }

        klineData = Array.from(mergedMap.values())
          .sort((a: any, b: any) => parseFloat(a.open_time) - parseFloat(b.open_time))
          .slice(-limitNum)
          .map((row: any) => ({
            open_time: parseFloat(row.open_time),
            timestamp: parseFloat(row.open_time),
            open:      parseFloat(row.open),
            high:      parseFloat(row.high),
            low:       parseFloat(row.low),
            close:     parseFloat(row.close),
            volume:    0,
          }));

        // If fewer than MIN_CANDLES_FOR_CHART candles exist, synthesize seed candles from initial/current price
        if (klineData.length < MIN_CANDLES_FOR_CHART) {
          const pairInfoResult = await query(
            `SELECT custom_initial_price, current_price FROM trading_pairs WHERE id = $1`,
            [pairId]
          );
          const seedPrice = pairInfoResult.rows.length > 0
            ? parseFloat(pairInfoResult.rows[0].current_price || pairInfoResult.rows[0].custom_initial_price || '0')
            : 0;

          if (seedPrice > 0) {
            const neededCandles = limitNum - klineData.length;
            const existingTimes = new Set(klineData.map((c: any) => c.open_time));
            const nowBucket = Math.floor(Date.now() / intervalMs) * intervalMs;
            const seedCandles: Array<{ open_time: number; timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];

            for (let i = neededCandles; i > 0; i--) {
              const openTime = nowBucket - i * intervalMs;
              if (!existingTimes.has(openTime)) {
                // Apply a tiny random jitter so consecutive synthetic candles differ slightly (±0.2%)
                const jitter = 1 + (Math.random() * SEED_JITTER_RANGE - SEED_JITTER_OFFSET);
                const p = parseFloat((seedPrice * jitter).toFixed(8));
                seedCandles.push({
                  open_time: openTime,
                  timestamp: openTime,
                  open: p, high: p, low: p, close: p, volume: 0,
                });
              }
            }

            klineData = [
              ...seedCandles,
              ...klineData,
            ].sort((a: any, b: any) => a.open_time - b.open_time).slice(-limitNum);
          }
        }
      } catch (klineErr: any) {
        console.warn('[kline] Custom pair aggregation error:', klineErr.message);
        klineData = [];
      }
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
      const sessionEnd = new Date(session.end_time);
      // Allow pre-ordering when start_time is in the future (next-period orders).
      // Only reject if the session has already ended.
      if (now > sessionEnd) {
        throw new Error('Trading session has already ended');
      }

      // Get trading rule for this session (if exists)
      let ruleId = session.rule_id;
      let odds = 1.85; // Default odds, aligned with frontend
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
        'SELECT wallet_balance, COALESCE(red_packet_balance, 0) AS red_packet_balance FROM users WHERE id = $1',
        [user_id]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const walletBal = parseFloat(String(userResult.rows[0].wallet_balance ?? 0));
      const redPacketBal = parseFloat(String(userResult.rows[0].red_packet_balance ?? 0));
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

      // Deduct from red_packet_balance first, then wallet_balance
      const fromRedPacket = Math.min(redPacketBal, orderAmount);
      const fromWallet = orderAmount - fromRedPacket;
      if (fromRedPacket > 0) {
        await client.query(
          'UPDATE users SET red_packet_balance = red_packet_balance - $1, red_packet_wagered = COALESCE(red_packet_wagered, 0) + $2 WHERE id = $3',
          [fromRedPacket, orderAmount, user_id]
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

    // Fire-and-forget: check if reward/red-packet balances can be auto-unlocked after this trade
    autoUnlockRewardBalance(Number(user_id)).catch((err: any) =>
      console.error('[trading] autoUnlockRewardBalance failed:', err)
    );
    autoUnlockRedPacketBalance(String(user_id)).catch((err: any) =>
      console.error('[trading] autoUnlockRedPacketBalance failed:', err)
    );

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
    const { pair_id, duration, direction, amount, period_label, period_start } = req.body;
    const telegramId = req.telegramUser?.id;

    console.log('[quick-session] request body:', { pair_id, duration, direction, amount, period_label, period_start });
    console.log('[quick-session] telegramId:', telegramId);

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
    // Ensure pair_id is always passed as an integer to avoid type mismatch in WHERE id = $1
    const pairIdInt = parseInt(pair_id, 10);

    if (isNaN(orderAmount) || orderAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      return res.status(400).json({ error: 'Invalid duration' });
    }

    if (isNaN(pairIdInt) || pairIdInt <= 0) {
      return res.status(400).json({ error: 'Invalid pair_id' });
    }

    // Validate period_start if provided: it must be within ±2 periods of now
    let periodStartMs: number | null = null;
    let resolvedPeriodLabel: string | null = period_label || null;
    if (period_start != null) {
      periodStartMs = Number(period_start);
      if (isNaN(periodStartMs)) {
        return res.status(400).json({ error: 'Invalid period_start: must be a Unix timestamp in milliseconds' });
      }
      const nowMs = Date.now();
      // Allow a small tolerance in the past (clock skew) and up to 3 full periods in the future
      // so users can pre-order for the next period regardless of how much time remains in the current period.
      const toleranceMs = 30000; // 30 seconds for clock skew
      const maxFutureMs = durationSeconds * 3 * 1000 + toleranceMs;
      if (periodStartMs < nowMs - toleranceMs || periodStartMs > nowMs + maxFutureMs) {
        console.warn('[quick-session] period_start out of range', {
          periodStartMs,
          nowMs,
          diffMs: periodStartMs - nowMs,
          maxFutureMs,
          durationSeconds,
        });
        return res.status(400).json({ error: 'period_start is out of acceptable range. You may only order for the next period.' });
      }
    }

    // Look up the internal database user ID from the Telegram user ID (trusted from middleware)
    const userLookup = await query(
      `SELECT id FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [telegramId]
    );

    if (userLookup.rows.length === 0) {
      return res.status(404).json({ error: 'User account not initialized. Please open the app home screen first.' });
    }

    const user_id = userLookup.rows[0].id;

    const result = await transaction(async (client) => {
      // Get trading pair (use integer pairIdInt to avoid string/int type mismatch)
      const pairResult = await client.query(
        'SELECT id, symbol, display_name, is_active FROM trading_pairs WHERE id = $1',
        [pairIdInt]
      );
      console.log(`[quick-session] pair lookup: pairIdInt=${pairIdInt}, found=${pairResult.rows.length}`);
      if (pairResult.rows.length === 0) {
        throw Object.assign(new Error(`Trading pair not found: id=${pairIdInt}`), { statusCode: 404 });
      }
      if (!pairResult.rows[0].is_active) {
        throw Object.assign(new Error(`Trading pair is inactive: id=${pairIdInt}`), { statusCode: 400 });
      }

      // Get applicable rule: pair-specific rules take precedence (ORDER BY pair_id DESC NULLS LAST),
      // then fall back to global rules (pair_id IS NULL). If neither exists, defaults (1.85/1/10000) are used.
      const ruleResult = await client.query(
        `SELECT id, odds, min_bet, max_bet
         FROM trading_rules
         WHERE (pair_id = $1 OR pair_id IS NULL) AND duration_seconds = $2 AND is_active = true
         ORDER BY pair_id DESC NULLS LAST
         LIMIT 1`,
        [pairIdInt, durationSeconds]
      );

      let ruleId: number | null = null;
      let odds = 1.85;
      let minBet = 1.0;
      let maxBet = 10000.0;

      if (ruleResult.rows.length > 0) {
        const rule = ruleResult.rows[0];
        ruleId = rule.id;
        odds = parseFloat(rule.odds);
        minBet = parseFloat(rule.min_bet);
        maxBet = parseFloat(rule.max_bet);
      }
      // If no rule found, use defaults (odds=1.85, min_bet=1, max_bet=10000) — already set above

      if (orderAmount < minBet) throw new Error(`Minimum bet is ${minBet}`);
      if (orderAmount > maxBet) throw new Error(`Maximum bet is ${maxBet}`);

      // Check for existing active order on this pair
      const existingOrderResult = await client.query(
        `SELECT id FROM trading_orders 
         WHERE user_id = $1 AND pair_id = $2 AND status IN ('active', 'pending')
         LIMIT 1`,
        [user_id, pairIdInt]
      );
      if (existingOrderResult.rows.length > 0) {
        throw new Error('You already have an active order for this trading pair. Please wait for settlement before placing a new order.');
      }

      // Check user balance
      const userResult = await client.query(
        'SELECT wallet_balance, COALESCE(red_packet_balance, 0) AS red_packet_balance FROM users WHERE id = $1',
        [user_id]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      const walletBal = parseFloat(String(userResult.rows[0].wallet_balance ?? 0));
      const redPacketBal = parseFloat(String(userResult.rows[0].red_packet_balance ?? 0));
      const totalAvailable = walletBal + redPacketBal;
      console.log(`[quick-session] user_id=${user_id}, walletBal=${walletBal}, redPacketBal=${redPacketBal}, totalAvailable=${totalAvailable}, orderAmount=${orderAmount}`);
      if (totalAvailable < orderAmount) {
        throw Object.assign(new Error('Insufficient balance'), { statusCode: 402, current_balance: totalAvailable, required: orderAmount });
      }

      // Get current price: try price_points cache first, then fall back to live price
      const priceResult = await client.query(
        `SELECT price FROM price_points WHERE pair_id = $1 ORDER BY timestamp DESC LIMIT 1`,
        [pairIdInt]
      );
      let entryPrice: number;
      if (priceResult.rows.length > 0) {
        entryPrice = parseFloat(priceResult.rows[0].price);
      } else {
        // No cached price available – fetch live price from price service
        try {
          const livePrice = await getPairPrice(pairIdInt);
          entryPrice = livePrice.price;
          // Cache it in price_points for future use (best-effort, don't fail if this fails)
          void client.query(
            `INSERT INTO price_points (pair_id, price, timestamp) VALUES ($1, $2, NOW())`,
            [pairIdInt, entryPrice]
          ).catch((err: any) => console.error('[trading] Failed to cache live price:', err));
        } catch (priceErr: any) {
          throw new Error(`Price data not available and live fetch failed: ${priceErr.message}`);
        }
      }

      // Determine session time boundaries: use fixed period boundaries when period_start is provided,
      // otherwise fall back to current time (legacy behaviour)
      let sessionStartTime: Date;
      let sessionEndTime: Date;
      if (periodStartMs != null) {
        sessionStartTime = new Date(periodStartMs);
        sessionEndTime = new Date(periodStartMs + durationSeconds * 1000);
      } else {
        const now = new Date();
        sessionStartTime = now;
        sessionEndTime = new Date(now.getTime() + durationSeconds * 1000);
      }

      // Try to reuse an existing active/pending session for the same period
      // Lookup by period_label when available, otherwise by start_time alignment
      let session: any;
      if (resolvedPeriodLabel) {
        const existingSession = await client.query(
          `SELECT * FROM trading_sessions
           WHERE pair_id = $1 AND duration_seconds = $2 AND period_label = $3
             AND status IN ('active', 'pending')
           ORDER BY created_at ASC LIMIT 1`,
          [pairIdInt, durationSeconds, resolvedPeriodLabel]
        );
        if (existingSession.rows.length > 0) {
          session = existingSession.rows[0];
          console.log(`[quick-session] reusing existing session id=${session.id} for period_label=${resolvedPeriodLabel}`);
        }
      }

      if (!session) {
        // Also check by start_time in case period_label column doesn't exist yet
        const byStartTime = await client.query(
          `SELECT * FROM trading_sessions
           WHERE pair_id = $1 AND duration_seconds = $2
             AND start_time = $3 AND status IN ('active', 'pending')
           ORDER BY created_at ASC LIMIT 1`,
          [pairIdInt, durationSeconds, sessionStartTime]
        );
        if (byStartTime.rows.length > 0) {
          session = byStartTime.rows[0];
          console.log(`[quick-session] reusing session by start_time id=${session.id}`);
        }
      }

      if (!session) {
        // Create a new session with fixed period boundaries and open_price
        let sessionInsertResult;
        try {
          sessionInsertResult = await client.query(
            `INSERT INTO trading_sessions (pair_id, rule_id, status, start_time, end_time, duration_seconds, open_price, period_label)
             VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)
             RETURNING *`,
            [pairIdInt, ruleId, sessionStartTime, sessionEndTime, durationSeconds, entryPrice, resolvedPeriodLabel]
          );
        } catch (insertErr: any) {
          // Fallback: period_label column might not exist yet (migration not applied)
          // PostgreSQL error code 42703 = undefined_column
          if (insertErr.code === '42703' || (insertErr.message && insertErr.message.includes('period_label'))) {
            sessionInsertResult = await client.query(
              `INSERT INTO trading_sessions (pair_id, rule_id, status, start_time, end_time, duration_seconds, open_price)
               VALUES ($1, $2, 'active', $3, $4, $5, $6)
               RETURNING *`,
              [pairIdInt, ruleId, sessionStartTime, sessionEndTime, durationSeconds, entryPrice]
            );
          } else {
            throw insertErr;
          }
        }
        session = sessionInsertResult.rows[0];
        console.log(`[quick-session] created new session id=${session.id} period_label=${resolvedPeriodLabel}`);
      }

      // Deduct from red_packet_balance first, then wallet_balance
      const fromRedPacket = Math.min(redPacketBal, orderAmount);
      const fromWallet = orderAmount - fromRedPacket;
      if (fromRedPacket > 0) {
        await client.query(
          'UPDATE users SET red_packet_balance = red_packet_balance - $1, red_packet_wagered = COALESCE(red_packet_wagered, 0) + $2 WHERE id = $3',
          [fromRedPacket, orderAmount, user_id]
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
        [session.id, user_id, pairIdInt, direction, orderAmount, entryPrice, ruleId, odds]
      );

      return {
        session: {
          id: session.id,
          start_time: session.start_time,
          end_time: session.end_time,
          status: session.status,
        },
        order: {
          id: orderResult.rows[0].id,
          direction,
          amount: orderAmount,
          entry_price: entryPrice,
          odds,
          status: 'active',
        },
        odds,
        entry_price: entryPrice,
        expected_profit: parseFloat((orderAmount * odds - orderAmount).toFixed(2)),
      };
    });

    // Fire-and-forget: check if reward/red-packet balances can be auto-unlocked after this trade
    autoUnlockRewardBalance(Number(user_id)).catch((err: any) =>
      console.error('[trading] autoUnlockRewardBalance failed:', err)
    );
    autoUnlockRedPacketBalance(String(user_id)).catch((err: any) =>
      console.error('[trading] autoUnlockRedPacketBalance failed:', err)
    );

    res.json({
      success: true,
      data: result,
      message: 'Session created and order placed successfully',
    });
  } catch (error: any) {
    console.error('Quick session error:', error);
    if (isMissingTableError(error) || isMissingColumnError(error)) {
      return res.status(503).json({
        error: 'Trading feature is not ready',
        hint: isMissingColumnError(error)
          ? 'A required column is missing. Run: backend/db/migrations/1001_fix_trading_sessions_status.sql'
          : 'Required database migrations have not been applied. ' +
            'Run: backend/db/migrations/200_trading_rules_and_settlement.sql and backend/db/migrations/1001_fix_trading_sessions_status.sql',
      });
    }
    const statusCode = error.statusCode || 500;
    const body: Record<string, any> = { error: error.message };
    if (error.current_balance !== undefined) body.current_balance = error.current_balance;
    if (error.required !== undefined) body.required = error.required;
    res.status(statusCode).json(body);
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
      `SELECT id FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1`,
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
    if (isMissingTableError(error)) {
      return res.status(503).json({
        error: 'Trading feature is not ready',
        hint: 'Required database migrations have not been applied. ' +
              'Run: backend/db/migrations/200_trading_rules_and_settlement.sql',
      });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
