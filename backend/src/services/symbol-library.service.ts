import axios from 'axios';
import { query } from '../db';

const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://api.binance.com';

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
  const response = await axios.get(`${BINANCE_API_URL}/api/v3/exchangeInfo`, {
    timeout: 30000,
  });

  const symbols: any[] = response.data.symbols;

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
