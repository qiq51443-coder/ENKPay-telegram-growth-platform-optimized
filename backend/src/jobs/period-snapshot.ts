import cron from 'node-cron';
import { query } from '../db';
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

    for (const session of pendingResult.rows) {
      try {
        // Get opening price: latest price_points entry at or before start_time
        let openPrice: number | null = null;
        const ppResult = await query(
          `SELECT price FROM price_points
           WHERE pair_id = $1 AND timestamp <= $2
           ORDER BY timestamp DESC LIMIT 1`,
          [session.pair_id, session.start_time]
        );
        if (ppResult.rows.length > 0) {
          openPrice = parseFloat(ppResult.rows[0].price);
        } else {
          // Fallback: current live price
          try {
            const priceData = await getPairPrice(session.pair_id);
            openPrice = priceData.price;
          } catch {
            console.warn(`[period-snapshot] cannot get price for pair ${session.pair_id}, skipping session ${session.id}`);
            continue;
          }
        }

        // Activate session and record open_price
        await query(
          `UPDATE trading_sessions
           SET status = 'active', open_price = $1
           WHERE id = $2 AND status = 'pending'`,
          [openPrice, session.id]
        );

        // Activate all pending orders under this session and record entry_price
        await query(
          `UPDATE trading_orders
           SET status = 'active', entry_price = $1
           WHERE session_id = $2 AND status = 'pending'`,
          [openPrice, session.id]
        );

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
