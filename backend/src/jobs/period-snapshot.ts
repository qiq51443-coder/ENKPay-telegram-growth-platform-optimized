import cron from 'node-cron';
import { query, transaction } from '../db';
import { getPairPrice, binanceFetch } from '../services/price.service';

let cronJob: cron.ScheduledTask | null = null;
let isRunning = false;

async function runPeriodSnapshot(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    // Query all pending sessions whose start_time has arrived,
    // plus any active sessions that are missing open_price (backfill)
    const pendingResult = await query(
      `SELECT ts.id, ts.pair_id, ts.start_time, ts.status, ts.open_price, tp.pair_type, tp.binance_symbol
       FROM trading_sessions ts
       JOIN trading_pairs tp ON ts.pair_id = tp.id
       WHERE (
           (ts.status = 'pending' AND ts.start_time <= NOW())
           OR
           (ts.status = 'active' AND ts.open_price IS NULL AND ts.start_time <= NOW())
         )
       ORDER BY ts.start_time ASC
       LIMIT 100`,
      []
    );

    if (pendingResult.rows.length === 0) return;
    console.log(`[period-snapshot] Found ${pendingResult.rows.length} pending sessions to activate`);

    for (const session of pendingResult.rows) {
      try {
        let openPrice: number | null = null;

        // Step 1: price near start_time (-30s/+5s window).
        //   Looks 30s backward to cover real-price-snapshot lag and only 5s forward
        //   because start_time is in the past when this job runs.
        const ppNearResult = await query(
          `SELECT price FROM price_points
           WHERE pair_id = $1
             AND timestamp BETWEEN ($2::timestamptz - INTERVAL '30 seconds')
                               AND ($2::timestamptz + INTERVAL '5 seconds')
           ORDER BY ABS(EXTRACT(EPOCH FROM (timestamp - $2::timestamptz))) ASC
           LIMIT 1`,
          [session.pair_id, session.start_time]
        );
        if (ppNearResult.rows.length > 0) {
          openPrice = parseFloat(ppNearResult.rows[0].price);
          console.log(`[period-snapshot] session ${session.id}: price_points near start_time → open_price=${openPrice}`);
        }

        // Step 2: any recent price_points (fallback)
        if (openPrice === null) {
          const ppLatestResult = await query(
            `SELECT price FROM price_points
             WHERE pair_id = $1 AND timestamp <= NOW()
             ORDER BY timestamp DESC LIMIT 1`,
            [session.pair_id]
          );
          if (ppLatestResult.rows.length > 0) {
            openPrice = parseFloat(ppLatestResult.rows[0].price);
            console.log(`[period-snapshot] session ${session.id}: latest price_points fallback → open_price=${openPrice}`);
          }
        }

        // Step 2b: for real pairs, fetch historical Binance kline at start_time
        if (openPrice === null && session.pair_type === 'real' && session.binance_symbol) {
          try {
            const startTimeMs = new Date(session.start_time).getTime();
            const klineData = await binanceFetch('/api/v3/klines', {
              symbol: session.binance_symbol,
              interval: '1m',
              startTime: startTimeMs,
              limit: 1,
            });
            if (Array.isArray(klineData) && klineData.length > 0) {
              openPrice = parseFloat(klineData[0][1]); // kline[1] = open price of the candle
              console.log(`[period-snapshot] session ${session.id}: Binance kline open_price=${openPrice} (start_time=${session.start_time})`);
            }
          } catch (klineErr: any) {
            console.warn(`[period-snapshot] session ${session.id}: Binance kline fallback failed: ${klineErr.message}`);
          }
        }

        // Step 3: live price via getPairPrice()
        if (openPrice === null) {
          try {
            const priceData = await getPairPrice(session.pair_id);
            if (priceData && priceData.price > 0) {
              openPrice = priceData.price;
              // Persist snapshot so auto-settle has a reference price_point
              await query(
                `INSERT INTO price_points (pair_id, price, timestamp) VALUES ($1, $2, NOW())`,
                [session.pair_id, openPrice]
              ).catch((e: any) => console.warn(`[period-snapshot] failed to persist price snapshot for pair ${session.pair_id}:`, e.message));
              console.log(`[period-snapshot] session ${session.id}: live price fallback → open_price=${openPrice}`);
            }
          } catch (priceErr: any) {
            console.error(`[period-snapshot] session ${session.id}: all price sources failed:`, priceErr.message);
          }
        }

        if (openPrice === null || openPrice <= 0) {
          const startedMinsAgo = (Date.now() - new Date(session.start_time).getTime()) / 60000;
          if (startedMinsAgo >= 5) {
            // Price still unavailable after 5 minutes — cancel the session and refund all bets
            // to prevent the session from being stuck indefinitely.
            console.warn(
              `[period-snapshot] [CANCEL] session ${session.id}: no price after ${startedMinsAgo.toFixed(1)}min, cancelling and refunding`
            );
            await query(
              `UPDATE trading_sessions SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
              [session.id]
            );
            await query(
              `UPDATE trading_orders SET status = 'cancelled', result = 'draw', profit = 0
               WHERE session_id = $1 AND status IN ('pending', 'active')`,
              [session.id]
            );
            const ordersResult = await query(
              `SELECT user_id, SUM(amount::numeric) AS total FROM trading_orders WHERE session_id = $1 AND result = 'draw' GROUP BY user_id`,
              [session.id]
            );
            for (const row of ordersResult.rows) {
              await query(
                `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
                [parseFloat(row.total), row.user_id]
              );
            }
            console.log(`[period-snapshot] session ${session.id}: cancelled and refunded`);
          } else {
            console.warn(
              `[period-snapshot] [WARN] session ${session.id} (pair_id=${session.pair_id}, start_time=${session.start_time}): ` +
              `cannot get open price (${startedMinsAgo.toFixed(1)}min ago) — skipping. Will retry next tick.`
            );
          }
          continue; // Do not fall through to the activation logic; never write open_price=0
        }

        // Activate session and orders atomically, with double-activation guard
        await transaction(async (client) => {
          // Guard: double-activation check
          const check = await client.query(
            `SELECT status, open_price FROM trading_sessions WHERE id = $1`,
            [session.id]
          );
          if (!check.rows.length) return;
          const currentStatus = check.rows[0].status;
          const currentOpenPrice = check.rows[0].open_price;

          if (currentStatus === 'settled' || currentStatus === 'cancelled') return;

          if (currentStatus === 'active' && currentOpenPrice !== null) {
            // Already active with a valid open_price — nothing to do
            return;
          }

          if (currentStatus === 'active' && currentOpenPrice === null) {
            // Backfill open_price for already-active sessions that missed it
            await client.query(
              `UPDATE trading_sessions SET open_price = $1 WHERE id = $2 AND open_price IS NULL`,
              [openPrice, session.id]
            );
            await client.query(
              `UPDATE trading_orders SET entry_price = COALESCE(entry_price, $1) WHERE session_id = $2 AND status = 'active'`,
              [openPrice, session.id]
            );
            return;
          }

          // Normal pending → active promotion
          await client.query(
            `UPDATE trading_sessions SET status = 'active', open_price = $1 WHERE id = $2 AND status = 'pending'`,
            [openPrice, session.id]
          );

          // Activate all pending orders under this session
          await client.query(
            `UPDATE trading_orders SET status = 'active', entry_price = $1 WHERE session_id = $2 AND status = 'pending'`,
            [openPrice, session.id]
          );
        });

        console.log(`[period-snapshot] session ${session.id} activated, open_price=${openPrice}`);
      } catch (err: any) {
        console.error(`[period-snapshot] error processing session ${session.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[period-snapshot] error:', err.message);
  } finally {
    isRunning = false;
  }
}

export function startPeriodSnapshot(): void {
  if (cronJob) {
    console.log('Period snapshot job already started');
    return;
  }
  // Run every 5 seconds
  cronJob = cron.schedule('*/5 * * * * *', async () => {
    await runPeriodSnapshot();
  });
  console.log('✓ Period snapshot job started (running every 5 seconds)');
  runPeriodSnapshot();
}

export function stopPeriodSnapshot(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Period snapshot job stopped');
  }
}
