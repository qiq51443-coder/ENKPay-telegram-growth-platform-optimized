/**
 * auto-settle.ts
 *
 * Background cron job: settles all expired trading sessions every 10 seconds.
 *
 * Flow per session:
 *  1. Short-circuit: if admin pre-set force_result=true with result_direction +
 *     settlement_price already written, use those values directly.
 *  2. Otherwise, fetch close_price from Binance kline (real pairs) or price_points
 *     (custom pairs), then compute resultDirection via determineDirection().
 *  3. Inside a transaction with FOR UPDATE lock on trading_sessions, settle all
 *     active/pending orders using the shared executeSettlement() core.
 *  4. Write settlement log outside the transaction for audit purposes.
 *  5. If no price can be obtained, cancel the session and refund all orders.
 */

import cron from 'node-cron';
import { PoolClient } from 'pg';
import { query, transaction } from '../db';
import { binanceFetch, getPairPrice } from '../services/price.service';
import { executeSettlement } from '../services/trading-settlement.service';

const DRAW_THRESHOLD_PERCENTAGE = 0.0001;

let isRunning = false;
let cronJob: cron.ScheduledTask | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function determineDirection(openPrice: number, closePrice: number): string {
  if (!isFinite(openPrice) || !isFinite(closePrice) || isNaN(openPrice) || isNaN(closePrice)) {
    return 'draw';
  }
  if (openPrice > 0) {
    const priceDiff = Math.abs(closePrice - openPrice) / openPrice;
    if (priceDiff < DRAW_THRESHOLD_PERCENTAGE) return 'draw';
  }
  return closePrice >= openPrice ? 'up' : 'down';
}

/**
 * Cancel a session and refund all active/pending orders.
 * Uses FOR UPDATE on trading_sessions to prevent concurrent cancel+settle races.
 */
async function cancelSessionAndRefund(sessionId: number): Promise<void> {
  await transaction(async (client) => {
    const checkResult = await client.query(
      `SELECT status FROM trading_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (
      !checkResult.rows.length ||
      checkResult.rows[0].status === 'settled' ||
      checkResult.rows[0].status === 'cancelled'
    ) {
      return;
    }

    const ordersResult = await client.query(
      `SELECT id, user_id, amount
       FROM trading_orders
       WHERE session_id = $1 AND status IN ('active', 'pending')`,
      [sessionId]
    );

    if (ordersResult.rows.length > 0) {
      // Aggregate refund amounts per user (multiple orders possible)
      const refundByUser = new Map<number, number>();
      const orderIds: number[] = [];
      for (const order of ordersResult.rows) {
        const amount = parseFloat(order.amount);
        refundByUser.set(order.user_id, (refundByUser.get(order.user_id) ?? 0) + amount);
        orderIds.push(order.id);
      }

      const userIds = Array.from(refundByUser.keys());
      const amounts = userIds.map((uid) => refundByUser.get(uid)!);

      await client.query(
        `UPDATE users u
         SET wallet_balance = wallet_balance + v.refund
         FROM (SELECT unnest($1::int[]) AS user_id, unnest($2::numeric[]) AS refund) v
         WHERE u.id = v.user_id`,
        [userIds, amounts]
      );

      await client.query(
        `UPDATE trading_orders
         SET status = 'cancelled', result = 'draw', profit = 0
         WHERE id = ANY($1::int[])`,
        [orderIds]
      );
    }

    await client.query(
      `UPDATE trading_sessions SET status = 'cancelled' WHERE id = $1`,
      [sessionId]
    );
  });

  console.log(`[auto-settle] session ${sessionId}: cancelled and all orders refunded`);
}

// ---------------------------------------------------------------------------
// Fetch odds for a session rule
// ---------------------------------------------------------------------------

async function getRuleOdds(client: PoolClient, ruleId: number | null): Promise<number> {
  const DEFAULT_ODDS = 1.85;
  if (!ruleId) {
    const globalRule = await client.query(
      `SELECT odds FROM trading_rules
       WHERE pair_id IS NULL AND is_active = true
       ORDER BY id ASC LIMIT 1`,
      []
    );
    return globalRule.rows.length > 0 ? parseFloat(globalRule.rows[0].odds) : DEFAULT_ODDS;
  }
  const ruleRes = await client.query(
    `SELECT odds FROM trading_rules WHERE id = $1`,
    [ruleId]
  );
  return ruleRes.rows.length > 0 ? parseFloat(ruleRes.rows[0].odds) : DEFAULT_ODDS;
}

// ---------------------------------------------------------------------------
// Settle a single session inside a database transaction
// ---------------------------------------------------------------------------

interface SettleInTxResult {
  settled: boolean;
  orderCount: number;
  totalBetAmount: number;
  totalPayout: number;
  winningOrders: number;
  losingOrders: number;
  drawOrders: number;
}

async function settleSessionInTx(
  sessionId: number,
  resultDirection: string,
  closePrice: number,
  openPrice: number,
  ruleId: number | null
): Promise<SettleInTxResult> {
  let result: SettleInTxResult = {
    settled: false,
    orderCount: 0,
    totalBetAmount: 0,
    totalPayout: 0,
    winningOrders: 0,
    losingOrders: 0,
    drawOrders: 0,
  };

  await transaction(async (client) => {
    // Acquire row-level lock to prevent concurrent settle / cancel
    const checkResult = await client.query(
      `SELECT status FROM trading_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (
      !checkResult.rows.length ||
      checkResult.rows[0].status === 'settled' ||
      checkResult.rows[0].status === 'cancelled'
    ) {
      console.log(
        `[auto-settle] session ${sessionId}: already ${checkResult.rows[0]?.status ?? 'gone'}, skipping`
      );
      return;
    }

    // Promote pending → active before settlement
    if (checkResult.rows[0].status === 'pending') {
      await client.query(
        `UPDATE trading_sessions SET status = 'active' WHERE id = $1 AND status = 'pending'`,
        [sessionId]
      );
      await client.query(
        `UPDATE trading_orders SET status = 'active' WHERE session_id = $1 AND status = 'pending'`,
        [sessionId]
      );
    }

    // Load all active/pending orders
    const ordersResult = await client.query(
      `SELECT id, user_id, direction, amount, odds
       FROM trading_orders
       WHERE session_id = $1 AND status IN ('active', 'pending')`,
      [sessionId]
    );
    const orders = ordersResult.rows;
    const ruleOdds = await getRuleOdds(client, ruleId);

    // Execute core settlement (batch SQL)
    const stats = await executeSettlement(
      client,
      orders,
      resultDirection,
      closePrice,
      openPrice,
      ruleOdds
    );

    // Update the session
    await client.query(
      `UPDATE trading_sessions
       SET status           = 'settled',
           result_direction = $1,
           result           = $1,
           settlement_price = $2,
           close_price      = $2,
           open_price       = COALESCE(open_price, $3),
           total_bet_amount = $4,
           total_payout     = $5,
           order_count      = $6,
           settled_at       = NOW()
       WHERE id = $7`,
      [
        resultDirection,
        closePrice,
        openPrice,
        stats.totalBetAmount,
        stats.totalPayout,
        orders.length,
        sessionId,
      ]
    );

    result = {
      settled: true,
      orderCount: orders.length,
      totalBetAmount: stats.totalBetAmount,
      totalPayout: stats.totalPayout,
      winningOrders: stats.winningOrders,
      losingOrders: stats.losingOrders,
      drawOrders: stats.drawOrders,
    };
  });

  return result;
}

// ---------------------------------------------------------------------------
// Main settlement loop
// ---------------------------------------------------------------------------

async function autoSettleSessions(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const expiredSessionsResult = await query(
      `SELECT
         ts.id,
         ts.pair_id,
         ts.rule_id,
         ts.start_time,
         ts.end_time,
         ts.status,
         ts.open_price,
         ts.result_direction,
         ts.settlement_price,
         tr.direction      AS rule_direction,
         tr.force_result   AS rule_force_result,
         tp.pair_type,
         tp.binance_symbol
       FROM trading_sessions ts
       LEFT JOIN trading_rules tr ON ts.rule_id = tr.id
       LEFT JOIN trading_pairs tp ON ts.pair_id = tp.id
       WHERE ts.end_time <= NOW()
         AND ts.status IN ('active', 'pending')
       ORDER BY ts.end_time ASC
       LIMIT 20`,
      []
    );

    const sessions = expiredSessionsResult.rows;

    if (sessions.length === 0) {
      // Diagnostic: surface sessions that might be stuck for a different reason
      const diagnosticResult = await query(
        `SELECT id, status, end_time, open_price
         FROM trading_sessions
         WHERE status IN ('active', 'pending')
           AND end_time <= NOW()
         LIMIT 5`,
        []
      );
      if (diagnosticResult.rows.length > 0) {
        console.warn(
          `[auto-settle] No sessions matched main query but found ` +
          `${diagnosticResult.rows.length} session(s) in diagnostic check:`,
          diagnosticResult.rows
        );
      }
      return;
    }

    console.log(`[auto-settle] Found ${sessions.length} session(s) to settle`);

    for (const session of sessions) {
      try {
        console.log(
          `[auto-settle] Processing session ${session.id} ` +
          `(pair_id=${session.pair_id}, end_time=${session.end_time})...`
        );

        // ---------------------------------------------------------------
        // SHORT-CIRCUIT: admin-pre-set result – only when force_result=true
        // ---------------------------------------------------------------
        const adminForceResult =
          session.rule_force_result === true || session.rule_force_result === 't';

        if (adminForceResult && session.result_direction && session.settlement_price) {
          const closePrice: number = parseFloat(session.settlement_price);
          const openPrice: number =
            session.open_price != null ? parseFloat(session.open_price) : closePrice;
          const resultDirection: string = session.result_direction;

          console.log(
            `[auto-settle] session ${session.id}: ADMIN FORCE RESULT – ` +
            `direction=${resultDirection}, settlement_price=${closePrice} (skipping kline fetch)`
          );

          const stats = await settleSessionInTx(
            session.id,
            resultDirection,
            closePrice,
            openPrice,
            session.rule_id
          );

          if (stats.settled) {
            const platformProfit = stats.totalBetAmount - stats.totalPayout;
            try {
              await query(
                `INSERT INTO trading_settlement_log
                 (session_id, rule_id, result_direction, settlement_price,
                  total_orders, total_bet_amount, total_payout, platform_profit)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  session.id,
                  session.rule_id,
                  resultDirection,
                  closePrice,
                  stats.orderCount,
                  stats.totalBetAmount,
                  stats.totalPayout,
                  platformProfit,
                ]
              );
            } catch (logErr: any) {
              console.warn(
                `[auto-settle] session ${session.id}: settlement log insert failed ` +
                `(session_id=${session.id}, result=${resultDirection}, ` +
                `settlement_price=${closePrice}, platform_profit=${platformProfit}):`,
                logErr.message
              );
            }

            console.log(
              `[auto-settle] session ${session.id} SETTLED (admin force): ` +
              `result=${resultDirection}, close=${closePrice} ` +
              `(orders=${stats.orderCount}: win=${stats.winningOrders}, ` +
              `lose=${stats.losingOrders}, draw=${stats.drawOrders})`
            );
          }
          continue;
        }

        // ---------------------------------------------------------------
        // Normal settlement: fetch close_price from Binance or price_points
        // ---------------------------------------------------------------
        let closePrice: number;

        if (session.pair_type === 'real' && session.binance_symbol) {
          const ONE_MINUTE_MS = 60_000;
          const KLINE_END_BUFFER_MS = 5_000;
          try {
            const endTimeMs = new Date(session.end_time).getTime();
            const klineData = await binanceFetch('/api/v3/klines', {
              symbol: session.binance_symbol,
              interval: '1m',
              startTime: endTimeMs - ONE_MINUTE_MS,
              endTime: endTimeMs + KLINE_END_BUFFER_MS,
              limit: 2,
            });
            if (Array.isArray(klineData) && klineData.length > 0) {
              // Pick the kline whose open_time is the latest at or before end_time
              const validKlines = (klineData as any[][]).filter((k) => k[0] <= endTimeMs);
              if (validKlines.length === 0) {
                throw new Error(
                  `No valid kline at or before end_time for session ${session.id} ` +
                  `(endTimeMs=${endTimeMs})`
                );
              }
              const bestKline = validKlines.reduce(
                (best: any[], k: any[]) => (k[0] > best[0] ? k : best),
                validKlines[0]
              );
              closePrice = parseFloat(bestKline[4]);
              console.log(
                `[auto-settle] session ${session.id}: Binance kline close_price=${closePrice}`
              );
            } else {
              throw new Error('No kline data returned');
            }
          } catch (klineErr: any) {
            console.warn(
              `[auto-settle] session ${session.id}: Binance kline failed ` +
              `(${klineErr.message}), trying live price...`
            );
            try {
              const priceData = await getPairPrice(session.pair_id);
              closePrice = priceData.price;
              console.warn(
                `[auto-settle] session ${session.id}: using live price fallback ` +
                `close_price=${closePrice}`
              );
            } catch {
              console.warn(
                `[auto-settle] session ${session.id}: no price available, ` +
                `cancelling and refunding...`
              );
              await cancelSessionAndRefund(session.id);
              continue;
            }
          }
        } else {
          // Custom / simulated pair – look up price_points table
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
            try {
              const priceData = await getPairPrice(session.pair_id);
              closePrice = priceData.price;
              console.warn(
                `[auto-settle] session ${session.id}: no price_points, ` +
                `using live price close_price=${closePrice}`
              );
            } catch {
              console.warn(
                `[auto-settle] session ${session.id}: no price available, ` +
                `cancelling and refunding...`
              );
              await cancelSessionAndRefund(session.id);
              continue;
            }
          }
        }

        // ---------------------------------------------------------------
        // Resolve open_price
        // ---------------------------------------------------------------
        let openPrice: number;

        if (session.open_price != null) {
          openPrice = parseFloat(session.open_price);
        } else if (session.pair_type === 'real' && session.binance_symbol && session.start_time) {
          try {
            const startTimeMs = new Date(session.start_time).getTime();
            const startKlineData = await binanceFetch('/api/v3/klines', {
              symbol: session.binance_symbol,
              interval: '1m',
              startTime: startTimeMs,
              limit: 1,
            });
            if (Array.isArray(startKlineData) && startKlineData.length > 0) {
              openPrice = parseFloat((startKlineData as any[][])[0][1]);
              console.log(
                `[auto-settle] session ${session.id}: historical open_price=${openPrice}`
              );
            } else {
              throw new Error('No kline data for start_time');
            }
          } catch (err: any) {
            console.warn(
              `[auto-settle] session ${session.id}: cannot get open_price ` +
              `(${err.message}), cancelling...`
            );
            await cancelSessionAndRefund(session.id);
            continue;
          }
        } else {
          try {
            const priceData = await getPairPrice(session.pair_id);
            openPrice = priceData.price;
          } catch (priceErr: any) {
            console.warn(
              `[auto-settle] session ${session.id}: cannot get open_price ` +
              `(${priceErr.message}), cancelling...`
            );
            await cancelSessionAndRefund(session.id);
            continue;
          }
        }

        // ---------------------------------------------------------------
        // Determine result direction
        // ---------------------------------------------------------------
        let resultDirection: string;
        if (session.rule_id && session.rule_direction && adminForceResult) {
          // rule has force_result=true → use pre-set direction
          resultDirection = session.rule_direction;
        } else {
          resultDirection = determineDirection(openPrice, closePrice);
        }

        console.log(
          `[auto-settle] session ${session.id}: open=${openPrice}, ` +
          `close=${closePrice}, result=${resultDirection}`
        );

        // ---------------------------------------------------------------
        // Settle inside a transaction
        // ---------------------------------------------------------------
        const stats = await settleSessionInTx(
          session.id,
          resultDirection,
          closePrice,
          openPrice,
          session.rule_id
        );

        if (stats.settled) {
          const platformProfit = stats.totalBetAmount - stats.totalPayout;
          try {
            await query(
              `INSERT INTO trading_settlement_log
               (session_id, rule_id, result_direction, settlement_price,
                total_orders, total_bet_amount, total_payout, platform_profit)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                session.id,
                session.rule_id,
                resultDirection,
                closePrice,
                stats.orderCount,
                stats.totalBetAmount,
                stats.totalPayout,
                platformProfit,
              ]
            );
          } catch (logErr: any) {
            console.warn(
              `[auto-settle] session ${session.id}: settlement log insert failed ` +
              `(session_id=${session.id}, result=${resultDirection}, ` +
              `settlement_price=${closePrice}, platform_profit=${platformProfit}):`,
              logErr.message
            );
          }

          console.log(
            `[auto-settle] session ${session.id} SETTLED: result=${resultDirection}, ` +
            `close_price=${closePrice} (open=${openPrice}, ` +
            `orders=${stats.orderCount}: win=${stats.winningOrders}, ` +
            `lose=${stats.losingOrders}, draw=${stats.drawOrders})`
          );
        }
      } catch (err: any) {
        console.error(`[auto-settle] Error settling session ${session.id}:`, err.message);
      }
    }
  } finally {
    isRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Cron job lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the auto-settle cron job (runs every 10 seconds).
 * Called from src/index.ts after all other startup steps complete.
 */
export function startAutoSettle(): void {
  if (cronJob) return;
  cronJob = cron.schedule('*/10 * * * * *', () => {
    autoSettleSessions().catch((err) =>
      console.error('[auto-settle] Unexpected error:', err)
    );
  });
  console.log('[auto-settle] Started (runs every 10 seconds)');
}

/**
 * Stop the auto-settle cron job (used in tests / graceful shutdown).
 */
export function stopAutoSettle(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}
