import cron from 'node-cron';
import { query, transaction } from '../db';
import { getPairPrice } from '../services/price.service';

let cronJob: cron.ScheduledTask | null = null;
let isRunning = false;

async function runPeriodSnapshot(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    // Query all pending sessions whose start_time has arrived
    const pendingResult = await query(
      `SELECT ts.id, ts.pair_id, ts.start_time
       FROM trading_sessions ts
       WHERE ts.status = 'pending'
         AND ts.start_time <= NOW()
       ORDER BY ts.start_time ASC
       LIMIT 50`,
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
          console.warn(
            `[period-snapshot] [WARN] session ${session.id} (pair_id=${session.pair_id}, start_time=${session.start_time}): ` +
            `cannot get open price — skipping. Ensure real-price-snapshot or price-generator is running.`
          );
          continue;
        }

        // Activate session and orders atomically, with double-activation guard
        await transaction(async (client) => {
          // Guard: double-activation check
          const check = await client.query(
            `SELECT status FROM trading_sessions WHERE id = $1`,
            [session.id]
          );
          if (!check.rows.length || check.rows[0].status !== 'pending') return;

          // Activate session
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
