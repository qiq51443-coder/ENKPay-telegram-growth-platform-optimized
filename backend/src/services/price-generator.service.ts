/**
 * Price Generator Service for Custom Trading Pairs
 *
 * Every 5 seconds:
 *  - For each active custom trading pair, checks if a price preset is active.
 *  - If a preset is active, replays the next preset price point.
 *  - Otherwise, applies a random walk (±0.5%) to the last known price.
 *  - Inserts the new price into price_points and updates trading_pairs.current_price.
 */

import { query } from '../db';

const INTERVAL_MS = 5000;
const MAX_FLUCTUATION = 0.005; // ±0.5%

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Generate the next price for a custom pair.
 * Checks for an active preset first; falls back to random walk.
 */
async function generateNextPrice(pairId: number, lastPrice: number): Promise<number> {
  // Check for an active price preset
  try {
    const presetResult = await query(
      `SELECT id, price_sequence, interval_seconds, activated_at
       FROM price_presets
       WHERE pair_id = $1 AND is_active = true
       ORDER BY activated_at DESC LIMIT 1`,
      [pairId]
    );

    if (presetResult.rows.length > 0) {
      const preset = presetResult.rows[0];
      const activatedAt = new Date(preset.activated_at).getTime();
      const elapsedSeconds = (Date.now() - activatedAt) / 1000;
      const sequence: Array<{ price: number; offset_seconds: number }> = preset.price_sequence;

      if (Array.isArray(sequence) && sequence.length > 0) {
        // Walk through the sequence (ordered by offset_seconds ascending) and
        // find the last point whose offset_seconds is <= elapsed time. This
        // effectively selects the most recent preset price point.
        let chosen = sequence[0];
        for (const point of sequence) {
          if (elapsedSeconds >= point.offset_seconds) {
            chosen = point;
          } else {
            break;
          }
        }

        // If we've exhausted the preset, deactivate it
        const lastOffset = sequence[sequence.length - 1].offset_seconds;
        if (elapsedSeconds > lastOffset) {
          await query(
            'UPDATE price_presets SET is_active = false WHERE id = $1',
            [preset.id]
          );
        }

        return parseFloat(String(chosen.price));
      }
    }
  } catch {
    // Preset check failed — fall through to random walk
  }

  // Random walk: new_price = last_price * (1 + random_fluctuation)
  const fluctuation = (Math.random() * 2 - 1) * MAX_FLUCTUATION;
  const newPrice = lastPrice * (1 + fluctuation);
  return parseFloat(newPrice.toFixed(8));
}

/**
 * Main tick: generate price for all active custom pairs and store in price_points.
 */
async function tick(): Promise<void> {
  try {
    // Fetch all active custom pairs
    const pairsResult = await query(
      `SELECT id, custom_initial_price, current_price
       FROM trading_pairs
       WHERE pair_type = 'custom' AND is_active = true`
    );

    for (const pair of pairsResult.rows) {
      try {
        // Determine the last known price
        const lastPriceResult = await query(
          'SELECT price FROM price_points WHERE pair_id = $1 ORDER BY timestamp DESC LIMIT 1',
          [pair.id]
        );

        let lastPrice: number;
        if (lastPriceResult.rows.length > 0) {
          lastPrice = parseFloat(String(lastPriceResult.rows[0].price));
        } else if (pair.current_price) {
          lastPrice = parseFloat(String(pair.current_price));
        } else if (pair.custom_initial_price) {
          lastPrice = parseFloat(String(pair.custom_initial_price));
        } else {
          lastPrice = 1.0; // default fallback
        }

        const newPrice = await generateNextPrice(pair.id, lastPrice);

        // Insert the new price point
        await query(
          'INSERT INTO price_points (pair_id, price, timestamp) VALUES ($1, $2, NOW())',
          [pair.id, newPrice]
        );

        // Calculate 24h change: prefer a real historical price point from 24h ago,
        // fall back to custom_initial_price, otherwise default to 0.
        let change24h = 0;
        const price24hAgoResult = await query(
          `SELECT price FROM price_points
           WHERE pair_id = $1 AND timestamp <= NOW() - INTERVAL '24 hours'
           ORDER BY timestamp DESC LIMIT 1`,
          [pair.id]
        );
        if (price24hAgoResult.rows.length > 0) {
          const price24hAgo = parseFloat(String(price24hAgoResult.rows[0].price));
          if (price24hAgo > 0) {
            change24h = ((newPrice - price24hAgo) / price24hAgo) * 100;
          }
        } else if (pair.custom_initial_price) {
          const initPrice = parseFloat(String(pair.custom_initial_price));
          if (initPrice > 0) {
            change24h = ((newPrice - initPrice) / initPrice) * 100;
          }
        }

        // Update cached price and 24h change in trading_pairs table
        await query(
          `UPDATE trading_pairs
           SET current_price = $1, price_change_24h = $2, last_price_update = NOW()
           WHERE id = $3`,
          [newPrice, change24h, pair.id]
        );
      } catch (pairErr: any) {
        console.error(`[PriceGenerator] Failed to generate price for pair ${pair.id}:`, pairErr.message);
      }
    }
  } catch (err: any) {
    console.error('[PriceGenerator] Tick error:', err.message);
  }
}

/**
 * Start the price generator. Runs every 5 seconds.
 */
export function startPriceGenerator(): void {
  if (timer) return; // already running
  console.log('✓ Price generator started (custom pairs, 5s interval)');
  timer = setInterval(() => {
    tick().catch((err) => console.error('[PriceGenerator] Unhandled error:', err));
  }, INTERVAL_MS);
}

/**
 * Stop the price generator (useful in tests or graceful shutdown).
 */
export function stopPriceGenerator(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('Price generator stopped');
  }
}
