import cron from 'node-cron';
import { query, transaction } from '../db';
import { getPairPrice } from '../services/price.service';

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
  if (openPrice > 0) {
    const priceDiff = Math.abs(closePrice - openPrice) / openPrice;
    if (priceDiff < DRAW_THRESHOLD_PERCENTAGE) return 'draw';
  }
  return closePrice >= openPrice ? 'up' : 'down';
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

  try {
    // Only settle sessions that are 'active' AND have ended
    const expiredSessionsResult = await query(
      `SELECT
         ts.id,
         ts.pair_id,
         ts.rule_id,
         ts.end_time,
         COALESCE(ts.open_price, ts.entry_price) as open_price,
         tr.direction as rule_direction,
         tr.force_result as rule_force_result
       FROM trading_sessions ts
       LEFT JOIN trading_rules tr ON ts.rule_id = tr.id
       WHERE ts.end_time <= NOW()
         AND ts.status = 'active'
       ORDER BY ts.end_time ASC
       LIMIT 50`,
      []
    );

    const sessions = expiredSessionsResult.rows;
    if (sessions.length === 0) {
      // Diagnostic: log sessions that are active/expired but have no open_price (cannot be settled)
      try {
        const skipped = await query(
          `SELECT id FROM trading_sessions
           WHERE status = 'active' AND end_time <= NOW() AND open_price IS NULL
           LIMIT 10`,
          []
        );
        if (skipped.rows.length > 0) {
          console.warn(
            `[auto-settle] ${skipped.rows.length} active session(s) skipped (open_price IS NULL): ` +
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

        // 1. Get close price from price_points within a time window around end_time.
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
          // 2. Fallback to live price; persist snapshot so the record exists for auditing
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
            console.error(`[auto-settle] [ALERT] session ${session.id}: cannot get any price, SKIPPING settlement`, priceErr);
            continue;
          }
        }

        // Get open_price, falling back to live price if the session's open_price was never set
        let openPrice: number;
        if (session.open_price == null) {
          console.warn(`[auto-settle] [WARN] session ${session.id}: open_price is null, trying live price as fallback`);
          try {
            const priceData = await getPairPrice(session.pair_id);
            openPrice = priceData.price;
            // Backfill open_price in DB so future runs and audits have a value
            await query(`UPDATE trading_sessions SET open_price = $1 WHERE id = $2`, [openPrice, session.id]);
          } catch (priceErr: any) {
            console.error(`[auto-settle] [ALERT] session ${session.id} (pair_id=${session.pair_id}): cannot get open_price, SKIPPING settlement`, priceErr);
            continue;
          }
        } else {
          openPrice = parseFloat(session.open_price);
        }

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
        await transaction(async (client) => {
          // Guard against double-settle
          const checkResult = await client.query(
            `SELECT status FROM trading_sessions WHERE id = $1`,
            [session.id]
          );
          if (!checkResult.rows.length || checkResult.rows[0].status === 'settled') return;

          // Get all active orders for this session
          const ordersResult = await client.query(
            `SELECT id, user_id, direction, amount, odds
             FROM trading_orders
             WHERE session_id = $1 AND status = 'active'`,
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
               SET result = $1, profit = $2, close_price = $3, settlement_price = $3, settled_at = NOW(), status = 'settled'
               WHERE id = $4`,
              [orderResult, profit, closePrice, order.id]
            );
          }

          const platformProfit = totalBetAmount - totalPayout;

          // Update session
          await client.query(
            `UPDATE trading_sessions
             SET status = 'settled',
                 result_direction = $1,
                 result = $1,
                 settlement_price = $2,
                 close_price = $2,
                 total_bet_amount = $3,
                 total_payout = $4,
                 order_count = $5,
                 settled_at = NOW()
             WHERE id = $6`,
            [resultDirection, closePrice, totalBetAmount, totalPayout, orders.length, session.id]
          );

          // Log settlement
          try {
            await client.query(
              `INSERT INTO trading_settlement_log
               (session_id, rule_id, result_direction, settlement_price, total_orders, total_bet_amount, total_payout, platform_profit)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [session.id, session.rule_id, resultDirection, closePrice, orders.length, totalBetAmount, totalPayout, platformProfit]
            );
          } catch { /* log table may not exist yet */ }

          console.log(
            `[auto-settle] session ${session.id} settled, result=${resultDirection}, close_price=${closePrice} ` +
            `(open=${openPrice}, orders=${orders.length}: win=${winningOrders}, lose=${losingOrders}, draw=${drawOrders})`
          );
        });
      } catch (err: any) {
        console.error(`[auto-settle] Error settling session ${session.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[auto-settle] Error:', err.message);
  } finally {
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
