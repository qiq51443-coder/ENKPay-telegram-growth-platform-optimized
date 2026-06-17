import express from 'express';
import { query, transaction, withSavepoint } from '../db';
import { authenticateWebUser, WebAuthRequest } from '../middleware/web-auth';
import { getNextPeriod } from '../services/period.service';
import { triggerFirstTradeReward } from '../services/invitation-reward.service';
import { autoUnlockRewardBalance, autoUnlockRedPacketBalance } from '../services/balance.service';
import {
  buildNFTPurchaseDescription,
  buildNFTIncomeDescription,
  buildNFTPurchaseSuccessMessage,
} from '../i18n/nft-notifications';
import { drawWinner } from '../services/auction.service';

const router = express.Router();

router.use(authenticateWebUser);

function isMissingTableError(err: any): boolean {
  return err?.code === '42P01' || /relation .* does not exist/i.test(err?.message ?? '');
}

function isMissingColumnError(err: any): boolean {
  return err?.code === '42703' || /column .* does not exist/i.test(err?.message ?? '');
}

function getBaseLang(value: unknown): string {
  return String(value || 'en').split('-')[0].toLowerCase();
}

async function fetchLatestPairPrice(client: any, pairId: number, fallbackPrice = 0) {
  const latestPriceResult = await client.query(
    `SELECT price
       FROM (
         SELECT price, timestamp FROM price_points WHERE pair_id = $1
         UNION ALL
         SELECT price, timestamp FROM custom_price_points WHERE pair_id = $1
       ) AS prices
      ORDER BY timestamp DESC
      LIMIT 1`,
    [pairId]
  );

  if (latestPriceResult.rows.length > 0) {
    return parseFloat(String(latestPriceResult.rows[0].price || fallbackPrice || 0));
  }

  return fallbackPrice;
}

router.get('/trading/orders', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const { limit = 50, pair_id } = req.query;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const params: any[] = [userId];
    let whereClause = 'WHERE o.user_id = $1';
    if (pair_id) {
      params.push(Number(pair_id));
      whereClause += ` AND o.pair_id = $${params.length}`;
    }
    params.push(Number(limit));

    const result = await query(
      `SELECT
         o.id, o.pair_id, o.direction, o.amount, o.entry_price, o.close_price, o.odds, o.status,
         o.result, o.profit, o.settled_at, o.created_at,
         p.symbol, COALESCE(p.display_name, p.name, p.symbol) AS display_name,
         s.start_time AS session_start, s.end_time AS session_end, s.period_label, s.duration_seconds AS duration,
         s.open_price AS session_open_price, s.close_price AS session_close_price
       FROM trading_orders o
       LEFT JOIN trading_pairs p ON o.pair_id = p.id
       LEFT JOIN trading_sessions s ON o.session_id = s.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Web trading orders error:', error);
    if (isMissingTableError(error)) {
      return res.status(503).json({ error: 'Trading feature is not ready' });
    }
    return res.status(500).json({ error: error.message });
  }
});

router.post('/trading/quick-session', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const { pair_id, duration = 60, direction, amount } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!pair_id || !direction || !amount) {
      return res.status(400).json({ error: 'Missing required fields: pair_id, direction, amount' });
    }
    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({ error: 'Invalid direction. Must be up or down' });
    }

    const pairId = parseInt(String(pair_id), 10);
    const durationSeconds = parseInt(String(duration), 10);
    const orderAmount = parseFloat(String(amount));
    if (isNaN(pairId) || pairId <= 0) return res.status(400).json({ error: 'Invalid pair_id' });
    if (isNaN(durationSeconds) || durationSeconds <= 0) return res.status(400).json({ error: 'Invalid duration' });
    if (isNaN(orderAmount) || orderAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const nowMs = Date.now();
    const nextPeriod = getNextPeriod(durationSeconds, nowMs);
    const sessionStartTime = new Date(nextPeriod.periodStartMs);
    const sessionEndTime = new Date(nextPeriod.periodEndMs);
    const resolvedPeriodLabel = nextPeriod.periodLabel;

    const result = await transaction(async (client) => {
      const userResult = await client.query(
        `SELECT id, is_frozen, wallet_balance, COALESCE(red_packet_balance, 0) AS red_packet_balance
           FROM users
          WHERE id = $1
          FOR UPDATE`,
        [userId]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      const user = userResult.rows[0];
      if (user.is_frozen) throw new Error('Account is frozen. Trading is not allowed.');

      const pairResult = await client.query(
        `SELECT id, pair_type, symbol, binance_symbol, current_price
           FROM trading_pairs
          WHERE id = $1 AND is_active = true
          LIMIT 1`,
        [pairId]
      );
      if (pairResult.rows.length === 0) throw new Error('Trading pair not found');
      const pair = pairResult.rows[0];

      const ruleResult = await client.query(
        `SELECT id, odds, min_bet, max_bet
           FROM trading_rules
          WHERE (pair_id = $1 OR pair_id IS NULL)
            AND duration_seconds = $2
            AND is_active = true
          ORDER BY CASE WHEN pair_id = $1 THEN 0 ELSE 1 END, created_at ASC
          LIMIT 1`,
        [pairId, durationSeconds]
      );
      const rule = ruleResult.rows[0] || { id: null, odds: 1.85, min_bet: 1, max_bet: 1000 };
      const odds = parseFloat(String(rule.odds || 1.85));
      const minBet = parseFloat(String(rule.min_bet || 1));
      const maxBet = parseFloat(String(rule.max_bet || 1000));

      if (orderAmount < minBet) throw new Error(`Minimum bet amount is ${minBet}`);
      if (orderAmount > maxBet) throw new Error(`Maximum bet amount is ${maxBet}`);

      const walletBal = parseFloat(String(user.wallet_balance || 0));
      const redPacketBal = parseFloat(String(user.red_packet_balance || 0));
      const totalAvailable = walletBal + redPacketBal;
      if (totalAvailable < orderAmount) {
        throw Object.assign(new Error('Insufficient balance'), {
          statusCode: 402,
          current_balance: totalAvailable,
          required: orderAmount,
        });
      }

      const sessionOpenPrice = await fetchLatestPairPrice(
        client,
        pairId,
        parseFloat(String(pair.current_price || 0))
      );
      const entryPrice = sessionOpenPrice;
      if (!entryPrice || entryPrice <= 0) throw new Error('Price data not available');

      let session = null;
      try {
        const existingSession = await client.query(
          `SELECT *
             FROM trading_sessions
            WHERE pair_id = $1
              AND duration_seconds = $2
              AND period_label = $3
              AND status IN ('active', 'pending')
            ORDER BY created_at ASC
            LIMIT 1`,
          [pairId, durationSeconds, resolvedPeriodLabel]
        );
        session = existingSession.rows[0] || null;
      } catch (sessionLookupError: any) {
        if (!isMissingColumnError(sessionLookupError)) throw sessionLookupError;
      }

      if (!session) {
        const byStartTime = await client.query(
          `SELECT *
             FROM trading_sessions
            WHERE pair_id = $1
              AND duration_seconds = $2
              AND start_time = $3
              AND status IN ('active', 'pending')
            ORDER BY created_at ASC
            LIMIT 1`,
          [pairId, durationSeconds, sessionStartTime]
        );
        session = byStartTime.rows[0] || null;
      }

      if (!session) {
        let sessionInsertResult: any = null;
        try {
          sessionInsertResult = await withSavepoint(client, 'sp_web_session_insert_main', () =>
            client.query(
              `INSERT INTO trading_sessions (pair_id, rule_id, status, start_time, end_time, duration_seconds, period_label, start_at, end_at, open_price)
               VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (pair_id, duration_seconds, period_label) DO NOTHING
               RETURNING *`,
              [pairId, rule.id, sessionStartTime, sessionEndTime, durationSeconds, resolvedPeriodLabel, sessionStartTime, sessionEndTime, sessionOpenPrice]
            )
          );
        } catch (insertErr: any) {
          if (insertErr.code === '42703' || insertErr.message?.includes('period_label')) {
            sessionInsertResult = await withSavepoint(client, 'sp_web_session_insert_fallback1', () =>
              client.query(
                `INSERT INTO trading_sessions (pair_id, rule_id, status, start_time, end_time, duration_seconds, start_at, end_at, open_price)
                 VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [pairId, rule.id, sessionStartTime, sessionEndTime, durationSeconds, sessionStartTime, sessionEndTime, sessionOpenPrice]
              )
            );
          } else if (insertErr.code === '42P10' || insertErr.message?.includes('no unique or exclusion constraint')) {
            sessionInsertResult = await withSavepoint(client, 'sp_web_session_insert_fallback2', () =>
              client.query(
                `INSERT INTO trading_sessions (pair_id, rule_id, status, start_time, end_time, duration_seconds, period_label, start_at, end_at, open_price)
                 VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [pairId, rule.id, sessionStartTime, sessionEndTime, durationSeconds, resolvedPeriodLabel, sessionStartTime, sessionEndTime, sessionOpenPrice]
              )
            );
          } else {
            throw insertErr;
          }
        }

        if (sessionInsertResult?.rows?.length) {
          session = sessionInsertResult.rows[0];
        } else {
          const existingAfterConflict = await client.query(
            `SELECT *
               FROM trading_sessions
              WHERE pair_id = $1
                AND duration_seconds = $2
                AND period_label = $3
                AND status IN ('active', 'pending')
              ORDER BY created_at ASC
              LIMIT 1`,
            [pairId, durationSeconds, resolvedPeriodLabel]
          );
          if (existingAfterConflict.rows.length === 0) {
            throw new Error('Failed to create or reuse trading session');
          }
          session = existingAfterConflict.rows[0];
        }
      }

      if (!session) {
        throw new Error('Failed to create trading session');
      }

      let ensuredSession: any = session;
      if (ensuredSession.open_price == null && sessionOpenPrice > 0) {
        await client.query(
          `UPDATE trading_sessions SET open_price = $1 WHERE id = $2 AND open_price IS NULL`,
          [sessionOpenPrice, ensuredSession.id]
        );
        ensuredSession = { ...ensuredSession, open_price: sessionOpenPrice };
      }

      const existingOrderResult = await client.query(
        `SELECT id
           FROM trading_orders
          WHERE user_id = $1
            AND session_id = $2
            AND status IN ('active', 'pending')
          LIMIT 1`,
        [userId, ensuredSession.id]
      );
      if (existingOrderResult.rows.length > 0) {
        throw new Error('You already have an order for this trading period. Please wait for the next period.');
      }

      const fromRedPacket = Math.min(redPacketBal, orderAmount);
      const fromWallet = orderAmount - fromRedPacket;
      if (fromRedPacket > 0) {
        const deductRP = await client.query(
          `UPDATE users
              SET red_packet_balance = red_packet_balance - $1,
                  red_packet_wagered = COALESCE(red_packet_wagered, 0) + $2
            WHERE id = $3 AND red_packet_balance >= $1
            RETURNING id`,
          [fromRedPacket, orderAmount, userId]
        );
        if (deductRP.rows.length === 0) {
          throw Object.assign(new Error('Insufficient red packet balance'), {
            statusCode: 402,
            current_balance: totalAvailable,
            required: orderAmount,
          });
        }
      }
      if (fromWallet > 0) {
        const deductWallet = await client.query(
          `UPDATE users SET wallet_balance = wallet_balance - $1
            WHERE id = $2 AND wallet_balance >= $1
            RETURNING id`,
          [fromWallet, userId]
        );
        if (deductWallet.rows.length === 0) {
          throw Object.assign(new Error('Insufficient wallet balance'), {
            statusCode: 402,
            current_balance: totalAvailable,
            required: orderAmount,
          });
        }
      }

      const orderResult = await client.query(
        `INSERT INTO trading_orders
           (session_id, user_id, pair_id, direction, amount, entry_price, rule_id, odds, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
         RETURNING *`,
        [ensuredSession.id, userId, pairId, direction, orderAmount, entryPrice, rule.id, odds]
      );

      const dirCountResult = await client.query(
        `SELECT
           COUNT(CASE WHEN direction = 'up' THEN 1 END)::int AS up_count,
           COUNT(CASE WHEN direction = 'down' THEN 1 END)::int AS down_count
         FROM trading_orders
         WHERE session_id = $1 AND status IN ('active', 'pending')`,
        [ensuredSession.id]
      );

      await triggerFirstTradeReward(client, userId);

      return {
        session: {
          id: ensuredSession.id,
          start_time: ensuredSession.start_time,
          end_time: ensuredSession.end_time,
          status: ensuredSession.status,
          open_price: ensuredSession.open_price ?? sessionOpenPrice,
          up_count: dirCountResult.rows[0]?.up_count ?? 0,
          down_count: dirCountResult.rows[0]?.down_count ?? 0,
          period_label: ensuredSession.period_label ?? resolvedPeriodLabel,
        },
        order: orderResult.rows[0],
        odds,
        entry_price: entryPrice,
        expected_profit: parseFloat((orderAmount * odds - orderAmount).toFixed(2)),
      };
    });

    autoUnlockRewardBalance(userId).catch((err: any) =>
      console.error('[web trading] autoUnlockRewardBalance failed:', err)
    );
    autoUnlockRedPacketBalance(String(userId)).catch((err: any) =>
      console.error('[web trading] autoUnlockRedPacketBalance failed:', err)
    );

    return res.json({
      success: true,
      data: result,
      message: 'Session created and order placed successfully',
    });
  } catch (error: any) {
    console.error('Web quick session error:', error);
    if (isMissingTableError(error) || isMissingColumnError(error)) {
      return res.status(503).json({ error: 'Trading feature is not ready' });
    }
    const statusCode = error.statusCode || 500;
    const body: Record<string, any> = { error: error.message };
    if (error.current_balance !== undefined) body.current_balance = error.current_balance;
    if (error.required !== undefined) body.required = error.required;
    return res.status(statusCode).json(body);
  }
});

router.get('/products/holdings', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const userResult = await query(`SELECT language_code FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const lang = getBaseLang(req.query.lang || userResult.rows[0]?.language_code);

    const result = await query(
      `SELECT ph.*, p.name AS product_name, p.image_url, p.daily_yield_rate, p.term_days
         FROM product_holdings ph
         JOIN nft_products p ON ph.product_id = p.id
        WHERE ph.user_id = $1
        ORDER BY ph.created_at DESC`,
      [userId]
    );

    const incomeResult = await query(
      `SELECT id, holding_id, amount, income_date, created_at
         FROM nft_income_records
        WHERE user_id = $1
        ORDER BY income_date ASC`,
      [userId]
    );

    const incomeByHolding: Record<string, any[]> = {};
    for (const row of incomeResult.rows) {
      if (!incomeByHolding[row.holding_id]) incomeByHolding[row.holding_id] = [];
      incomeByHolding[row.holding_id].push(row);
    }

    const holdings = result.rows.map((holding: any) => {
      const incomeRows = incomeByHolding[holding.id] || [];
      const total_income = incomeRows.reduce((sum: number, row: any) => sum + parseFloat(row.amount || 0), 0);
      const order_records = [
        {
          type: 'purchase',
          amount: -parseFloat(holding.amount || 0),
          description: buildNFTPurchaseDescription({ lang, product_name: holding.product_name }),
          created_at: holding.created_at,
        },
        ...incomeRows.map((row: any, index: number) => ({
          type: 'income',
          amount: parseFloat(row.amount || 0),
          description: buildNFTIncomeDescription({ lang, product_name: holding.product_name, day: index + 1 }),
          income_date: row.income_date,
          created_at: row.created_at,
        })),
      ];

      return {
        ...holding,
        total_income,
        total_yield: total_income,
        order_records,
      };
    });

    return res.json({ success: true, data: holdings });
  } catch (error: any) {
    console.error('Web holdings error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.post('/products/:id/purchase', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const productId = parseInt(req.params.id, 10);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (isNaN(productId) || productId <= 0) return res.status(400).json({ error: 'Invalid product ID' });

    const result = await transaction(async (client) => {
      const userResult = await client.query(
        `SELECT id, wallet_balance, language_code FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      const user = userResult.rows[0];

      const productResult = await client.query(
        `SELECT * FROM nft_products WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [productId]
      );
      if (productResult.rows.length === 0) throw new Error('Product not found or inactive');
      const product = productResult.rows[0];

      const maxHolders = product.max_holders ?? 100;
      const currentHolders = product.current_holders ?? 0;
      if (currentHolders >= maxHolders) throw new Error('Product is sold out');

      if (product.is_purchase_limited) {
        const phCount = await client.query(
          `SELECT COUNT(*) AS total_count FROM product_holdings WHERE user_id = $1 AND product_id = $2`,
          [userId, productId]
        );
        const nftCount = await client.query(
          `SELECT COUNT(*) AS total_count FROM nft_holdings WHERE user_id = $1 AND product_id = $2`,
          [userId, productId]
        );
        const totalHeld = parseInt(phCount.rows[0].total_count, 10) + parseInt(nftCount.rows[0].total_count, 10);
        if (totalHeld >= (product.max_purchases_per_user ?? 1)) {
          throw new Error('Purchase limit reached');
        }
      }

      const amount = parseFloat(product.price);
      if (parseFloat(user.wallet_balance ?? 0) < amount) throw new Error('Insufficient balance');

      await client.query(
        `UPDATE users
            SET wallet_balance = COALESCE(wallet_balance, 0) - $1,
                nft_balance = COALESCE(nft_balance, 0) + $1
          WHERE id = $2`,
        [amount, userId]
      );

      const startDate = new Date();
      const termDays = product.term_days ?? 30;
      const expiryBase = new Date(startDate.getTime() + termDays * 86400000);
      const endDate = new Date(Date.UTC(expiryBase.getUTCFullYear(), expiryBase.getUTCMonth(), expiryBase.getUTCDate(), 10, 5, 0));

      const holdingInsert = await client.query(
        `INSERT INTO product_holdings (user_id, product_id, amount, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id`,
        [userId, productId, amount, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
      );

      await client.query(
        `UPDATE nft_products
            SET current_holders = COALESCE(current_holders, 0) + 1
          WHERE id = $1`,
        [productId]
      );

      const lang = getBaseLang(user.language_code);
      const purchaseDesc = buildNFTPurchaseDescription({ lang, product_name: product.name });
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
         SELECT $1, 'product_purchase', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
        [userId, -amount, purchaseDesc, String(holdingInsert.rows[0].id)]
      );

      return { lang };
    });

    return res.json({
      success: true,
      message: buildNFTPurchaseSuccessMessage({ lang: result.lang }),
    });
  } catch (error: any) {
    console.error('Web product purchase error:', error);
    return res.status(400).json({ error: error.message });
  }
});

router.get('/auctions/history', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await query(
      `SELECT lap.*, a.title, a.status AS auction_status, a.winner_unique_id,
              a.expires_at, a.drawn_at, a.winner_payout, a.product_value,
              lar.id AS result_id, lar.is_redeemed
         FROM lucky_auction_participants lap
         JOIN lucky_auctions a ON lap.auction_id = a.id
         LEFT JOIN lucky_auction_results lar ON lar.auction_id = a.id AND lar.winner_id = $1
        WHERE lap.user_id = $1
        ORDER BY lap.created_at DESC`,
      [userId]
    );

    return res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('Web auction history error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.post('/auctions/:id/join', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const { id } = req.params;
    const quantity = Math.max(1, parseInt(req.body?.quantity || '1', 10));
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await transaction(async (client) => {
      const userResult = await client.query(
        `SELECT id, wallet_balance FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      const user = userResult.rows[0];

      const auctionResult = await client.query(
        `SELECT * FROM lucky_auctions WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (auctionResult.rows.length === 0) throw new Error('Auction not found');
      const auction = auctionResult.rows[0];

      if (auction.status !== 'active') throw new Error('Auction is not active');
      if (new Date() > new Date(auction.expires_at)) throw new Error('Auction has expired');

      const existingResult = await client.query(
        `SELECT quantity FROM lucky_auction_participants WHERE auction_id = $1 AND user_id = $2`,
        [id, user.id]
      );
      const existingQty = existingResult.rows.length > 0 ? existingResult.rows[0].quantity : 0;
      if (existingQty + quantity > auction.max_purchases_per_user) {
        throw new Error(`Exceeds max purchases per user (${auction.max_purchases_per_user}). You already have ${existingQty}.`);
      }

      const remaining = auction.participant_count - auction.current_participants;
      if (quantity > remaining) throw new Error(`Only ${remaining} slot(s) remaining`);

      const totalCost = parseFloat(auction.per_person_cost) * quantity;
      if (parseFloat(user.wallet_balance) < totalCost) throw new Error('Insufficient balance');

      await client.query(`UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2`, [totalCost, user.id]);

      if (existingResult.rows.length > 0) {
        await client.query(
          `UPDATE lucky_auction_participants
              SET quantity = quantity + $1, amount = amount + $2
            WHERE auction_id = $3 AND user_id = $4`,
          [quantity, totalCost, id, user.id]
        );
      } else {
        await client.query(
          `INSERT INTO lucky_auction_participants (auction_id, user_id, quantity, amount)
           VALUES ($1, $2, $3, $4)`,
          [id, user.id, quantity, totalCost]
        );
      }

      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
         SELECT $1, 'auction_join', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
        [user.id, -totalCost, `参与竞拍: ${auction.title}`, id]
      );

      const newCount = auction.current_participants + quantity;
      await client.query(
        `UPDATE lucky_auctions SET current_participants = $1, updated_at = NOW() WHERE id = $2`,
        [newCount, id]
      );

      return { newCount, participantCount: auction.participant_count };
    });

    if (result.newCount >= result.participantCount) {
      drawWinner(id)
        .then(() => query(`UPDATE lucky_auctions SET show_in_mini_app = true WHERE id = $1 AND status = 'completed'`, [id]))
        .catch((err) => console.error(`Web auto-draw failed for auction ${id}:`, err));
    }

    return res.json({ success: true, message: '参与成功' });
  } catch (error: any) {
    console.error('Web join auction error:', error);
    return res.status(400).json({ error: error.message });
  }
});

router.get('/charity/donations', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await query(
      `SELECT
         d.*,
         p.title AS project_title,
         p.image_url AS project_image,
         p.organization
       FROM charity_donations d
       JOIN charity_projects p ON d.project_id = p.id
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, Number(limit), offset]
    );

    const totalResult = await query(
      `SELECT SUM(amount) AS total_donated
         FROM charity_donations
        WHERE user_id = $1 AND status = 'completed'`,
      [userId]
    );

    return res.json({
      success: true,
      data: result.rows,
      summary: {
        total_donated: parseFloat(totalResult.rows[0]?.total_donated || 0),
      },
    });
  } catch (error: any) {
    console.error('Web charity donations error:', error);
    return res.status(500).json({ error: error.message });
  }
});

router.post('/charity/donate', async (req: WebAuthRequest, res) => {
  try {
    const userId = req.webUser?.id;
    const { project_id, amount, message } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!project_id || !amount) return res.status(400).json({ error: 'Missing required fields' });

    const donationAmount = parseFloat(String(amount));
    if (!Number.isFinite(donationAmount) || donationAmount <= 0) {
      return res.status(400).json({ error: 'Invalid donation amount' });
    }

    const result = await transaction(async (client) => {
      const projectResult = await client.query(
        `SELECT * FROM charity_projects WHERE id = $1 AND status = 'active'`,
        [project_id]
      );
      if (projectResult.rows.length === 0) throw new Error('Project not found or not active');
      const project = projectResult.rows[0];
      if (project.end_at && new Date() > new Date(project.end_at)) throw new Error('Project has ended');

      const userResult = await client.query(
        `SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      if (userResult.rows.length === 0) throw new Error('User not found');
      if (parseFloat(String(userResult.rows[0].wallet_balance || 0)) < donationAmount) {
        throw new Error('Insufficient balance');
      }

      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2`,
        [donationAmount, userId]
      );
      await client.query(
        `UPDATE charity_projects SET raised_amount = COALESCE(raised_amount, 0) + $1 WHERE id = $2`,
        [donationAmount, project_id]
      );
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
         SELECT $1, 'charity_donation', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
        [userId, -donationAmount, `公益捐赠: ${project.title}`, String(project_id)]
      );

      const donationResult = await client.query(
        `INSERT INTO charity_donations (user_id, project_id, amount, message, status)
         VALUES ($1, $2, $3, $4, 'completed')
         RETURNING *`,
        [userId, project_id, donationAmount, message || null]
      );

      return donationResult.rows[0];
    });

    return res.json({
      success: true,
      data: result,
      message: 'Donation completed successfully',
    });
  } catch (error: any) {
    console.error('Web charity donation error:', error);
    return res.status(400).json({ error: error.message });
  }
});

export default router;
