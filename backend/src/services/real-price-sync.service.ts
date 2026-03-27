/**
 * real-price-sync.service.ts
 *
 * Periodically syncs the real 24h price change percentage for all active real
 * trading pairs from Binance/OKX into the trading_pairs.price_change_24h column.
 *
 * This ensures that the DB-cached change24h is always up-to-date even when the
 * OKX WebSocket is not yet ready or the client falls back to the DB value.
 */

import { query } from '../db';
import { get24hChange } from './price.service';

const SYNC_INTERVAL_MS = 60_000; // 60 seconds

let syncTimer: NodeJS.Timeout | null = null;

async function syncRealPrices(): Promise<void> {
  try {
    const result = await query(
      `SELECT id, binance_symbol, current_price
       FROM trading_pairs
       WHERE is_active = true AND pair_type = 'real' AND binance_symbol IS NOT NULL`,
      []
    );

    const pairs = result.rows;
    if (pairs.length === 0) return;

    let synced = 0;

    await Promise.allSettled(
      pairs.map(async (pair: { id: number; binance_symbol: string; current_price: string | null }) => {
        try {
          const change24h = await get24hChange(pair.binance_symbol);
          await query(
            `UPDATE trading_pairs
             SET price_change_24h = $1, last_price_update = NOW()
             WHERE id = $2`,
            [change24h, pair.id]
          );
          synced++;
        } catch (err: any) {
          console.warn(`[real-price-sync] Failed to sync pair ${pair.binance_symbol}: ${err.message}`);
        }
      })
    );

    console.log(`[real-price-sync] Synced ${synced} pairs`);
  } catch (err: any) {
    console.warn(`[real-price-sync] Sync error: ${err.message}`);
  }
}

/**
 * Start the periodic real price sync job.
 * Runs immediately, then every 60 seconds.
 */
export function startRealPriceSync(): void {
  if (syncTimer) return; // already running
  console.log('[real-price-sync] Starting periodic 24h change sync for real pairs');
  // Run immediately, then schedule
  syncRealPrices().catch((err: any) =>
    console.warn(`[real-price-sync] Initial sync failed: ${err.message}`)
  );
  syncTimer = setInterval(syncRealPrices, SYNC_INTERVAL_MS);
}

/**
 * Stop the periodic real price sync job (used for graceful shutdown).
 */
export function stopRealPriceSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[real-price-sync] Stopped');
  }
}
