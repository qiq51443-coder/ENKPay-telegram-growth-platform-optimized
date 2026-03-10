import axios from 'axios';
import { query } from '../db';

const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://api1.binance.com';

// Fallback Binance API hosts tried in order when the primary returns an error
// (HTTP 451 = "Unavailable For Legal Reasons" on some Render regions).
const BINANCE_FALLBACK_URLS = [
  BINANCE_API_URL,
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api.binance.com',
].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate while preserving order

async function binanceFetch(path: string, timeout = 15000): Promise<any> {
  let lastError: any;
  for (const base of BINANCE_FALLBACK_URLS) {
    try {
      const response = await axios.get(`${base}${path}`, { timeout });
      return response.data;
    } catch (err: any) {
      lastError = err;
      const status = err.response?.status;
      // Retry on 451 (legal restriction) or 5xx; abort on other client errors
      if (status && status < 500 && status !== 451) {
        throw err;
      }
    }
  }
  throw lastError;
}

interface SymbolLibraryEntry {
  id: number;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  status: string;
  display_name: string;
  last_price: number | null;
  price_change_24h: number | null;
  synced_at: string;
  created_at: string;
}

interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}

/**
 * Sync Binance trading pairs to local symbol library.
 * Fetches all USDT-quoted SPOT trading pairs from Binance exchangeInfo and upserts them.
 * Returns the number of synced records.
 */
export async function syncBinanceSymbols(): Promise<number> {
  let data: any;
  try {
    data = await binanceFetch('/api/v3/exchangeInfo');
  } catch (err: any) {
    console.error('[SymbolLibrary] Failed to fetch Binance exchangeInfo:', err instanceof Error ? err.message : String(err));
    // Return 0 rather than throwing so callers can handle gracefully
    return 0;
  }

  const symbols: any[] = data.symbols;

  // Filter: only USDT-quoted SPOT pairs that are currently TRADING
  const usdtSpotSymbols = symbols.filter(
    (s) => s.quoteAsset === 'USDT' && s.status === 'TRADING' && s.isSpotTradingAllowed
  );

  let syncedCount = 0;

  for (const s of usdtSpotSymbols) {
    const displayName = `${s.baseAsset}/USDT`;
    await query(
      `INSERT INTO binance_symbol_library
         (symbol, base_asset, quote_asset, status, display_name, synced_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (symbol) DO UPDATE
         SET base_asset   = EXCLUDED.base_asset,
             quote_asset  = EXCLUDED.quote_asset,
             status       = EXCLUDED.status,
             display_name = EXCLUDED.display_name,
             synced_at    = NOW()`,
      [s.symbol, s.baseAsset, s.quoteAsset, s.status, displayName]
    );
    syncedCount++;
  }

  return syncedCount;
}

/**
 * Search symbol library by keyword (matches symbol or base_asset).
 */
export async function searchSymbols(
  keyword: string,
  page: number = 1,
  limit: number = 50
): Promise<PaginationResult<SymbolLibraryEntry>> {
  return getSymbolLibrary(page, limit, keyword);
}

/**
 * Get paginated symbol library list, with optional keyword filter.
 */
export async function getSymbolLibrary(
  page: number = 1,
  limit: number = 50,
  keyword?: string
): Promise<PaginationResult<SymbolLibraryEntry>> {
  const offset = (page - 1) * limit;
  const params: any[] = [];
  let whereClause = '';

  if (keyword && keyword.trim()) {
    const pattern = `%${keyword.trim().toUpperCase()}%`;
    params.push(pattern);
    whereClause = `WHERE symbol ILIKE $1 OR base_asset ILIKE $1`;
  }

  const dataResult = await query(
    `SELECT id, symbol, base_asset, quote_asset, status, display_name,
            last_price, price_change_24h, synced_at, created_at
     FROM binance_symbol_library
     ${whereClause}
     ORDER BY symbol ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) FROM binance_symbol_library ${whereClause}`,
    params
  );

  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].count),
    },
  };
}
