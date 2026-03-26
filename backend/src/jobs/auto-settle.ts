/**
 * auto-settle.ts
 *
 * Background cron job: settles all expired trading sessions every 10 seconds.
 *
 * Flow per session:
 *  1. Resolve close_price: use admin-preset settlement_price when available,
 *     otherwise fetch from Binance kline (real pairs) or price_points (custom pairs).
 *  2. Resolve open_price from the session record or Binance historical kline.
 *  3. Delegate all settlement logic (direction determination, order updates,
 *     balance payouts, session update, log write) to settleSession() in the
 *     trading-settlement service.
 *  4. If no price can be obtained, cancel the session and refund all orders.
 */

import cron from 'node-cron';
import { query, transaction } from '../db';
import { binanceFetch, getPairPrice, okxKlineFetch } from '../services/price.service';
import { settleSession } from '../services/trading-settlement.service';

let isRunning = false;
let cronJob: cron.ScheduledTask | null = null;

// ---------------------------------------------------------------------------
// Cancel & refund helper
// ---------------------------------------------------------------------------

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
// Price resolution helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the close price for a session.
 * For real pairs: Binance kline at end_time, with live-price fallback.
 * For custom pairs: nearest price_points entry, with live-price fallback.
 * Returns null when no price can be obtained.
 */
async function fetchClosePrice(session: {
  id: number;
  pair_id: number;
  end_time: Date | string;
  pair_type: string;
  binance_symbol: string | null;
}): Promise<number | null> {
  if (session.pair_type === 'real' && session.binance_symbol) {
    const ONE_MINUTE_MS = 60_000;
    const KLINE_END_BUFFER_MS = 2_000;
    const endTimeMs = new Date(session.end_time).getTime();

    let klineData: any[][] | null = null;
    try {
      klineData = await binanceFetch('/api/v3/klines', {
        symbol: session.binance_symbol,
        interval: '1m',
        startTime: endTimeMs - ONE_MINUTE_MS,
        endTime: endTimeMs + KLINE_END_BUFFER_MS,
        limit: 3,
      });
    } catch (klineErr: any) {
      console.warn(
        `[auto-settle] session ${session.id}: Binance kline failed ` +
        `(${klineErr.message}), trying OKX kline...`
      );
      try {
        klineData = await okxKlineFetch(session.binance_symbol!, '1m', {
          startTime: endTimeMs - ONE_MINUTE_MS,
          endTime: endTimeMs + KLINE_END_BUFFER_MS,
          limit: 3,
        });
        console.log(`[auto-settle] session ${session.id}: OKX kline fallback succeeded`);
      } catch (okxErr: any) {
        console.warn(
          `[auto-settle] session ${session.id}: OKX kline also failed ` +
          `(${okxErr.message}), trying live price...`
        );
      }
    }

    if (klineData && Array.isArray(klineData) && klineData.length > 0) {
      const validKlines = (klineData as any[][]).filter((k) => k[0] < endTimeMs);
      if (validKlines.length > 0) {
        const bestKline = validKlines.reduce(
          (best: any[], k: any[]) => (k[0] > best[0] ? k : best),
          validKlines[0]
        );
        const price = parseFloat(bestKline[4]);
        console.log(
          `[auto-settle] session ${session.id}: close_price=${price} ` +
          `from kline at ${new Date(bestKline[0]).toISOString()}`
        );
        return price;
      }
    }
    // Live-price fallback
    try {
      const priceData = await getPairPrice(session.pair_id);
      console.warn(
        `[auto-settle] session ${session.id}: using live price fallback close_price=${priceData.price}`
      );
      return priceData.price;
    } catch {
      return null;
    }
  }

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
    return parseFloat(ppResult.rows[0].price);
  }
  try {
    const priceData = await getPairPrice(session.pair_id);
    console.warn(
      `[auto-settle] session ${session.id}: no price_points, ` +
      `using live price close_price=${priceData.price}`
    );
    return priceData.price;
  } catch {
    return null;
  }
}

/**
 * Resolve the open price for a session.
 * Returns the stored session.open_price when present; otherwise fetches the
 * historical Binance kline open at session start_time (real pairs) or live
 * price (custom pairs). Falls back to null on failure.
 */
async function fetchOpenPrice(session: {
  id: number;
  pair_id: number;
  start_time: Date | string | null;
  open_price: string | number | null;
  pair_type: string;
  binance_symbol: string | null;
}): Promise<number | null> {
  if (session.open_price != null) {
    return parseFloat(String(session.open_price));
  }

  if (session.pair_type === 'real' && session.binance_symbol && session.start_time) {
    const startTimeMs = new Date(session.start_time).getTime();

    let startKlineData: any[][] | null = null;
    try {
      startKlineData = await binanceFetch('/api/v3/klines', {
        symbol: session.binance_symbol,
        interval: '1m',
        startTime: startTimeMs - 60_000,
        endTime: startTimeMs + 5_000,
        limit: 2,
      });
    } catch (klineErr: any) {
      console.warn(
        `[auto-settle] session ${session.id}: Binance open_price kline failed ` +
        `(${klineErr.message}), trying OKX kline...`
      );
      try {
        startKlineData = await okxKlineFetch(session.binance_symbol!, '1m', {
          startTime: startTimeMs - 60_000,
          endTime: startTimeMs + 5_000,
          limit: 2,
        });
      } catch (okxErr: any) {
        console.warn(
          `[auto-settle] session ${session.id}: OKX open_price kline also failed ` +
          `(${okxErr.message}), will settle as draw`
        );
      }
    }

    if (startKlineData && Array.isArray(startKlineData) && startKlineData.length > 0) {
      const validKlines = (startKlineData as any[][]).filter((k) => k[0] <= startTimeMs);
      if (validKlines.length > 0) {
        const best = validKlines.reduce(
          (b: any[], k: any[]) => (k[0] > b[0] ? k : b),
          validKlines[0]
        );
        const price = parseFloat(best[1]);
        console.log(
          `[auto-settle] session ${session.id}: fetched historical open_price=${price} ` +
          `from kline at ${new Date(best[0]).toISOString()}`
        );
        return price;
      }
      return parseFloat((startKlineData as any[][])[0][1]);
    }
    return null;
  }

  try {
    const priceData = await getPairPrice(session.pair_id);
    return priceData.price;
  } catch {
    return null;
  }
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
         ts.start_time,
         ts.end_time,
         ts.status,
         ts.open_price,
         ts.settlement_price,
         tp.pair_type,
         tp.binance_symbol
       FROM trading_sessions ts
       LEFT JOIN trading_pairs tp ON ts.pair_id = tp.id
       WHERE ts.end_time <= NOW()
         AND ts.status IN ('active', 'pending')
       ORDER BY ts.end_time ASC
       LIMIT 100`,
      []
    );

    const sessions = expiredSessionsResult.rows;

    if (sessions.length === 0) {
      return;
    }

    console.log(`[auto-settle] Found ${sessions.length} session(s) to settle`);

    for (const session of sessions) {
      try {
        console.log(
          `[auto-settle] Processing session ${session.id} ` +
          `(pair_id=${session.pair_id}, end_time=${session.end_time})...`
        );

        // Resolve close price.
        // Admin-preset settlement_price takes priority; otherwise fetch from Binance/price_points.
        let closePrice: number | null =
          session.settlement_price != null
            ? parseFloat(session.settlement_price)
            : await fetchClosePrice(session);

        if (closePrice == null) {
          console.warn(
            `[auto-settle] session ${session.id}: no price available, cancelling and refunding...`
          );
          await cancelSessionAndRefund(session.id);
          continue;
        }

        // Resolve open price (pass to service so it doesn't need a second DB look-up)
        const openPrice = await fetchOpenPrice(session);

        // Delegate all settlement logic to the unified service function
        const summary = await settleSession(
          session.id,
          closePrice,
          openPrice ?? undefined
        );

        console.log(
          `[auto-settle] session ${session.id} SETTLED: result=${summary.resultDirection}, ` +
          `orders=${summary.totalOrders} ` +
          `(win=${summary.winningOrders}, lose=${summary.losingOrders}, draw=${summary.drawOrders})`
        );
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
