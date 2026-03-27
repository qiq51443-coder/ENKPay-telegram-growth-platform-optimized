/**
 * real-price-sync.service.ts
 *
 * Periodically syncs the real 24h price change percentage for all active real
 * trading pairs from Binance/OKX into the trading_pairs.price_change_24h column.
 *
 * This ensures that the DB-cached change24h is always up-to-date even when the
 * OKX WebSocket is not yet ready or the client falls back to the DB value.
 *
 * NOTE: We bypass get24hChange() / the OKX WS snapshot entirely and call the
 * Binance REST ticker directly, because OKX WS reports changeUtc0 (UTC-day
 * change) rather than a true rolling 24 h percentage, leading to values that
 * are often 0 or stale.
 */

import axios from 'axios';
import { query } from '../db';

const SYNC_INTERVAL_MS = 60_000; // 60 seconds
const BINANCE_FALLBACK_URLS = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api1.binance.com',
];
const OKX_API_URL = process.env.OKX_API_URL || 'https://www.okx.com';

let syncTimer: NodeJS.Timeout | null = null;

function toOkxInstId(binanceSymbol: string): string {
  for (const quote of ['USDT', 'USDC', 'BTC', 'ETH', 'BNB']) {
    if (binanceSymbol.endsWith(quote)) {
      const base = binanceSymbol.slice(0, -quote.length);
      return `${base}-${quote}`;
    }
  }
  return binanceSymbol.slice(0, -4) + '-' + binanceSymbol.slice(-4);
}

/**
 * Fetch rolling 24h change directly from Binance REST (bypasses WS cache).
 * Falls back to OKX REST if Binance fails.
 */
async function fetch24hChangeDirect(binanceSymbol: string): Promise<number> {
  const urls = process.env.BINANCE_API_URL
    ? [process.env.BINANCE_API_URL, ...BINANCE_FALLBACK_URLS.filter((u) => u !== process.env.BINANCE_API_URL)]
    : BINANCE_FALLBACK_URLS;

  // Try Binance REST first
  for (const baseUrl of urls) {
    try {
      const resp = await axios.get(`${baseUrl}/api/v3/ticker/24hr`, {
        params: { symbol: binanceSymbol },
        timeout: 5000,
      });
      const change = parseFloat(resp.data.priceChangePercent);
      if (!isNaN(change)) return change;
    } catch {
      // try next URL
    }
  }

  // OKX REST fallback — use change24h field (rolling 24h), not changeUtc0
  try {
    const instId = toOkxInstId(binanceSymbol);
    const resp = await axios.get(`${OKX_API_URL}/api/v5/market/ticker`, {
      params: { instId },
      timeout: 8000,
    });
    if (resp.data?.code === '0' && resp.data.data?.[0]) {
      const ticker = resp.data.data[0];
      // OKX: change24h is rolling 24h change (decimal fraction, e.g. -0.023 = -2.3%)
      if (ticker.change24h != null) return parseFloat(ticker.change24h) * 100;
      // fallback to changeUtc0 if change24h not present
      if (ticker.changeUtc0 != null) return parseFloat(ticker.changeUtc0) * 100;
    }
  } catch {
    // ignore
  }

  throw new Error(`Failed to fetch 24h change for ${binanceSymbol} from all sources`);
}

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
          const change24h = await fetch24hChangeDirect(pair.binance_symbol);
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

    console.log(`[real-price-sync] Synced ${synced}/${pairs.length} pairs`);
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
