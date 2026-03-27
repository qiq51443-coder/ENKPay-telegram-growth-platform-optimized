/**
 * price-broadcast.service.ts
 *
 * Attaches a native WebSocket server at /ws/prices on the HTTP server and
 * broadcasts real-time prices (real pairs via OKX WS + custom pairs from DB)
 * to all connected Mini App clients every second.
 */

import { WebSocket, WebSocketServer } from 'ws';
import * as http from 'http';
import { getWsPrice } from './price-ws.service';
import { query } from '../db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BroadcastPayload {
  type: 'prices';
  data: Record<string, { price: number; change24h: number }>;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const clients = new Set<WebSocket>();
let broadcastTimer: NodeJS.Timeout | null = null;
let wss: WebSocketServer | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function buildPricePayload(): Promise<BroadcastPayload> {
  const data: Record<string, { price: number; change24h: number }> = {};

  try {
    const result = await query(
      `SELECT id, pair_type, binance_symbol, current_price, price_change_24h
       FROM trading_pairs WHERE is_active = true`,
      []
    );

    for (const pair of result.rows) {
      const id = String(pair.id);

      if (pair.pair_type === 'real' && pair.binance_symbol) {
        // Real pairs: prefer live OKX WS snapshot (includes change24h from changeUtc0)
        const wsSnap = getWsPrice(pair.binance_symbol);
        if (wsSnap) {
          data[id] = { price: wsSnap.price, change24h: wsSnap.change24h };
          continue;
        }
      }

      // Custom pairs or WS not yet ready: fall back to DB-cached price
      if (pair.current_price != null) {
        data[id] = {
          price: parseFloat(String(pair.current_price)),
          change24h: parseFloat(String(pair.price_change_24h ?? 0)),
        };
      }
    }
  } catch (err: any) {
    console.warn('[price-broadcast] buildPricePayload error:', err.message);
  }

  return { type: 'prices', data };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attach a WebSocket server at /ws/prices to the provided HTTP server.
 * Call this once after the HTTP server is created, before server.listen().
 */
export function attachPriceBroadcast(server: http.Server): void {
  wss = new WebSocketServer({ server, path: '/ws/prices' });

  wss.on('connection', async (ws) => {
    clients.add(ws);

    // Immediately push current price snapshot to the new client
    try {
      const snapshot = await buildPricePayload();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(snapshot));
      }
    } catch (err: any) {
      console.warn('[price-broadcast] Failed to send initial snapshot:', err.message);
    }

    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  // Broadcast to all connected clients every second
  broadcastTimer = setInterval(async () => {
    if (clients.size === 0) return;
    try {
      const payload = await buildPricePayload();
      const msg = JSON.stringify(payload);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    } catch (err: any) {
      console.warn('[price-broadcast] Broadcast error:', err.message);
    }
  }, 1000);

  console.log('✓ Price broadcast WebSocket service started (/ws/prices)');
}

/**
 * Gracefully stop the price broadcast service (called on SIGTERM / SIGINT).
 */
export function stopPriceBroadcast(): void {
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
  clients.clear();
}
