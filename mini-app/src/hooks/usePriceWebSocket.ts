/**
 * usePriceWebSocket
 *
 * Connects to the backend WebSocket price broadcast endpoint (/ws/prices)
 * and returns a live-updated prices map: Record<pairId, { price, change24h }>.
 *
 * Falls back gracefully if WebSocket is unavailable (returns empty map).
 */
import { useEffect, useRef, useState, useCallback } from 'react';

export interface LivePriceInfo {
  price: number;
  change24h: number;
}

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function usePriceWebSocket(): Record<string, LivePriceInfo> {
  const [prices, setPrices] = useState<Record<string, LivePriceInfo>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef = useRef(false);

  const getWsUrl = useCallback((): string => {
    // Derive WebSocket URL from current page origin
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/prices`;
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) return;

    reconnectAttemptRef.current++;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(1.5, reconnectAttemptRef.current - 1),
      RECONNECT_MAX_MS
    );

    reconnectTimerRef.current = setTimeout(() => {
      if (!isUnmountedRef.current) connect();
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.CONNECTING ||
        wsRef.current.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        console.log('[usePriceWebSocket] Connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'prices' && msg.data) {
            setPrices(msg.data);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (isUnmountedRef.current) return;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will follow
      };
    } catch {
      scheduleReconnect();
    }
  }, [getWsUrl, scheduleReconnect]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return prices;
}
