/**
 * real-price-snapshot.ts
 *
 * 每3秒对所有 is_active=true 且 pair_type='real' 的交易对拉取 Binance 实时价格，
 * 并批量写入 price_points 表，供 period-snapshot 和 auto-settle 精确查价。
 *
 * 这是修复"real 类型交易对 price_points 无数据导致 fallback 取价不准"的核心 job。
 */
import cron from 'node-cron';
import { query } from '../db';
import { getPairPrice } from '../services/price.service';

let cronJob: cron.ScheduledTask | null = null;
let isRunning = false;

async function runRealPriceSnapshot(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const pairsResult = await query(
      `SELECT id, binance_symbol, symbol FROM trading_pairs
       WHERE pair_type = 'real' AND is_active = true`,
      []
    );

    const pairs = pairsResult.rows;
    if (pairs.length === 0) return;

    await Promise.allSettled(
      pairs.map(async (pair) => {
        try {
          const priceData = await getPairPrice(pair.id);
          if (!priceData || priceData.price <= 0) return;
          // Write snapshot to price_points for accurate historical lookup
          await query(
            `INSERT INTO price_points (pair_id, price, timestamp)
             VALUES ($1, $2, NOW())`,
            [pair.id, priceData.price]
          );
          // Keep trading_pairs.current_price up-to-date
          await query(
            `UPDATE trading_pairs
             SET current_price = $1, last_price_update = NOW()
             WHERE id = $2`,
            [priceData.price, pair.id]
          );
        } catch (err: any) {
          // Non-fatal: log but don't stop other pairs
          console.warn(`[real-price-snapshot] pair ${pair.id} (${pair.symbol}): ${err.message}`);
        }
      })
    );
  } catch (err: any) {
    console.error('[real-price-snapshot] error:', err.message);
  } finally {
    isRunning = false;
  }
}

export function startRealPriceSnapshot(): void {
  if (cronJob) {
    console.log('Real price snapshot job already started');
    return;
  }
  // Run every 3 seconds for dense price_points coverage
  cronJob = cron.schedule('*/3 * * * * *', async () => {
    await runRealPriceSnapshot();
  });
  console.log('✓ Real price snapshot job started (running every 3 seconds)');
  runRealPriceSnapshot();
}

export function stopRealPriceSnapshot(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Real price snapshot job stopped');
  }
}
