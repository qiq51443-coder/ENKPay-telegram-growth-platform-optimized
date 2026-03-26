import cron from 'node-cron';
import { query, transaction } from '../db';
import { getPairPrice, binanceFetch } from '../services/price.service';

/**
 * Relative price difference below which a session result is considered a draw (0.01%).
 * Raised 10x from 0.00001 (0.001%) to 0.0001 (0.01%) to avoid micro-fluctuations being mis-classified as draws.
 */
const DRAW_THRESHOLD_PERCENTAGE = 0.0001;

let cronJob: cron.ScheduledTask | null = null;
let isRunning = false;

/**
 * Determine the result direction from open and close prices.
 * Returns 'up', 'down', or 'draw'.
 * If openPrice is not a positive number the draw threshold cannot be computed reliably,
 * so we fall through directly to the up/down comparison.
 */
function determineDirection(openPrice: number, closePrice: number): string {
  if (!isFinite(openPrice) || !isFinite(closePrice) || isNaN(openPrice) || isNaN(closePrice)) {
    return 'draw'; // Safe fallback: refund users when prices are invalid
  }
  if (openPrice > 0) {
    const priceDiff = Math.abs(closePrice - openPrice) / openPrice;
    if (priceDiff < DRAW_THRESHOLD_PERCENTAGE) return 'draw';
  }
  return closePrice >= openPrice ? 'up' : 'down';
}

/**
 * Cancel a session and refund all active orders.
 * Used as a last-resort fallback when pricing data is unavailable for an expired session.
 */
async function cancelSessionAndRefund(sessionId: string, closePrice?: number): Promise<void> {
  await transaction(async (client) => {
    const checkResult = await client.query(
      `SELECT status, open_price, entry_price FROM trading_sessions WHERE id = $1`,
      [sessionId]
    );
    if (!checkResult.rows.length || checkResult.rows[0].status === 'settled' || checkResult.rows[0].status === 'cancelled') return;

    const sessionRow = checkResult.rows[0];
    // Use provided closePrice, or fall back to open_price, then entry_price, then null
    let refundPrice: number | null = null;
    if (closePrice != null) {
      refundPrice = closePrice;
    } else if (sessionRow.open_price != null) {
      refundPrice = parseFloat(sessionRow.open_price);
    } else if (sessionRow.entry_price != null) {
      refundPrice = parseFloat(sessionRow.entry_price);
    }

    const ordersResult = await client.query(
      `SELECT id, user_id, amount FROM trading_orders WHERE session_id = $1 AND status IN ('active', 'pending')`,
      [sessionId]
    );
    let totalBetAmount = 0;
    for (const order of ordersResult.rows) {
      const amount = parseFloat(order.amount);
      totalBetAmount += amount;
      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
        [amount, order.user_id]
      );
      await client.query(
        `UPDATE trading_orders
         SET status = 'cancelled', result = 'draw', profit = 0,
             close_price = $1, settlement_price = $1, settled_at = NOW()
         WHERE id = $2`,
        [refundPrice, order.id]
      );
    }
    await client.query(
      `UPDATE trading_sessions
       SET status = 'cancelled',
           settlement_price = $1,
           close_price = $1,
           total_bet_amount = $2,
           total_payout = $2,
           settled_at = NOW()
       WHERE id = $3`,
      [refundPrice, totalBetAmount, sessionId]
    );
  });
}

/**
 * Auto-settle expired trading sessions
 */
async function autoSettleSessions(): Promise<void> {
  if (isRunning) {
    console.log('Auto-settle already running, skipping...');
    return;
  }
  isRunning = true;
  const lockTimeoutMs = 60_000;
  const lockTimer = setTimeout(() => {
    console.warn('[auto-settle] [WARN] isRunning lock timed out after 60s, force-resetting');
    isRunning = false;
  }, lockTimeoutMs);

  try {
    // Settle sessions that are 'active' OR 'pending' (stuck never activated) AND have ended
    const expiredSessionsResult = await query(
      `SELECT
         ts.id,
         ts.pair_id,
         ts.rule_id,
         ts.start_time,
         ts.end_time,
         ts.status,
         COALESCE(ts.open_price, ts.entry_price) as open_price,
         ts.result_direction,
         ts.settlement_price,
         tr.direction as rule_direction,
         tr.force_result as rule_force_result,
         tp.pair_type,
         tp.binance_symbol
       FROM trading_sessions ts
       LEFT JOIN trading_rules tr ON ts.rule_id = tr.id
       LEFT JOIN trading_pairs tp ON ts.pair_id = tp.id
       WHERE ts.end_time <= NOW()
         AND ts.status IN ('active', 'pending')
       ORDER BY ts.end_time ASC
       LIMIT 50`,
      []
    );

    const sessions = expiredSessionsResult.rows;
    if (sessions.length === 0) {
      // Diagnostic: log sessions that are active/pending/expired but have no open_price (cannot be settled)
      try {
        const skipped = await query(
          `SELECT id FROM trading_sessions
           WHERE status IN ('active', 'pending') AND end_time <= NOW() AND open_price IS NULL
           LIMIT 10`,
          []
        );
        if (skipped.rows.length > 0) {
          console.warn(
            `[auto-settle] ${skipped.rows.length} session(s) skipped (open_price IS NULL): ` +
            `ids=${skipped.rows.map((r: any) => r.id).join(', ')}`
          );
        }
      } catch { /* ignore diagnostic query errors */ }
      return;
    }

    console.log(`[auto-settle] Found ${sessions.length} expired active sessions to settle`);

    for (const session of sessions) {
      try {
        let closePrice: number;

        // 0. Short-circuit: if the session already has a settled result_direction and
        //    settlement_price (e.g. set by admin manual settlement or a previous run),
        //    use them directly and skip the Binance kline fetch entirely.
        if (session.result_direction && session.settlement_price) {
          closePrice = parseFloat(session.settlement_price);
          const openPrice = session.open_price != null ? parseFloat(session.open_price) : closePrice;
          const resultDirection = session.result_direction;
          console.log(
            `[auto-settle] session ${session.id}: using existing result_direction=${resultDirection}, settlement_price=${closePrice} (skipping kline fetch)`
          );

          let settledOrderCount = 0;
          let settledTotalBetAmount = 0;
          let settledTotalPayout = 0;
          let settledWinningOrders = 0;
          let settledLosingOrders = 0;
          let settledDrawOrders = 0;
          let isSettled = false;

          await transaction(async (client) => {
            const checkResult = await client.query(
              `SELECT status FROM trading_sessions WHERE id = $1 FOR UPDATE`,
              [session.id]
            );
            if (!checkResult.rows.length || checkResult.rows[0].status === 'settled' || checkResult.rows[0].status === 'cancelled') {
              console.log(`[auto-settle] session ${session.id}: already ${checkResult.rows[0]?.status ?? 'gone'}, skipping`);
              return;
            }

            if (checkResult.rows[0].status === 'pending') {
              await client.query(
                `UPDATE trading_sessions SET status = 'active' WHERE id = $1 AND status = 'pending'`,
                [session.id]
              );
              await client.query(
                `UPDATE trading_orders SET status = 'active' WHERE session_id = $1 AND status = 'pending'`,
                [session.id]
              );
            }

            const ordersResult = await client.query(
              `SELECT id, user_id, direction, amount, odds, entry_price, status
               FROM trading_orders
               WHERE session_id = $1 AND status IN ('active', 'pending')`,
              [session.id]
            );
            const orders = ordersResult.rows;

            let totalBetAmount = 0;
            let totalPayout = 0;
            let winningOrders = 0;
            let losingOrders = 0;
            let drawOrders = 0;

            let ruleOdds = 1.85;
            if (session.rule_id) {
              const ruleRes = await client.query(`SELECT odds FROM trading_rules WHERE id = $1`, [session.rule_id]);
              if (ruleRes.rows.length > 0) ruleOdds = parseFloat(ruleRes.rows[0].odds);
            } else {
              const globalRule = await client.query(
                `SELECT odds FROM trading_rules WHERE pair_id IS NULL AND is_active = true ORDER BY id ASC LIMIT 1`,
                []
              );
              if (globalRule.rows.length > 0) ruleOdds = parseFloat(globalRule.rows[0].odds);
            }

            for (const order of orders) {
              const amount = parseFloat(order.amount);
              const orderOdds = order.odds ? parseFloat(order.odds) : ruleOdds;
              totalBetAmount += amount;

              let orderResult: string;
              let profit: number;
              let payout: number;

              if (resultDirection === 'draw') {
                orderResult = 'draw';
                profit = 0;
                payout = amount;
                drawOrders++;
                await client.query(
                  `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
                  [payout, order.user_id]
                );
                totalPayout += payout;
              } else if (order.direction === resultDirection) {
                orderResult = 'win';
                payout = amount * orderOdds;
                profit = payout - amount;
                winningOrders++;
                totalPayout += payout;
                await client.query(
                  `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
                  [payout, order.user_id]
                );
              } else {
                orderResult = 'lose';
                payout = 0;
                profit = -amount;
                losingOrders++;
              }

              await client.query(
                `UPDATE users SET reward_unlock_traded = COALESCE(reward_unlock_traded, 0) + $1 WHERE id = $2`,
                [amount, order.user_id]
              );

              await client.query(
                `UPDATE trading_orders
                 SET result = $1, profit = $2, close_price = $3, settlement_price = $3, settled_at = NOW(), status = 'settled',
                     entry_price = COALESCE(entry_price, $4)
                 WHERE id = $5`,
                [orderResult, profit, closePrice, openPrice, order.id]
              );
            }

            await client.query(
              `UPDATE trading_sessions
               SET status = 'settled',
                   result_direction = $1,
                   result = $1,
                   settlement_price = $2,
                   close_price = $2,
                   open_price = COALESCE(open_price, $3),
                   total_bet_amount = $4,
                   total_payout = $5,
                   order_count = $6,
                   settled_at = NOW()
               WHERE id = $7`,
              [resultDirection, closePrice, openPrice, totalBetAmount, totalPayout, orders.length, session.id]
            );

            settledOrderCount = orders.length;
            settledTotalBetAmount = totalBetAmount;
            settledTotalPayout = totalPayout;
            settledWinningOrders = winningOrders;
            settledLosingOrders = losingOrders;
            settledDrawOrders = drawOrders;
            isSettled = true;
          });

          if (isSettled) {
            const platformProfit = settledTotalBetAmount - settledTotalPayout;
            try {
              await query(
                `INSERT INTO trading_settlement_log
                 (session_id, rule_id, result_direction, settlement_price, total_orders, total_bet_amount, total_payout, platform_profit)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [session.id, session.rule_id, resultDirection, closePrice, settledOrderCount, settledTotalBetAmount, settledTotalPayout, platformProfit]
              );
            } catch (logErr: any) { console.warn(`[auto-settle] session ${session.id}: settlement log insert failed (non-critical):`, logErr.message); }

            console.log(
              `[auto-settle] session ${session.id} settled (from existing result), result=${resultDirection}, close_price=${closePrice} ` +
              `(open=${openPrice}, orders=${settledOrderCount}: win=${settledWinningOrders}, lose=${settledLosingOrders}, draw=${settledDrawOrders})`
            );
          }
          continue;
        }

        // 1. For real (Binance) pairs, fetch the 1-minute kline that covers the session end_time.
        //    This gives the accurate close price at session end, independent of price_points.
        if (session.pair_type === 'real' && session.binance_symbol) {
          const KLINE_WINDOW_MS = 120_000;
          try {
            const endTimeMs = new Date(session.end_time).getTime();
            const klineData = await binanceFetch('/api/v3/klines', {
              symbol: session.binance_symbol,
              interval: '1m',
              startTime: endTimeMs - KLINE_WINDOW_MS,
              endTime: endTimeMs + KLINE_WINDOW_MS,
              limit: 5,
            });
            if (Array.isArray(klineData) && klineData.length > 0) {
              // Pick the kline whose open time is the latest at or before end_time
              const validKlines = klineData.filter((k: any[]) => k[0] <= endTimeMs);
              if (validKlines.length === 0) throw new Error(`No valid kline at or before end_time for session ${session.id} (endTimeMs=${endTimeMs})`);
              const bestKline = validKlines.reduce((best: any, k: any) => k[0] > best[0] ? k : best, validKlines[0]);
              closePrice = parseFloat(bestKline[4]); // close price
              console.log(`[auto-settle] session ${session.id}: real pair close price from Binance kline=${closePrice} (end_time=${session.end_time})`);
            } else {
              throw new Error('No kline data returned');
            }
          } catch (klineErr: any) {
            console.warn(`[auto-settle] session ${session.id}: Binance kline fetch failed (${klineErr.message}), falling back to live price`);
            try {
              const priceData = await getPairPrice(session.pair_id);
              closePrice = priceData.price;
              console.warn(`[auto-settle] [ALERT] session ${session.id}: used live price fallback ${closePrice}`);
            } catch (priceErr) {
              const expiredMinsAgo = (Date.now() - new Date(session.end_time).getTime()) / 60000;
              if (expiredMinsAgo > 2) {
                console.warn(`[auto-settle] [CANCEL] session ${session.id}: no price after ${expiredMinsAgo.toFixed(1)}min, cancelling and refunding orders`);
                try {
                  await cancelSessionAndRefund(session.id);
                } catch (cancelErr: any) {
                  console.error(`[auto-settle] [CANCEL] failed to cancel session ${session.id}:`, cancelErr.message);
                }
              } else {
                console.error(`[auto-settle] [ALERT] session ${session.id}: cannot get any price, SKIPPING settlement`, priceErr);
              }
              continue;
            }
          }
        } else {
          // 2. For custom pairs, get close price from price_points within a time window around end_time.
          //    Window extended to -120s/+30s to cover custom pairs with sparse tick data (5s interval).
          const ppResult = await query(
            `SELECT price FROM price_points
             WHERE pair_id = $1
               AND timestamp BETWEEN ($2::timestamptz - INTERVAL '120 seconds')
                                 AND ($2::timestamptz + INTERVAL '30 seconds')
             ORDER BY ABS(EXTRACT(EPOCH FROM (timestamp - $2::timestamptz))) ASC
             LIMIT 1`,
            [session.pair_id, session.end_time]
          );

          if (ppResult.rows.length > 0) {
            closePrice = parseFloat(ppResult.rows[0].price);
          } else {
            // 3. Fallback to live price; persist snapshot so the record exists for auditing
            try {
              const priceData = await getPairPrice(session.pair_id);
              closePrice = priceData.price;
              console.warn(`[auto-settle] [ALERT] session ${session.id}: no price_points data, used live price ${closePrice}`);
              // Persist the fallback price as a snapshot for audit trail
              await query(
                `INSERT INTO price_points (pair_id, price, timestamp) VALUES ($1, $2, NOW())`,
                [session.pair_id, closePrice]
              ).catch((e: any) => console.warn(`[auto-settle] failed to persist fallback snapshot for session ${session.id} pair ${session.pair_id}:`, e.message));
            } catch (priceErr) {
              // Cannot get close price — if session has been expired for more than 2 minutes, cancel and refund
              const expiredMinsAgo = (Date.now() - new Date(session.end_time).getTime()) / 60000;
              if (expiredMinsAgo > 2) {
                console.warn(`[auto-settle] [CANCEL] session ${session.id}: no price after ${expiredMinsAgo.toFixed(1)}min, cancelling and refunding orders`);
                try {
                  await cancelSessionAndRefund(session.id);
                } catch (cancelErr: any) {
                  console.error(`[auto-settle] [CANCEL] failed to cancel session ${session.id}:`, cancelErr.message);
                }
              } else {
                console.error(`[auto-settle] [ALERT] session ${session.id}: cannot get any price, SKIPPING settlement`, priceErr);
              }
              continue;
            }
          }
        }

        // Get open_price, falling back to Binance historical kline at start_time for real pairs,
        // or to live price for custom pairs if the session's open_price was never set.
        let openPrice: number;
        if (session.open_price == null) {
          if (session.pair_type === 'real' && session.binance_symbol && session.start_time) {
            // Use the 1m Binance kline at start_time to get the correct historical open price
            console.warn(`[auto-settle] [WARN] session ${session.id}: open_price is null, fetching historical kline at start_time`);
            try {
              const startTimeMs = new Date(session.start_time).getTime();
              const startKlineData = await binanceFetch('/api/v3/klines', {
                symbol: session.binance_symbol,
                interval: '1m',
                startTime: startTimeMs,
                limit: 1,
              });
              if (Array.isArray(startKlineData) && startKlineData.length > 0) {
                openPrice = parseFloat(startKlineData[0][1]); // kline[1] = open price of the candle
                // Backfill open_price in DB for audit trail
                await query(`UPDATE trading_sessions SET open_price = $1 WHERE id = $2`, [openPrice, session.id]);
                console.log(`[auto-settle] session ${session.id}: historical kline open_price=${openPrice} (start_time=${session.start_time})`);
              } else {
                throw new Error('No kline data returned for start_time');
              }
            } catch (klineErr: any) {
              console.warn(
                `[auto-settle] [WARN] session ${session.id}: cannot get historical open_price via kline (${klineErr.message}), ` +
                `using close_price=${closePrice} as open_price (result will be draw)`
              );
              openPrice = closePrice; // draw fallback: open == close → refund users
              await query(`UPDATE trading_sessions SET open_price = $1 WHERE id = $2`, [openPrice, session.id]);
            }
          } else {
            // For custom pairs: fall back to live price as before
            console.warn(`[auto-settle] [WARN] session ${session.id}: open_price is null, trying live price as fallback`);
            try {
              const priceData = await getPairPrice(session.pair_id);
              openPrice = priceData.price;
              // Backfill open_price in DB so future runs and audits have a value
              await query(`UPDATE trading_sessions SET open_price = $1 WHERE id = $2`, [openPrice, session.id]);
            } catch (priceErr: any) {
              // Cannot get open_price — use closePrice as draw fallback if session just expired;
              // cancel and refund if price data has been unavailable for too long
              const expiredMinsAgo = (Date.now() - new Date(session.end_time).getTime()) / 60000;
              if (expiredMinsAgo > 2) {
                console.warn(`[auto-settle] [CANCEL] session ${session.id}: no open_price after ${expiredMinsAgo.toFixed(1)}min, cancelling and refunding orders`);
                try {
                  await cancelSessionAndRefund(session.id, closePrice);
                } catch (cancelErr: any) {
                  console.error(`[auto-settle] [CANCEL] failed to cancel session ${session.id}:`, cancelErr.message);
                }
                continue;
              } else {
                console.warn(
                  `[auto-settle] [WARN] session ${session.id}: cannot get open_price via live price (${priceErr.message}), ` +
                  `using close_price=${closePrice} as open_price (result will be draw)`
                );
                openPrice = closePrice; // draw fallback: open == close → refund users
                await query(`UPDATE trading_sessions SET open_price = $1 WHERE id = $2`, [openPrice, session.id]);
              }
            }
          }
        } else {
          openPrice = parseFloat(session.open_price);
        }

        // Diagnostic log: always record open/close prices and their sources for auditability.
        // This makes it easy to verify that open and close prices are from aligned klines.
        const openSource = session.open_price != null ? 'db' : 'kline@start_time';
        console.log(
          `[auto-settle] session ${session.id} (${session.period_label ?? 'no-label'}): ` +
          `open=${openPrice} (from ${openSource}), ` +
          `close=${closePrice} (from kline@end_time), ` +
          `result=${determineDirection(openPrice, closePrice)}`
        );

        // 3. Determine result direction.
        //    ALWAYS use real price comparison as the primary logic.
        //    rule_direction is ONLY applied when the rule explicitly marks force_result = true,
        //    which indicates the admin has intentionally overridden the result for this rule.
        //    If force_result column doesn't exist (older DB schema), we safely fall back to price comparison.
        let resultDirection: string;
        const adminForceResult = session.rule_force_result === true || session.rule_force_result === 't';
        if (session.rule_id && session.rule_direction && adminForceResult) {
          // Admin explicitly forced a result direction for this rule
          resultDirection = session.rule_direction;
          console.log(`[auto-settle] session ${session.id}: using admin-forced direction=${resultDirection} (rule_id=${session.rule_id})`);
        } else {
          // Normal price-based settlement (correct behaviour)
          resultDirection = determineDirection(openPrice, closePrice);
        }

        // 4. Settle session + orders in a transaction
        // Capture totals outside so settlement log can be written after the transaction commits
        let settledOrderCount = 0;
        let settledTotalBetAmount = 0;
        let settledTotalPayout = 0;
        let settledWinningOrders = 0;
        let settledLosingOrders = 0;
        let settledDrawOrders = 0;
        let isSettled = false;

        await transaction(async (client) => {
          // Guard against double-settle — use FOR UPDATE to lock the row and prevent races
          const checkResult = await client.query(
            `SELECT status FROM trading_sessions WHERE id = $1 FOR UPDATE`,
            [session.id]
          );
          if (!checkResult.rows.length || checkResult.rows[0].status === 'settled' || checkResult.rows[0].status === 'cancelled') return;

          // If the session is still 'pending' at settlement time (was never activated by
          // period-snapshot), promote it to 'active' now so the settle logic proceeds correctly.
          if (checkResult.rows[0].status === 'pending') {
            await client.query(
              `UPDATE trading_sessions SET status = 'active' WHERE id = $1 AND status = 'pending'`,
              [session.id]
            );
            await client.query(
              `UPDATE trading_orders SET status = 'active' WHERE session_id = $1 AND status = 'pending'`,
              [session.id]
            );
          }

          // Get all active orders for this session
          const ordersResult = await client.query(
            `SELECT id, user_id, direction, amount, odds, entry_price, status
             FROM trading_orders
             WHERE session_id = $1 AND status IN ('active', 'pending')`,
            [session.id]
          );
          const orders = ordersResult.rows;

          let totalBetAmount = 0;
          let totalPayout = 0;
          let winningOrders = 0;
          let losingOrders = 0;
          let drawOrders = 0;

          // Get default odds
          let ruleOdds = 1.85;
          if (session.rule_id) {
            const ruleRes = await client.query(`SELECT odds FROM trading_rules WHERE id = $1`, [session.rule_id]);
            if (ruleRes.rows.length > 0) ruleOdds = parseFloat(ruleRes.rows[0].odds);
          } else {
            const globalRule = await client.query(
              `SELECT odds FROM trading_rules WHERE pair_id IS NULL AND is_active = true ORDER BY id ASC LIMIT 1`,
              []
            );
            if (globalRule.rows.length > 0) ruleOdds = parseFloat(globalRule.rows[0].odds);
          }

          for (const order of orders) {
            const amount = parseFloat(order.amount);
            const orderOdds = order.odds ? parseFloat(order.odds) : ruleOdds;
            totalBetAmount += amount;

            let orderResult: string;
            let profit: number;
            let payout: number;

            if (resultDirection === 'draw') {
              // draw: full refund, profit = 0
              orderResult = 'draw';
              profit = 0;
              payout = amount;
              drawOrders++;
              await client.query(
                `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
                [payout, order.user_id]
              );
              totalPayout += payout;
            } else if (order.direction === resultDirection) {
              // Win
              orderResult = 'win';
              payout = amount * orderOdds;
              profit = payout - amount;
              winningOrders++;
              totalPayout += payout;
              await client.query(
                `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
                [payout, order.user_id]
              );
            } else {
              // Lose
              orderResult = 'lose';
              payout = 0;
              profit = -amount;
              losingOrders++;
            }

            // Track trading volume for reward unlock
            await client.query(
              `UPDATE users SET reward_unlock_traded = COALESCE(reward_unlock_traded, 0) + $1 WHERE id = $2`,
              [amount, order.user_id]
            );

            await client.query(
              `UPDATE trading_orders
               SET result = $1, profit = $2, close_price = $3, settlement_price = $3, settled_at = NOW(), status = 'settled',
                   entry_price = COALESCE(entry_price, $4)
               WHERE id = $5`,
              [orderResult, profit, closePrice, openPrice, order.id]
            );
          }

          // Update session — include open_price backfill so it is atomically committed
          await client.query(
            `UPDATE trading_sessions
             SET status = 'settled',
                 result_direction = $1,
                 result = $1,
                 settlement_price = $2,
                 close_price = $2,
                 open_price = COALESCE(open_price, $3),
                 total_bet_amount = $4,
                 total_payout = $5,
                 order_count = $6,
                 settled_at = NOW()
             WHERE id = $7`,
            [resultDirection, closePrice, openPrice, totalBetAmount, totalPayout, orders.length, session.id]
          );

          // Capture totals for the settlement log written after this transaction commits
          settledOrderCount = orders.length;
          settledTotalBetAmount = totalBetAmount;
          settledTotalPayout = totalPayout;
          settledWinningOrders = winningOrders;
          settledLosingOrders = losingOrders;
          settledDrawOrders = drawOrders;
          isSettled = true;
        });

        // Write settlement log OUTSIDE the transaction so that issues with the log
        // table (missing columns, constraints, etc.) cannot roll back the settlement.
        if (isSettled) {
          const platformProfit = settledTotalBetAmount - settledTotalPayout;
          try {
            await query(
              `INSERT INTO trading_settlement_log
               (session_id, rule_id, result_direction, settlement_price, total_orders, total_bet_amount, total_payout, platform_profit)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [session.id, session.rule_id, resultDirection, closePrice, settledOrderCount, settledTotalBetAmount, settledTotalPayout, platformProfit]
            );
          } catch (logErr: any) { console.warn(`[auto-settle] session ${session.id}: settlement log insert failed (non-critical):`, logErr.message); }

          console.log(
            `[auto-settle] session ${session.id} settled, result=${resultDirection}, close_price=${closePrice} ` +
            `(open=${openPrice}, orders=${settledOrderCount}: win=${settledWinningOrders}, lose=${settledLosingOrders}, draw=${settledDrawOrders})`
          );
        }
      } catch (err: any) {
        console.error(`[auto-settle] Error settling session ${session.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[auto-settle] Error:', err.message);
  } finally {
    clearTimeout(lockTimer);
    isRunning = false;
  }
}

/**
 * Start the auto-settle cron job
 */
export function startAutoSettle(): void {
  if (cronJob) {
    console.log('Auto-settle already started');
    return;
  }

  // Run every 10 seconds
  cronJob = cron.schedule('*/10 * * * * *', async () => {
    await autoSettleSessions();
  });

  console.log('✓ Auto-settle job started (running every 10 seconds)');

  // Run once immediately
  autoSettleSessions();
}

/**
 * Stop the auto-settle job
 */
export function stopAutoSettle(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Auto-settle job stopped');
  }
}
