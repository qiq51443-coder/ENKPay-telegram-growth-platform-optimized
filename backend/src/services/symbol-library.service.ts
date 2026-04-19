import axios from 'axios';
import { query } from '../db';

const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://api1.binance.com';
const OKX_API_URL = process.env.OKX_API_URL || 'https://www.okx.com';

// Hardcoded popular USDT trading pairs used as fallback when Binance is unreachable
const FALLBACK_SYMBOLS = [
  { symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT', display_name: 'BTC/USDT' },
  { symbol: 'ETHUSDT', base_asset: 'ETH', quote_asset: 'USDT', display_name: 'ETH/USDT' },
  { symbol: 'BNBUSDT', base_asset: 'BNB', quote_asset: 'USDT', display_name: 'BNB/USDT' },
  { symbol: 'SOLUSDT', base_asset: 'SOL', quote_asset: 'USDT', display_name: 'SOL/USDT' },
  { symbol: 'XRPUSDT', base_asset: 'XRP', quote_asset: 'USDT', display_name: 'XRP/USDT' },
  { symbol: 'ADAUSDT', base_asset: 'ADA', quote_asset: 'USDT', display_name: 'ADA/USDT' },
  { symbol: 'DOGEUSDT', base_asset: 'DOGE', quote_asset: 'USDT', display_name: 'DOGE/USDT' },
  { symbol: 'AVAXUSDT', base_asset: 'AVAX', quote_asset: 'USDT', display_name: 'AVAX/USDT' },
  { symbol: 'DOTUSDT', base_asset: 'DOT', quote_asset: 'USDT', display_name: 'DOT/USDT' },
  { symbol: 'MATICUSDT', base_asset: 'MATIC', quote_asset: 'USDT', display_name: 'MATIC/USDT' },
  { symbol: 'LINKUSDT', base_asset: 'LINK', quote_asset: 'USDT', display_name: 'LINK/USDT' },
  { symbol: 'UNIUSDT', base_asset: 'UNI', quote_asset: 'USDT', display_name: 'UNI/USDT' },
  { symbol: 'LTCUSDT', base_asset: 'LTC', quote_asset: 'USDT', display_name: 'LTC/USDT' },
  { symbol: 'BCHUSDT', base_asset: 'BCH', quote_asset: 'USDT', display_name: 'BCH/USDT' },
  { symbol: 'ATOMUSDT', base_asset: 'ATOM', quote_asset: 'USDT', display_name: 'ATOM/USDT' },
  { symbol: 'XLMUSDT', base_asset: 'XLM', quote_asset: 'USDT', display_name: 'XLM/USDT' },
  { symbol: 'FILUSDT', base_asset: 'FIL', quote_asset: 'USDT', display_name: 'FIL/USDT' },
  { symbol: 'TRXUSDT', base_asset: 'TRX', quote_asset: 'USDT', display_name: 'TRX/USDT' },
  { symbol: 'NEARUSDT', base_asset: 'NEAR', quote_asset: 'USDT', display_name: 'NEAR/USDT' },
  { symbol: 'APTUSDT', base_asset: 'APT', quote_asset: 'USDT', display_name: 'APT/USDT' },
  { symbol: 'ARBUSDT', base_asset: 'ARB', quote_asset: 'USDT', display_name: 'ARB/USDT' },
  { symbol: 'OPUSDT', base_asset: 'OP', quote_asset: 'USDT', display_name: 'OP/USDT' },
  { symbol: 'SUIUSDT', base_asset: 'SUI', quote_asset: 'USDT', display_name: 'SUI/USDT' },
  { symbol: 'SEIUSDT', base_asset: 'SEI', quote_asset: 'USDT', display_name: 'SEI/USDT' },
  { symbol: 'INJUSDT', base_asset: 'INJ', quote_asset: 'USDT', display_name: 'INJ/USDT' },
  { symbol: 'TIAUSDT', base_asset: 'TIA', quote_asset: 'USDT', display_name: 'TIA/USDT' },
  { symbol: 'FETUSDT', base_asset: 'FET', quote_asset: 'USDT', display_name: 'FET/USDT' },
  { symbol: 'RENDERUSDT', base_asset: 'RENDER', quote_asset: 'USDT', display_name: 'RENDER/USDT' },
  { symbol: 'WIFUSDT', base_asset: 'WIF', quote_asset: 'USDT', display_name: 'WIF/USDT' },
  { symbol: 'PEPEUSDT', base_asset: 'PEPE', quote_asset: 'USDT', display_name: 'PEPE/USDT' },
  { symbol: 'FLOKIUSDT', base_asset: 'FLOKI', quote_asset: 'USDT', display_name: 'FLOKI/USDT' },
  { symbol: 'BONKUSDT', base_asset: 'BONK', quote_asset: 'USDT', display_name: 'BONK/USDT' },
  { symbol: 'ONDOUSDT', base_asset: 'ONDO', quote_asset: 'USDT', display_name: 'ONDO/USDT' },
  { symbol: 'JUPUSDT', base_asset: 'JUP', quote_asset: 'USDT', display_name: 'JUP/USDT' },
  { symbol: 'ENAUSDT', base_asset: 'ENA', quote_asset: 'USDT', display_name: 'ENA/USDT' },
  { symbol: 'ALTUSDT', base_asset: 'ALT', quote_asset: 'USDT', display_name: 'ALT/USDT' },
  { symbol: 'TONUSDT', base_asset: 'TON', quote_asset: 'USDT', display_name: 'TON/USDT' },
  { symbol: 'NOTUSDT', base_asset: 'NOT', quote_asset: 'USDT', display_name: 'NOT/USDT' },
  { symbol: 'APEUSDT', base_asset: 'APE', quote_asset: 'USDT', display_name: 'APE/USDT' },
  { symbol: 'SANDUSDT', base_asset: 'SAND', quote_asset: 'USDT', display_name: 'SAND/USDT' },
  { symbol: 'MANAUSDT', base_asset: 'MANA', quote_asset: 'USDT', display_name: 'MANA/USDT' },
  { symbol: 'AAVEUSDT', base_asset: 'AAVE', quote_asset: 'USDT', display_name: 'AAVE/USDT' },
  { symbol: 'SNXUSDT', base_asset: 'SNX', quote_asset: 'USDT', display_name: 'SNX/USDT' },
  { symbol: 'COMPUSDT', base_asset: 'COMP', quote_asset: 'USDT', display_name: 'COMP/USDT' },
  { symbol: 'MKRUSDT', base_asset: 'MKR', quote_asset: 'USDT', display_name: 'MKR/USDT' },
  { symbol: 'LDOUSDT', base_asset: 'LDO', quote_asset: 'USDT', display_name: 'LDO/USDT' },
  { symbol: 'CRVUSDT', base_asset: 'CRV', quote_asset: 'USDT', display_name: 'CRV/USDT' },
  { symbol: 'GMXUSDT', base_asset: 'GMX', quote_asset: 'USDT', display_name: 'GMX/USDT' },
  { symbol: 'STXUSDT', base_asset: 'STX', quote_asset: 'USDT', display_name: 'STX/USDT' },
  { symbol: 'RUNEUSDT', base_asset: 'RUNE', quote_asset: 'USDT', display_name: 'RUNE/USDT' },
];

// Fallback Binance API hosts tried in order when the primary returns an error
// (HTTP 451 = "Unavailable For Legal Reasons" on some Render regions).
const BINANCE_FALLBACK_URLS = [
  BINANCE_API_URL,
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api.binance.com',
].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate while preserving order

async function binanceFetch(path: string, timeout = 8000): Promise<any> {
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
 * Sync trading pairs to local symbol library.
 * Fetches all USDT-quoted SPOT trading pairs from OKX first, then Binance exchangeInfo.
 * Falls back to a built-in list of popular USDT pairs when both exchanges are unreachable.
 * Returns the number of synced records.
 */
export async function syncBinanceSymbols(): Promise<number> {
  type SymbolRow = { symbol: string; base_asset: string; quote_asset: string; display_name: string };
  let symbolsToSync: SymbolRow[] = [];
  let usedFallback = false;

  try {
    const okxResponse = await axios.get(`${OKX_API_URL}/api/v5/public/instruments?instType=SPOT`, { timeout: 8000 });
    const okxData: any[] = okxResponse.data?.data || [];
    const usdtSpotSymbols = okxData.filter(
      (s) => s.quoteCcy === 'USDT' && s.state === 'live'
    );
    symbolsToSync = usdtSpotSymbols.map((s) => {
      const symbol = String(s.instId || '').replace('-', '');
      return {
        symbol,
        base_asset: s.baseCcy,
        quote_asset: s.quoteCcy,
        display_name: `${s.baseCcy}/USDT`,
      };
    }).filter((s) => s.symbol && s.base_asset && s.quote_asset);
  } catch (err: any) {
    console.warn('[SymbolLibrary] OKX instruments API unreachable, trying Binance fallback:', err instanceof Error ? err.message : String(err));
    try {
      const data = await binanceFetch('/api/v3/exchangeInfo');
      const symbols: any[] = data.symbols;
      const usdtSpotSymbols = symbols.filter(
        (s) => s.quoteAsset === 'USDT' && s.status === 'TRADING' && s.isSpotTradingAllowed
      );
      symbolsToSync = usdtSpotSymbols.map((s) => ({
        symbol: s.symbol,
        base_asset: s.baseAsset,
        quote_asset: s.quoteAsset,
        display_name: `${s.baseAsset}/USDT`,
      }));
    } catch (binanceErr: any) {
      console.warn('[SymbolLibrary] Binance API unreachable, using fallback symbols:', binanceErr instanceof Error ? binanceErr.message : String(binanceErr));
      symbolsToSync = FALLBACK_SYMBOLS;
      usedFallback = true;
    }
  }

  let syncedCount = 0;

  for (const s of symbolsToSync) {
    try {
      await query(
        `INSERT INTO binance_symbol_library
           (symbol, base_asset, quote_asset, status, display_name, synced_at)
         VALUES ($1, $2, $3, 'TRADING', $4, NOW())
         ON CONFLICT (symbol) DO UPDATE
           SET base_asset   = EXCLUDED.base_asset,
               quote_asset  = EXCLUDED.quote_asset,
               status       = EXCLUDED.status,
               display_name = EXCLUDED.display_name,
               synced_at    = NOW()`,
        [s.symbol, s.base_asset, s.quote_asset, s.display_name]
      );
      syncedCount++;
    } catch (e) {
      console.error(`[SymbolLibrary] Failed to upsert ${s.symbol}:`, e);
    }
  }

  if (usedFallback) {
    console.log(`[SymbolLibrary] Used fallback: inserted ${syncedCount} symbols`);
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
