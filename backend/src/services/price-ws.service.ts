/**
 * price-ws.service.ts
 *
 * OKX WebSocket public market data service.
 * Subscribes to `tickers` channel for real-time price updates.
 * No API key required — uses OKX public WebSocket endpoint.
 *
 * Usage:
 *   startPriceWs(['BTCUSDT', 'ETHUSDT'])  // called once on app startup
 *   getWsPrice('BTCUSDT')                  // returns latest snapshot or null
 *   stopPriceWs()                          // graceful shutdown
 */

import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WsTickerSnapshot {
  price: number;
  change24h: number;  // percent, e.g. 2.35 means +2.35%
  timestamp: number;  // Date.now() when last updated
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OKX_WS_URLS = [
  process.env.OKX_WS_URL || 'wss://ws.okx.com:8443/ws/v5/public',
  'wss://wsaws.okx.com:8443/ws/v5/public',   // AWS node fallback
  'wss://wsap.okx.com:8443/ws/v5/public',    // AP node fallback
];

/** How long a snapshot is considered fresh. If older, getRealTimePrice should REST-fallback. */
const SNAPSHOT_MAX_AGE_MS = 15_000; // 15 seconds

/** Ping interval required by OKX (must send "ping" every 25–30s to keep alive) */
const PING_INTERVAL_MS = 25_000;

/** Reconnect backoff: starts at 1s, doubles each attempt, caps at 30s */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS  = 30_000;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** In-memory price cache: binanceSymbol (e.g. "BTCUSDT") → latest snapshot */
const priceCache = new Map<string, WsTickerSnapshot>();

/** Currently subscribed pairs in Binance format (e.g. "BTCUSDT") */
let subscribedPairs: string[] = [];

let ws: WebSocket | null = null;
let pingTimer: NodeJS.Timeout | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempt = 0;
let currentUrlIndex = 0;
let isShuttingDown = false;

// ---------------------------------------------------------------------------
// Symbol conversion helpers
// ---------------------------------------------------------------------------

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
  return binanceSymbol.slice(0, -4) + '-' + binanceSymbol.slice(-4);
}

/**
 * Convert OKX instId (e.g. "BTC-USDT") back to Binance-style symbol (e.g. "BTCUSDT")
 */
function toBinanceSymbol(instId: string): string {
  return instId.replace('-', '');
}

// ---------------------------------------------------------------------------
// WebSocket lifecycle
// ---------------------------------------------------------------------------

function connect(): void {
  if (isShuttingDown) return;

  const url = OKX_WS_URLS[currentUrlIndex % OKX_WS_URLS.length];
  console.log(`[price-ws] Connecting to ${url} (attempt ${reconnectAttempt + 1})`);

  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`[price-ws] Connected to ${url}`);
    reconnectAttempt = 0;

    // Subscribe to tickers for all pairs
    subscribe(subscribedPairs);

    // Start ping keepalive
    startPing();
  });

  ws.on('message', (data: WebSocket.RawData) => {
    try {
      const text = data.toString();

      // OKX pong response
      if (text === 'pong') return;

      const msg = JSON.parse(text);

      // Subscription confirmation
      if (msg.event === 'subscribe') {
        console.log(`[price-ws] Subscribed: ${JSON.stringify(msg.arg)}`);
        return;
      }

      // Error from OKX
      if (msg.event === 'error') {
        console.error(`[price-ws] OKX error: ${msg.msg} (code: ${msg.code})`);
        return;
      }

      // Ticker data push
      if (msg.arg?.channel === 'tickers' && Array.isArray(msg.data)) {
        for (const ticker of msg.data) {
          const binanceSymbol = toBinanceSymbol(ticker.instId);
          const price = parseFloat(ticker.last);
          // Prefer rolling 24h change; fall back to UTC-day change if unavailable
          const change24h = ticker.change24h
            ? parseFloat(ticker.change24h) * 100
            : ticker.changeUtc0
            ? parseFloat(ticker.changeUtc0) * 100
            : 0;

          if (!isNaN(price) && price > 0) {
            priceCache.set(binanceSymbol, {
              price,
              change24h,
              timestamp: Date.now(),
            });
          }
        }
      }
    } catch (err: any) {
      console.warn(`[price-ws] Failed to parse message: ${err.message}`);
    }
  });

  ws.on('close', (code, reason) => {
    console.warn(`[price-ws] Connection closed (code=${code}, reason=${reason?.toString()})`);
    cleanup();
    scheduleReconnect();
  });

  ws.on('error', (err: Error) => {
    console.error(`[price-ws] WebSocket error: ${err.message}`);
    // 'close' event will follow, which triggers reconnect
  });
}

function subscribe(pairs: string[]): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const args = pairs.map((symbol) => ({
    channel: 'tickers',
    instId: toOkxInstId(symbol),
  }));

  ws.send(JSON.stringify({ op: 'subscribe', args }));
}

function startPing(): void {
  stopPing();
  pingTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send('ping');
    }
  }, PING_INTERVAL_MS);
}

function stopPing(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function cleanup(): void {
  stopPing();
  if (ws) {
    ws.removeAllListeners();
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
    ws = null;
  }
}

function scheduleReconnect(): void {
  if (isShuttingDown) return;
  if (reconnectTimer) return; // already scheduled

  reconnectAttempt++;
  // Rotate to next URL on each attempt
  currentUrlIndex++;

  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt - 1),
    RECONNECT_MAX_MS
  );

  console.log(`[price-ws] Reconnecting in ${delay}ms...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the latest price snapshot for a pair.
 * Returns null if no data or data is stale (> SNAPSHOT_MAX_AGE_MS).
 *
 * @param binanceSymbol  e.g. "BTCUSDT"
 */
export function getWsPrice(binanceSymbol: string): WsTickerSnapshot | null {
  const snapshot = priceCache.get(binanceSymbol);
  if (!snapshot) return null;
  if (Date.now() - snapshot.timestamp > SNAPSHOT_MAX_AGE_MS) return null;
  return snapshot;
}

/**
 * Start the OKX WebSocket price service.
 * Should be called once on application startup.
 *
 * @param pairs  Array of Binance-style symbols to subscribe to (e.g. ["BTCUSDT", "ETHUSDT"])
 */
export function startPriceWs(pairs: string[]): void {
  if (pairs.length === 0) {
    console.warn('[price-ws] startPriceWs called with empty pairs list, skipping');
    return;
  }
  isShuttingDown = false;
  subscribedPairs = [...pairs];
  console.log(`[price-ws] Starting with ${pairs.length} pair(s): ${pairs.join(', ')}`);
  connect();
}

/**
 * Stop the WebSocket service gracefully (used in tests / shutdown).
 */
export function stopPriceWs(): void {
  isShuttingDown = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  cleanup();
  priceCache.clear();
  console.log('[price-ws] Stopped');
}

/**
 * Add new pairs to an already-running WebSocket subscription.
 * Safe to call after startPriceWs().
 */
export function subscribeAdditionalPairs(pairs: string[]): void {
  const newPairs = pairs.filter((p) => !subscribedPairs.includes(p));
  if (newPairs.length === 0) return;
  subscribedPairs.push(...newPairs);
  subscribe(newPairs);
  console.log(`[price-ws] Subscribed to additional pairs: ${newPairs.join(', ')}`);
}
