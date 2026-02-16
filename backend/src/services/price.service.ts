import axios from 'axios';
import { query } from '../db';

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

/**
 * Get real-time price from Binance API
 */
export async function getRealTimePrice(symbol: string): Promise<PriceData> {
  try {
    // Binance API endpoint for ticker price
    const response = await axios.get(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`,
      { timeout: 5000 }
    );

    return {
      price: parseFloat(response.data.price),
      timestamp: Date.now(),
    };
  } catch (error: any) {
    console.error(`Error fetching Binance price for ${symbol}:`, error.message);
    throw new Error(`Failed to fetch price for ${symbol}`);
  }
}

/**
 * Get 24h price change from Binance
 */
export async function get24hChange(symbol: string): Promise<number> {
  try {
    const response = await axios.get(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`,
      { timeout: 5000 }
    );

    return parseFloat(response.data.priceChangePercent);
  } catch (error: any) {
    console.error(`Error fetching 24h change for ${symbol}:`, error.message);
    return 0;
  }
}

/**
 * Get K-line data from Binance
 */
export async function getKlineData(
  symbol: string,
  interval: string = '1m',
  limit: number = 100
): Promise<KlineData[]> {
  try {
    const response = await axios.get(
      `https://api.binance.com/api/v3/klines`,
      {
        params: {
          symbol: `${symbol}USDT`,
          interval,
          limit,
        },
        timeout: 5000,
      }
    );

    return response.data.map((item: any) => ({
      timestamp: item[0],
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
    }));
  } catch (error: any) {
    console.error(`Error fetching kline data for ${symbol}:`, error.message);
    throw new Error(`Failed to fetch kline data for ${symbol}`);
  }
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

      return {
        price: parseFloat(interpolatedPrice.toFixed(8)),
        timestamp: currentTime,
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
    return {
      price: parseFloat(manualResult.rows[0].price),
      timestamp: new Date(manualResult.rows[0].timestamp).getTime(),
    };
  }

  // If no points exist, use the initial price from trading_pairs
  const pairResult = await query(
    `SELECT custom_initial_price FROM trading_pairs WHERE id = $1`,
    [pairId]
  );

  if (pairResult.rows.length > 0 && pairResult.rows[0].custom_initial_price) {
    return {
      price: parseFloat(pairResult.rows[0].custom_initial_price),
      timestamp: Date.now(),
    };
  }

  throw new Error(`No price data available for custom pair ${pairId}`);
}

/**
 * Get price for any trading pair (real or custom)
 */
export async function getPairPrice(pairId: number): Promise<PriceData> {
  const pairResult = await query(
    `SELECT pair_type, symbol, external_symbol FROM trading_pairs WHERE id = $1`,
    [pairId]
  );

  if (pairResult.rows.length === 0) {
    throw new Error(`Trading pair ${pairId} not found`);
  }

  const pair = pairResult.rows[0];

  if (pair.pair_type === 'real') {
    // Get real-time price from Binance
    const symbol = pair.external_symbol || pair.symbol;
    return await getRealTimePrice(symbol);
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

  return result.rows.map((row) => ({
    timestamp: parseFloat(row.timestamp),
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: parseFloat(row.volume) || 0,
  })).reverse(); // Return in chronological order
}
