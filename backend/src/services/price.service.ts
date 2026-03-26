import axios from 'axios';
import { query } from '../db';
import { getCache, setCache } from '../utils/cache';

interface PriceData {
  price: number;
  change24h?: number;
  timestamp: number;
}

interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Binance API base URL (configurable for mirrors/proxies)
// data-api.binance.vision is globally accessible without API key
const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://data-api.binance.vision';
const BINANCE_FALLBACK_URLS = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api1.binance.com',
];

// Redis cache TTLs
const CACHE_TTL = {
  PRICE: 5,          // 5 seconds for real-time prices
  CHANGE_24H: 60,    // 60 seconds for 24h change
  KLINE: 300,        // 5 minutes for kline data (default)
};

// Dynamic TTL map for kline data by interval
const KLINE_TTL_MAP: Record<string, number> = {
  '1m':  60,     // 1-minute kline cached for 60 seconds
  '3m':  180,    // 3-minute kline cached for 3 minutes
  '5m':  300,    // 5-minute kline cached for 5 minutes
  '15m': 600,    // 15-minute kline cached for 10 minutes
  '30m': 900,    // 30-minute kline cached for 15 minutes
  '1h':  1800,   // 1-hour kline cached for 30 minutes
  '4h':  7200,   // 4-hour kline cached for 2 hours
  '1d':  21600,  // Daily kline cached for 6 hours
};

// OKX public API base URL (no API key required)
const OKX_API_URL = process.env.OKX_API_URL || 'https://www.okx.com';

/**
 * Convert Binance-style symbol (e.g. "BTCUSDT") to OKX instId (e.g. "BTC-USDT")
 */
function toOkxInstId(binanceSymbol: string): string {
  for (const quote of ['USDT', 'USDC', 'BTC', 'ETH', 'BNB']) {
    if (binanceSymbol.endsWith(quote)) {
      const base = binanceSymbol.slice(0, -quote.length);
      return `${base}-${quote}`;
    }
  }
  // fallback: insert dash before last 4 chars (covers most 4-char quote currencies like USDC variants)
  return binanceSymbol.slice(0, -4) + '-' + binanceSymbol.slice(-4);
}

/**
 * Convert Binance kline interval to OKX bar format
 */
function toOkxBar(binanceInterval: string): string {
  const map: Record<string, string> = {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
    '1d': '1D', '3d': '3D', '1w': '1W', '1M': '1M',
  };
  return map[binanceInterval] || '1m';
}

/**
 * Fetch from OKX public market API (no API key required).
 * Used as fallback when all Binance nodes are unavailable.
 */
async function okxFetch(path: string, params?: Record<string, any>): Promise<any> {
  const response = await axios.get(`${OKX_API_URL}${path}`, { params, timeout: 8000 });
  if (response.data?.code !== '0') {
    throw new Error(`OKX API error: ${response.data?.msg || 'unknown'}`);
  }
  return response.data.data;
}

/**
 * Fetch kline data from OKX and convert to Binance-compatible format.
 * OKX candles endpoint: GET /api/v5/market/candles
 * Returns array in same shape as Binance klines: [openTime, open, high, low, close, volume, ...]
 * Note: OKX returns candles in descending order (newest first).
 */
export async function okxKlineFetch(
  binanceSymbol: string,
  interval: string,
  params: { startTime?: number; endTime?: number; limit?: number }
): Promise<any[][]> {
  const instId = toOkxInstId(binanceSymbol);
  const bar = toOkxBar(interval);

  const okxParams: Record<string, any> = { instId, bar, limit: params.limit || 3 };
  // OKX uses `after` for endTime (returns candles BEFORE this ts), `before` for startTime
  if (params.endTime) okxParams.after = String(params.endTime);
  if (params.startTime) okxParams.before = String(params.startTime);

  const data = await okxFetch('/api/v5/market/candles', okxParams);

  // OKX format: [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
  // Binance format: [openTime, open, high, low, close, volume, ...]
  return (data as any[][]).map((k) => [
    parseInt(k[0]),   // [0] openTime ms
    k[1],             // [1] open
    k[2],             // [2] high
    k[3],             // [3] low
    k[4],             // [4] close
    k[5],             // [5] volume
  ]);
}

/**
 * Try multiple Binance API URLs, returning the first successful response
 */
export async function binanceFetch(path: string, params?: Record<string, any>): Promise<any> {
  const urls = process.env.BINANCE_API_URL
    ? [process.env.BINANCE_API_URL, ...BINANCE_FALLBACK_URLS.filter(u => u !== process.env.BINANCE_API_URL)]
    : BINANCE_FALLBACK_URLS;

  let lastError: any;
  for (const baseUrl of urls) {
    try {
      const response = await axios.get(`${baseUrl}${path}`, { params, timeout: 5000 });
      return response.data;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Check Binance API connectivity on startup
 */
export async function checkBinanceConnectivity(): Promise<boolean> {
  try {
    await binanceFetch('/api/v3/ping');
    console.log('✓ Binance API connectivity check passed');
    return true;
  } catch (error: any) {
    console.error('✗ Binance API connectivity check failed:', error.message);
    console.error(`  Tried URLs: ${BINANCE_FALLBACK_URLS.join(', ')}`);
    return false;
  }
}

/**
 * Get real-time price from Binance API with caching
 * @param symbol Full Binance trading symbol (e.g. "BTCUSDT") or base symbol (e.g. "BTC")
 */
export async function getRealTimePrice(symbol: string): Promise<PriceData> {
  const binanceSymbol = symbol.includes('USDT') ? symbol : `${symbol}USDT`;
  const cacheKey = `price:${binanceSymbol}`;
  
  // Try cache first
  const cached = await getCache<PriceData>(cacheKey);
  if (cached) {
    return cached;
  }

  // Try Binance first
  try {
    const data = await binanceFetch(`/api/v3/ticker/price`, { symbol: binanceSymbol });
    const priceData: PriceData = {
      price: parseFloat(data.price),
      timestamp: Date.now(),
    };
    await setCache(cacheKey, priceData, CACHE_TTL.PRICE);
    return priceData;
  } catch (binanceErr: any) {
    console.warn(`[price] Binance ticker failed for ${binanceSymbol}: ${binanceErr.message}, trying OKX...`);
  }

  // OKX fallback
  try {
    const instId = toOkxInstId(binanceSymbol);
    const data = await okxFetch('/api/v5/market/ticker', { instId });
    const price = parseFloat(data[0].last);
    const priceData: PriceData = { price, timestamp: Date.now() };
    await setCache(cacheKey, priceData, CACHE_TTL.PRICE);
    console.log(`[price] OKX fallback price for ${binanceSymbol}: ${price}`);
    return priceData;
  } catch (okxErr: any) {
    console.error(`[price] OKX fallback also failed for ${binanceSymbol}: ${okxErr.message}`);
    throw new Error(`Failed to fetch price for ${binanceSymbol} from all sources`);
  }
}

/**
 * Get 24h price change from Binance with caching
 * @param symbol Full Binance trading symbol (e.g. "BTCUSDT") or base symbol (e.g. "BTC")
 */
export async function get24hChange(symbol: string): Promise<number> {
  const binanceSymbol = symbol.includes('USDT') ? symbol : `${symbol}USDT`;
  const cacheKey = `change24h:${binanceSymbol}`;
  
  // Try cache first
  const cached = await getCache<number>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Try Binance first
  try {
    const data = await binanceFetch('/api/v3/ticker/24hr', { symbol: binanceSymbol });
    const change = parseFloat(data.priceChangePercent);
    await setCache(cacheKey, change, CACHE_TTL.CHANGE_24H);
    return change;
  } catch {
    // fall through to OKX
  }

  // OKX fallback — uses same /api/v5/market/ticker endpoint, field: changeUtc0
  try {
    const instId = toOkxInstId(binanceSymbol);
    const data = await okxFetch('/api/v5/market/ticker', { instId });
    // OKX ticker has `changeUtc0` (percent change since UTC midnight, not rolling 24h).
    // This is used as a 24h approximation — accuracy varies by time of day but is acceptable
    // as a fallback when Binance is unavailable.
    const change = data[0]?.changeUtc0 ? parseFloat(data[0].changeUtc0) * 100 : 0;
    await setCache(cacheKey, change, CACHE_TTL.CHANGE_24H);
    return change;
  } catch {
    return 0;
  }
}

/**
 * Get the UTC day open price from Binance daily Kline, cached for 60 seconds.
 * @param symbol Full Binance trading symbol (e.g. "BTCUSDT") or base symbol (e.g. "BTC")
 */
export async function getDayOpenPrice(symbol: string): Promise<number> {
  const binanceSymbol = symbol.includes('USDT') ? symbol : `${symbol}USDT`;
  const cacheKey = `dayopen:${binanceSymbol}`;

  const cached = await getCache<number>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Try Binance
  try {
    const data = await binanceFetch('/api/v3/klines', { symbol: binanceSymbol, interval: '1d', limit: 1 });
    if (Array.isArray(data) && data.length > 0) {
      const openPrice = parseFloat(data[0][1]);
      if (!isNaN(openPrice)) {
        await setCache(cacheKey, openPrice, 60);
        return openPrice;
      }
    }
  } catch {
    // fall through to OKX
  }

  // OKX fallback
  const okxData = await okxKlineFetch(binanceSymbol, '1d', { limit: 1 });
  if (!okxData.length) throw new Error(`No daily kline from OKX for ${binanceSymbol}`);
  const openPrice = parseFloat(okxData[0][1]);
  if (isNaN(openPrice)) throw new Error(`Invalid OKX open price for ${binanceSymbol}`);
  await setCache(cacheKey, openPrice, 60);
  return openPrice;
}

/**
 * Get K-line data from Binance with caching
 * @param symbol Full Binance trading symbol (e.g. "BTCUSDT") or base symbol (e.g. "BTC")
 */
export async function getKlineData(
  symbol: string,
  interval: string = '1m',
  limit: number = 100
): Promise<KlineData[]> {
  const binanceSymbol = symbol.includes('USDT') ? symbol : `${symbol}USDT`;
  const cacheKey = `kline:${binanceSymbol}:${interval}:${limit}`;
  
  // Try cache first
  const cached = await getCache<KlineData[]>(cacheKey);
  if (cached) {
    return cached;
  }

  let rawData: any[][];

  // Try Binance first
  try {
    rawData = await binanceFetch('/api/v3/klines', { symbol: binanceSymbol, interval, limit });
  } catch (binanceErr: any) {
    console.warn(`[price] Binance kline failed for ${binanceSymbol}: ${binanceErr.message}, trying OKX...`);
    try {
      rawData = await okxKlineFetch(binanceSymbol, interval, { limit });
    } catch (okxErr: any) {
      console.error(`[price] OKX kline also failed for ${binanceSymbol}: ${okxErr.message}`);
      throw new Error(`Failed to fetch kline data for ${binanceSymbol} from all sources`);
    }
  }

  const klineData = rawData.map((item: any) => ({
    timestamp: item[0],
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4]),
    volume: parseFloat(item[5]),
  }));

  // Cache with dynamic TTL based on interval
  const ttl = KLINE_TTL_MAP[interval] ?? CACHE_TTL.KLINE;
  if (!(interval in KLINE_TTL_MAP)) {
    console.warn(`Unknown kline interval "${interval}", using default TTL of ${CACHE_TTL.KLINE}s`);
  }
  await setCache(cacheKey, klineData, ttl);
  
  return klineData;
}

/**
 * Calculate 24h price change percentage for a custom pair.
 * Checks price_points, custom_price_points, and falls back to custom_initial_price.
 */
async function calcCustomChange24h(pairId: number, currentPrice: number): Promise<number> {
  try {
    // 1. Check auto-generated price_points first
    const ppResult = await query(
      `SELECT price FROM price_points
       WHERE pair_id = $1 AND timestamp <= NOW() - INTERVAL '24 hours'
       ORDER BY timestamp DESC LIMIT 1`,
      [pairId]
    );
    if (ppResult.rows.length > 0) {
      const price24hAgo = parseFloat(ppResult.rows[0].price);
      if (price24hAgo > 0) {
        return ((currentPrice - price24hAgo) / price24hAgo) * 100;
      }
    }

    // 2. Check admin-set custom_price_points
    const cppResult = await query(
      `SELECT price FROM custom_price_points
       WHERE pair_id = $1 AND timestamp <= NOW() - INTERVAL '24 hours'
       ORDER BY timestamp DESC LIMIT 1`,
      [pairId]
    );
    if (cppResult.rows.length > 0) {
      const price24hAgo = parseFloat(cppResult.rows[0].price);
      if (price24hAgo > 0) {
        return ((currentPrice - price24hAgo) / price24hAgo) * 100;
      }
    }

    // 3. Fall back to custom_initial_price as the 24h reference
    const initResult = await query(
      `SELECT custom_initial_price FROM trading_pairs WHERE id = $1`,
      [pairId]
    );
    if (initResult.rows.length > 0 && initResult.rows[0].custom_initial_price) {
      const initPrice = parseFloat(initResult.rows[0].custom_initial_price);
      if (initPrice > 0) {
        return ((currentPrice - initPrice) / initPrice) * 100;
      }
    }
  } catch {
    // non-critical: return 0 if query fails
  }
  return 0;
}

/**
 * Get custom pair price based on presets or manual points
 */
export async function getCustomPairPrice(pairId: number): Promise<PriceData> {
  // First, check if there's an active preset
  const presetResult = await query(
    `SELECT id, price_data, duration_seconds, activated_at, start_price, end_price
     FROM custom_price_presets
     WHERE pair_id = $1 AND is_active = true
     ORDER BY activated_at DESC
     LIMIT 1`,
    [pairId]
  );

  if (presetResult.rows.length > 0) {
    const preset = presetResult.rows[0];
    const activatedAt = new Date(preset.activated_at).getTime();
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - activatedAt) / 1000;

    // If preset is still within duration, interpolate from price_data
    if (elapsedSeconds < preset.duration_seconds) {
      const priceData = preset.price_data as Array<{ offset: number; price: number }>;
      
      // Find the two points to interpolate between
      let prevPoint = priceData[0];
      let nextPoint = priceData[priceData.length - 1];

      for (let i = 0; i < priceData.length - 1; i++) {
        if (
          elapsedSeconds >= priceData[i].offset &&
          elapsedSeconds < priceData[i + 1].offset
        ) {
          prevPoint = priceData[i];
          nextPoint = priceData[i + 1];
          break;
        }
      }

      // Linear interpolation
      const offsetDiff = nextPoint.offset - prevPoint.offset;
      const priceDiff = nextPoint.price - prevPoint.price;
      const progress =
        offsetDiff > 0 ? (elapsedSeconds - prevPoint.offset) / offsetDiff : 1;
      const interpolatedPrice = prevPoint.price + priceDiff * progress;

      const currentPrice = parseFloat(interpolatedPrice.toFixed(8));
      const change24h = await calcCustomChange24h(pairId, currentPrice);
      return {
        price: currentPrice,
        timestamp: currentTime,
        change24h,
      };
    }
  }

  // If no active preset or preset expired, check manual price points
  const manualResult = await query(
    `SELECT price, timestamp
     FROM custom_price_points
     WHERE pair_id = $1
     ORDER BY timestamp DESC
     LIMIT 1`,
    [pairId]
  );

  if (manualResult.rows.length > 0) {
    const currentPrice = parseFloat(manualResult.rows[0].price);
    const change24h = await calcCustomChange24h(pairId, currentPrice);
    return {
      price: currentPrice,
      timestamp: new Date(manualResult.rows[0].timestamp).getTime(),
      change24h,
    };
  }

  // If no points exist, use the initial price from trading_pairs
  const pairResult = await query(
    `SELECT custom_initial_price FROM trading_pairs WHERE id = $1`,
    [pairId]
  );

  if (pairResult.rows.length > 0 && pairResult.rows[0].custom_initial_price) {
    const currentPrice = parseFloat(pairResult.rows[0].custom_initial_price);
    const change24h = await calcCustomChange24h(pairId, currentPrice);
    return {
      price: currentPrice,
      timestamp: Date.now(),
      change24h,
    };
  }

  return { price: 0, timestamp: Date.now(), change24h: 0 };
}

/**
 * Get price for any trading pair (real or custom)
 * For real pairs the response includes change24h from the Binance 24hr ticker.
 */
export async function getPairPrice(pairId: number): Promise<PriceData> {
  const pairResult = await query(
    `SELECT pair_type, symbol, binance_symbol, external_symbol FROM trading_pairs WHERE id = $1`,
    [pairId]
  );

  if (pairResult.rows.length === 0) {
    throw new Error(`Trading pair ${pairId} not found`);
  }

  const pair = pairResult.rows[0];

  if (pair.pair_type === 'real') {
    // Use binance_symbol from DB if available, else fall back to external_symbol or symbol
    const symbol = pair.binance_symbol || pair.external_symbol || pair.symbol;
    const priceData = await getRealTimePrice(symbol);
    // Enrich with 24h change (cached separately for 60 s)
    const change24h = await get24hChange(symbol);
    return { ...priceData, change24h };
  } else {
    // Get custom price
    return await getCustomPairPrice(pairId);
  }
}

/**
 * Update cached price in trading_pairs table
 */
export async function updateCachedPrice(
  pairId: number,
  price: number,
  change24h?: number
): Promise<void> {
  await query(
    `UPDATE trading_pairs 
     SET current_price = $1, 
         price_change_24h = $2, 
         last_price_update = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [price, change24h || null, pairId]
  );
}

/**
 * Cache kline data to price_history table
 */
export async function cacheKlineData(
  pairId: number,
  interval: string,
  klineData: KlineData[]
): Promise<void> {
  for (const kline of klineData) {
    await query(
      `INSERT INTO price_history 
       (pair_id, open_price, high_price, low_price, close_price, volume, interval, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))
       ON CONFLICT (pair_id, interval, timestamp) DO UPDATE
       SET open_price = $2, high_price = $3, low_price = $4, close_price = $5, volume = $6`,
      [
        pairId,
        kline.open,
        kline.high,
        kline.low,
        kline.close,
        kline.volume,
        interval,
        kline.timestamp,
      ]
    );
  }
}

/**
 * Get cached kline data from price_history
 */
export async function getCachedKlineData(
  pairId: number,
  interval: string,
  limit: number = 100
): Promise<KlineData[]> {
  const result = await query(
    `SELECT 
       EXTRACT(EPOCH FROM timestamp) * 1000 as timestamp,
       open_price as open,
       high_price as high,
       low_price as low,
       close_price as close,
       volume
     FROM price_history
     WHERE pair_id = $1 AND interval = $2
     ORDER BY timestamp DESC
     LIMIT $3`,
    [pairId, interval, limit]
  );

  return result.rows.map((row: any) => ({
    timestamp: parseFloat(row.timestamp),
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: parseFloat(row.volume) || 0,
  })).reverse(); // Return in chronological order
}
