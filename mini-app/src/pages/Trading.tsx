// @ts-nocheck
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { theme } from '../theme';
import { api } from '../services/api';
import { useLang } from '../context/LanguageContext';
import { useTelegram } from '../hooks/useTelegram';
import { useAuthSync } from '../context/AuthSyncContext';
import { useUser } from '../context/UserContext';
import { createChart } from 'lightweight-charts';
import { usePriceWebSocket } from '../hooks/usePriceWebSocket';

interface TradingPair {
  id: string;
  symbol: string;
  display_name: string;
  pair_type: string;
  binance_symbol?: string;
  icon_url?: string;
  current_price?: number;
  price_change_24h?: number;
}

interface PriceInfo {
  price: number;
  change24h: number;
}

interface TradingRule {
  id: string;
  duration_seconds: number;
  odds: number;
  min_bet: number;
  max_bet: number;
}

interface Order {
  id: string;
  direction: 'up' | 'down';
  amount: number;
  entry_price: number;
  odds: number;
  status: string;
  result?: 'win' | 'lose' | 'draw';
  profit?: number;
  close_price?: string;
  created_at: string;
  symbol?: string;
  display_name?: string;
  session_start?: string;
  session_end?: string;
  period_label?: string;
  session_open_price?: number | string;
  session_close_price?: number | string;
}


const DURATION_OPTIONS = [
  { labelKey: 'duration_1min', seconds: 60, periodsPerDay: 1440 },
  { labelKey: 'duration_5min', seconds: 300, periodsPerDay: 288 },
  { labelKey: 'duration_10min', seconds: 600, periodsPerDay: 144 },
];

/** 根据选定的周期秒数，计算当前期号和距下一期开始的倒计时（秒） */
function getCurrentPeriodInfo(durationSeconds: number): {
  currentPeriod: number;
  nextPeriod: number;
  secondsUntilNext: number;
  currentPeriodLabel: string;
  nextPeriodLabel: string;
} {
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const dayStartSec = Math.floor(nowSec / 86400) * 86400;
  const elapsedInDay = nowSec - dayStartSec;
  const currentPeriod = Math.floor(elapsedInDay / durationSeconds) + 1;
  const nextPeriodStartSec = dayStartSec + currentPeriod * durationSeconds;
  const secondsUntilNext = Math.max(0, nextPeriodStartSec - nowSec);

  // Date stamp in YYYYMMDD format (UTC)
  const now = new Date(nowMs);
  const dateStamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const pad = (n: number) => String(n).padStart(3, '0');

  return {
    currentPeriod,
    nextPeriod: currentPeriod + 1,
    secondsUntilNext,
    currentPeriodLabel: `${dateStamp}-${pad(currentPeriod)}`,
    nextPeriodLabel: `${dateStamp}-${pad(currentPeriod + 1)}`,
  };
}

const KLINE_INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1d' },
];

const QUICK_AMOUNTS = [10, 50, 100, 500];

const safeFixed = (v: any, d = 2): string => {
  const n = Number(v);
  return isNaN(n) ? `0.${'0'.repeat(d)}` : n.toFixed(d);
};

const _apiBase = ((import.meta as any).env?.VITE_API_URL || '/api').replace(/\/api$/, '');

const resolveIconUrl = (url: string | null | undefined): string => {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) return url;
  return `${_apiBase}${url}`;
};

const DEFAULT_RULES: TradingRule[] = [
  { id: 'default', duration_seconds: 60, odds: 1.85, min_bet: 1, max_bet: 1000 },
];

// Chart tick timing constants (milliseconds)
const CHART_TICK_MIN_MS = 1500;
const CHART_TICK_VARIANCE_MS = 1000;

// Custom pair price fluctuation range per tick (as a fraction, e.g. 0.001 = 0.1%)
const CUSTOM_TICK_MIN_PCT = 0.001;
const CUSTOM_TICK_RANGE_PCT = 0.002;

// Grace period (ms) added to selectedDuration when detecting stale/stuck orders from past periods
// Must match the backend's 30-second threshold for auto-cancelling stuck orders
const STALE_ORDER_GRACE_MS = 30000;

// Duration of the flash-up / flash-down price animation (ms)
const FLASH_ANIMATION_DURATION_MS = 600;

export const Trading: React.FC = () => {
  const { t } = useLang();
  const { user: tgUser, tg } = useTelegram();
  const { authSyncDone } = useAuthSync();
  const { user: contextUser, refreshBalance: refreshContextBalance } = useUser();
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPair, setSelectedPair] = useState<TradingPair | null>(null);
  const [rules, setRules] = useState<TradingRule[]>([]);
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [selectedOdds, setSelectedOdds] = useState(1.85);
  const [amount, setAmount] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDirection, setConfirmDirection] = useState<'up' | 'down'>('up');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [resultMsg, setResultMsg] = useState<{ win: boolean; profit: number; draw?: boolean; settling?: boolean } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [activeOrderEntryPrice, setActiveOrderEntryPrice] = useState<number | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const orderErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [klineInterval, setKlineInterval] = useState('1m');
  const [klineError, setKlineError] = useState(false);
  // Available balance: wallet_balance + red_packet_balance (kept in sync with UserContext)
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const periodTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pairsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedPairRef = useRef<TradingPair | null>(null);
  const pricesRef = useRef<Record<string, PriceInfo>>({});
  const prevPricesRef = useRef<Record<string, PriceInfo>>({});
  const chartTickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedDurationRef = useRef<number>(selectedDuration);
  const [periodInfo, setPeriodInfo] = useState<{ currentPeriod: number; nextPeriod: number; secondsUntilNext: number; currentPeriodLabel: string; nextPeriodLabel: string } | null>(null);
  const periodInfoRef = useRef<{ currentPeriod: number; nextPeriod: number; secondsUntilNext: number; currentPeriodLabel: string; nextPeriodLabel: string } | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const lastKlineTimeRef = useRef<number>(0);
  const lastCandleRef = useRef<{ open: number; high: number; low: number; close: number } | null>(null);
  const entryPriceLineRef = useRef<any>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [winMessage, setWinMessage] = useState<{ win: boolean; profit: number; draw?: boolean } | null>(null);
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real-time price updates via WebSocket (replaces HTTP polling)
  const wsPrices = usePriceWebSocket();

  // Merge WS prices into prices state; WS data takes priority.
  // Also push the latest price for the selected pair into the K-line chart.
  useEffect(() => {
    if (Object.keys(wsPrices).length === 0) return;
    setPrices((prev) => ({ ...prev, ...wsPrices }));

    // Push the latest price tick into the K-line chart for the currently selected pair
    const currentSelectedPair = selectedPairRef.current;
    if (currentSelectedPair && wsPrices[currentSelectedPair.id] != null) {
      const latestPrice = wsPrices[currentSelectedPair.id].price;
      if (
        latestPrice > 0 &&
        candleSeriesRef.current &&
        lastKlineTimeRef.current > 0 &&
        lastCandleRef.current
      ) {
        const prev = lastCandleRef.current;
        const updatedCandle = {
          time: lastKlineTimeRef.current,
          open: prev.open,
          high: Math.max(prev.high, latestPrice),
          low: Math.min(prev.low, latestPrice),
          close: latestPrice,
        };
        try { candleSeriesRef.current.update(updatedCandle); } catch { /* ignore */ }
        lastCandleRef.current = { open: updatedCandle.open, high: updatedCandle.high, low: updatedCandle.low, close: updatedCandle.close };
      }
    }
  }, [wsPrices]);

  // Sync availableBalance from UserContext whenever context user changes
  useEffect(() => {
    if (contextUser) {
      const tradable = contextUser.tradable_balance;
      if (tradable !== undefined) {
        setAvailableBalance(parseFloat(String(tradable)));
      } else {
        const walletBal = parseFloat(String(contextUser.wallet_balance ?? 0));
        const redPacketBal = parseFloat(String(contextUser.red_packet_balance ?? contextUser.red_packet_credits ?? 0));
        setAvailableBalance(walletBal + redPacketBal);
      }
    }
  }, [contextUser]);

  useEffect(() => {
    fetchPairs();
    pairsPollRef.current = setInterval(fetchPairs, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (pairsPollRef.current) clearInterval(pairsPollRef.current);
      if (chartTickRef.current) clearTimeout(chartTickRef.current);
      if (orderErrorTimerRef.current) clearTimeout(orderErrorTimerRef.current);
      if (orderSuccessTimerRef.current) clearTimeout(orderSuccessTimerRef.current);
      if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
    };
  }, []);

  // Fetch balance once auth-sync has completed to avoid the race condition where
  // fetchBalance fires before the user record exists in the database.
  // If we already have the balance from UserContext, skip the extra request.
  useEffect(() => {
    if (authSyncDone && availableBalance === null) {
      fetchBalance();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSyncDone]);

  // Track active order from order history
  // Only consider orders within the current period window to avoid stuck orders from past periods blocking the UI
  useEffect(() => {
    const nowMs = Date.now();
    // Orders created more than (selectedDuration + grace period) ago are likely stuck from a previous period
    const staleCutoffMs = nowMs - (selectedDuration * 1000 + STALE_ORDER_GRACE_MS);
    const active = orders.find(o => {
      if (o.status !== 'active' && o.status !== 'pending') return false;
      const createdAt = new Date(o.created_at).getTime();
      // Only treat as blocking if the order was created within current period window
      return createdAt >= staleCutoffMs;
    });
    setActiveOrder(active || null);
    if (!active) setActiveOrderEntryPrice(null);
  }, [orders, selectedDuration]);

  // Update period info every second based on selectedDuration
  useEffect(() => {
    selectedDurationRef.current = selectedDuration;
    // Track previous period number to detect period boundary crossings
    let prevPeriodNumber = -1;
    const updatePeriod = () => {
      const info = getCurrentPeriodInfo(selectedDuration);
      setPeriodInfo(info);
      periodInfoRef.current = info;
      // Detect period boundary crossing: force immediate K-line refresh
      if (prevPeriodNumber !== -1 && info.currentPeriod !== prevPeriodNumber) {
        // New period started — trigger an immediate K-line fetch to sync chart start point
        const currentPair = selectedPairRef.current;
        if (currentPair && candleSeriesRef.current) {
          api.get(`/trading/pairs/${currentPair.id}/kline?interval=1m&limit=60`)
            .then((res) => {
              const raw: any[] = res.data?.data || [];
              if (raw.length === 0) return;
              const candleData = raw.map((k: any) => ({
                time: Math.floor(new Date(k.open_time || k.time || k.timestamp).getTime() / 1000),
                open: Number(k.open),
                high: Number(k.high),
                low: Number(k.low),
                close: Number(k.close),
              })).filter((d: any) => d.time && d.open && d.high && d.low && d.close);
              if (candleData.length === 0) return;
              const newLast = candleData[candleData.length - 1];
              if (!candleSeriesRef.current) return;
              if (newLast.time > lastKlineTimeRef.current) {
                try { candleSeriesRef.current.update(newLast); } catch {}
                lastKlineTimeRef.current = newLast.time;
                lastCandleRef.current = { open: newLast.open, high: newLast.high, low: newLast.low, close: newLast.close };
              }
            })
            .catch(() => { /* non-critical */ });
        }
      }
      prevPeriodNumber = info.currentPeriod;
    };
    updatePeriod();
    if (periodTimerRef.current) clearInterval(periodTimerRef.current);
    periodTimerRef.current = setInterval(updatePeriod, 1000);
    return () => { if (periodTimerRef.current) clearInterval(periodTimerRef.current); };
  }, [selectedDuration]);

  // Re-poll rules every 60s so admin-updated odds are reflected in the mini-app
  useEffect(() => {
    if (!selectedPair) return;
    const interval = setInterval(() => {
      fetchRulesForPair(selectedPair);
    }, 60000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPair?.id]);

  // Keep pricesRef in sync with prices state for use in timeout callbacks
  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  // Inject flash-up / flash-down keyframe CSS once on mount
  useEffect(() => {
    const styleId = 'trading-flash-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes flashUp   { 0%{color:#26a69a;text-shadow:0 0 8px rgba(38,166,154,0.6)} 100%{color:inherit;text-shadow:none} }
        @keyframes flashDown { 0%{color:#ef5350;text-shadow:0 0 8px rgba(239,83,80,0.6)}  100%{color:inherit;text-shadow:none} }
        .flash-up   { animation: flashUp   ${FLASH_ANIMATION_DURATION_MS}ms ease-out forwards; }
        .flash-down { animation: flashDown ${FLASH_ANIMATION_DURATION_MS}ms ease-out forwards; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Apply flash-up / flash-down animation on price elements when prices change
  useEffect(() => {
    Object.entries(prices).forEach(([id, info]) => {
      const prev = prevPricesRef.current[id];
      if (prev && prev.price !== info.price) {
        const cls = info.price > prev.price ? 'flash-up' : 'flash-down';
        const el = document.querySelector(`[data-price-id="${CSS.escape(id)}"]`);
        if (el) {
          el.classList.remove('flash-up', 'flash-down');
          void (el as HTMLElement).offsetWidth; // force reflow to restart animation
          el.classList.add(cls);
          setTimeout(() => el.classList.remove(cls), FLASH_ANIMATION_DURATION_MS);
        }
      }
    });
    prevPricesRef.current = prices;
  }, [prices]);

  // Push real-time price tick into the last candle of the chart (real pairs only)
  useEffect(() => {
    if (!selectedPair || selectedPair.pair_type === 'custom') return;
    if (!candleSeriesRef.current || lastKlineTimeRef.current === 0) return;
    const priceInfo = prices[selectedPair.id];
    if (!priceInfo || !priceInfo.price) return;
    const newPrice = priceInfo.price;
    const lastCandle = lastCandleRef.current;
    if (!lastCandle) return;
    const updatedCandle = {
      time: lastKlineTimeRef.current,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, newPrice),
      low: Math.min(lastCandle.low, newPrice),
      close: newPrice,
    };
    lastCandleRef.current = { open: updatedCandle.open, high: updatedCandle.high, low: updatedCandle.low, close: newPrice };
    try {
      candleSeriesRef.current.update(updatedCandle);
    } catch {
      // ignore chart update errors
    }
  }, [prices, selectedPair]);

  // Randomized chart tick (1500–2500ms) for smooth real-time candle animation.
  // Real pairs use the latest polled price; custom pairs get a small random fluctuation.
  useEffect(() => {
    if (chartTickRef.current) clearTimeout(chartTickRef.current);
    if (!selectedPair) return;

    let stopped = false;
    const scheduleTick = () => {
      const delay = CHART_TICK_MIN_MS + Math.random() * CHART_TICK_VARIANCE_MS; // 1500–2500ms
      chartTickRef.current = setTimeout(() => {
        if (stopped) return;
        if (candleSeriesRef.current && lastKlineTimeRef.current !== 0 && lastCandleRef.current) {
          const lastCandle = lastCandleRef.current;
          let newPrice: number | null = null;

          if (selectedPair.pair_type === 'custom') {
            // Generate small random fluctuation (±0.1%–0.3%) around latest known price
            const basePrice = pricesRef.current[selectedPair.id]?.price || lastCandle.close;
            if (basePrice > 0) {
              const pct = CUSTOM_TICK_MIN_PCT + Math.random() * CUSTOM_TICK_RANGE_PCT; // 0.1%–0.3%
              const dir = Math.random() > 0.5 ? 1 : -1;
              newPrice = basePrice * (1 + dir * pct);
            }
          } else {
            // Real pair: push the latest polled price
            const priceInfo = pricesRef.current[selectedPair.id];
            if (priceInfo?.price) newPrice = priceInfo.price;
          }

          if (newPrice !== null && newPrice > 0) {
            const updatedCandle = {
              time: lastKlineTimeRef.current,
              open: lastCandle.open,
              high: Math.max(lastCandle.high, newPrice),
              low: Math.min(lastCandle.low, newPrice),
              close: newPrice,
            };
            lastCandleRef.current = { open: updatedCandle.open, high: updatedCandle.high, low: updatedCandle.low, close: newPrice };
            try { candleSeriesRef.current.update(updatedCandle); } catch {}
          }
        }
        scheduleTick();
      }, delay);
    };

    scheduleTick();
    return () => {
      stopped = true;
      if (chartTickRef.current) clearTimeout(chartTickRef.current);
    };
  }, [selectedPair]);

  // K-line chart: initialize when a pair is selected or interval changes
  useEffect(() => {
    if (!selectedPair || !chartContainerRef.current) return;
    setKlineError(false);

    // Destroy old chart if exists
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch {}
      chartRef.current = null;
      candleSeriesRef.current = null;
    }
    lastKlineTimeRef.current = 0;

    // Mutable handles accessible by both initChart() and the cleanup closure
    let klinePoll: ReturnType<typeof setInterval> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let rafId: number | null = null;
    let rafRetries = 0;
    const MAX_RAF_RETRIES = 20;
    let isDestroyed = false;
    let registeredHandleResize: (() => void) | null = null;

    const initChart = () => {
      if (isDestroyed || !chartContainerRef.current) return;
      const containerWidth = chartContainerRef.current.clientWidth || window.innerWidth - 32;
      if (containerWidth === 0) {
        // Wait for the container to get a non-zero width before initialising
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver((entries) => {
            const w = entries[0]?.contentRect?.width ?? 0;
            if (w > 0) {
              resizeObserver?.disconnect();
              resizeObserver = null;
              initChart();
            }
          });
          resizeObserver.observe(chartContainerRef.current);
        } else {
          // Fallback: rAF retry (max ~333ms at 60fps)
          if (rafRetries < MAX_RAF_RETRIES) {
            rafRetries++;
            rafId = requestAnimationFrame(initChart);
          }
        }
        return;
      }

      let chart: any = null;
      let candleSeries: any = null;
      try {
        chart = createChart(chartContainerRef.current, {
          width: containerWidth,
          height: 200,
          layout: {
            background: { color: 'transparent' },
            textColor: '#9e9e9e',
          },
          grid: {
            vertLines: { color: 'rgba(255,255,255,0.05)' },
            horzLines: { color: 'rgba(255,255,255,0.05)' },
          },
          crosshair: { mode: 1 },
          rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
          timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true },
        });

        candleSeries = chart.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderVisible: false,
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
      } catch (chartErr) {
        console.warn('[Trading] createChart failed:', chartErr);
        setKlineError(true);
        return;
      }

      // Load K-line data
      const fetchKline = async () => {
        try {
          const res = await api.get(`/trading/pairs/${selectedPair.id}/kline?interval=${klineInterval}&limit=60`);
          const raw: any[] = res.data?.data || [];
          const candleData = raw.map((k: any) => ({
            time: Math.floor(new Date(k.open_time || k.time || k.timestamp).getTime() / 1000),
            open: Number(k.open),
            high: Number(k.high),
            low: Number(k.low),
            close: Number(k.close),
          })).filter((d: any) => d.time && d.open && d.high && d.low && d.close);

          if (candleData.length > 0) {
            candleSeries.setData(candleData);
            chart.timeScale().fitContent();
            const last = candleData[candleData.length - 1];
            lastKlineTimeRef.current = last.time;
            lastCandleRef.current = { open: last.open, high: last.high, low: last.low, close: last.close };
          }
        } catch (err) {
          console.warn('[Trading] Failed to load K-line data:', err);
          setKlineError(true);
        }
      };

      fetchKline();

      // Poll every 5 seconds for real-time chart updates (use update-only to avoid clearing chart)
      klinePoll = setInterval(() => {
        (async () => {
          try {
            const res = await api.get(`/trading/pairs/${selectedPair.id}/kline?interval=${klineInterval}&limit=60`);
            const raw: any[] = res.data?.data || [];
            if (raw.length === 0) return; // Keep existing data if API returns empty
            const candleData = raw.map((k: any) => ({
              time: Math.floor(new Date(k.open_time || k.time || k.timestamp).getTime() / 1000),
              open: Number(k.open),
              high: Number(k.high),
              low: Number(k.low),
              close: Number(k.close),
            })).filter((d: any) => d.time && d.open && d.high && d.low && d.close);
            if (candleData.length === 0) return;
            const newLast = candleData[candleData.length - 1];
            if (!candleSeries) return;
            if (newLast.time > lastKlineTimeRef.current) {
              // New candle — append it
              try { candleSeries.update(newLast); } catch {}
              lastKlineTimeRef.current = newLast.time;
              lastCandleRef.current = { open: newLast.open, high: newLast.high, low: newLast.low, close: newLast.close };
            } else if (newLast.time === lastKlineTimeRef.current) {
              // Same candle — just update close
              const updatedCandle = {
                time: newLast.time,
                open: lastCandleRef.current?.open ?? newLast.open,
                high: Math.max(lastCandleRef.current?.high ?? newLast.high, newLast.close),
                low: Math.min(lastCandleRef.current?.low ?? newLast.low, newLast.close),
                close: newLast.close,
              };
              try { candleSeries.update(updatedCandle); } catch {}
              lastCandleRef.current = { open: updatedCandle.open, high: updatedCandle.high, low: updatedCandle.low, close: updatedCandle.close };
            }
          } catch {}
        })();
      }, 5000);

      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          const w = chartContainerRef.current.clientWidth || window.innerWidth - 32;
          if (w > 0) chart.applyOptions({ width: w });
        }
      };
      registeredHandleResize = handleResize;
      window.addEventListener('resize', handleResize);
    };

    initChart();

    return () => {
      isDestroyed = true;
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (klinePoll) { clearInterval(klinePoll); klinePoll = null; }
      if (registeredHandleResize) { window.removeEventListener('resize', registeredHandleResize); registeredHandleResize = null; }
      if (chartRef.current) { try { chartRef.current.remove(); } catch {} }
      chartRef.current = null;
      candleSeriesRef.current = null;
      lastKlineTimeRef.current = 0;
      lastCandleRef.current = null;
    };
  }, [selectedPair, klineInterval]);

  const fetchPairs = async () => {
    try {
      const data = await api.get('/trading/pairs');
      const list: TradingPair[] = data.data?.data || [];
      setPairs(list);
      // Pre-populate prices for both real and custom pairs from current_price to avoid showing $0.00
      const initialPrices: Record<string, PriceInfo> = {};
      list.forEach((p) => {
        if (p.current_price != null) {
          initialPrices[p.id] = { price: Number(p.current_price), change24h: Number(p.price_change_24h ?? 0) };
        }
      });
      if (Object.keys(initialPrices).length > 0) {
        setPrices((prev) => ({ ...initialPrices, ...prev }));
      }
    } catch {
      setPairs([
        { id: '1', symbol: 'BTC', display_name: 'BTC/USDT', pair_type: 'real', binance_symbol: 'BTCUSDT' },
        { id: '2', symbol: 'ETH', display_name: 'ETH/USDT', pair_type: 'real', binance_symbol: 'ETHUSDT' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalance = async (retryCount = 0) => {
    try {
      // Delegate to UserContext refreshBalance which calls GET /miniapp/profile
      // (session token or initData is handled by the request interceptor)
      await refreshContextBalance();
    } catch (err: any) {
      console.warn('[Trading] fetchBalance failed:', err?.response?.status, err?.message);
      // If the user record is not yet found, retry up to 3 times with increasing delays
      if (err?.response?.status === 404 && retryCount < 3) {
        setTimeout(() => fetchBalance(retryCount + 1), 2000 * (retryCount + 1));
      }
    }
  };

  const startPricePoll = useCallback((pairList: TradingPair[]) => {
    const fetchPrices = async () => {
      const updates: Record<string, PriceInfo> = {};
      const idsToFetch = [...pairList];
      // Also fetch current selected pair's price if it's not already in pairList
      const currentSelectedPair = selectedPairRef.current;
      if (currentSelectedPair && !idsToFetch.find((p) => p.id === currentSelectedPair.id)) {
        idsToFetch.push(currentSelectedPair);
      }
      await Promise.allSettled(
        idsToFetch.map(async (p) => {
          try {
            const priceRes = await api.get(`/trading/pairs/${p.id}/price`);
            updates[p.id] = {
              price: priceRes.data?.data?.price ?? 0,
              change24h: priceRes.data?.data?.change24h ?? 0,
            };
          } catch {}
        })
      );
      setPrices((prev) => ({ ...prev, ...updates }));

      // Push the latest price tick into the K-line chart for the currently selected pair
      const selectedPair = selectedPairRef.current;
      if (selectedPair && updates[selectedPair.id] != null) {
        const latestPrice = updates[selectedPair.id].price;
        if (
          latestPrice > 0 &&
          candleSeriesRef.current &&
          lastKlineTimeRef.current > 0 &&
          lastCandleRef.current
        ) {
          const prev = lastCandleRef.current;
          const updatedCandle = {
            time: lastKlineTimeRef.current,
            open: prev.open,
            high: Math.max(prev.high, latestPrice),
            low: Math.min(prev.low, latestPrice),
            close: latestPrice,
          };
          try { candleSeriesRef.current.update(updatedCandle); } catch { /* ignore */ }
          lastCandleRef.current = { open: updatedCandle.open, high: updatedCandle.high, low: updatedCandle.low, close: updatedCandle.close };
        }
      }
    };
    fetchPrices();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchPrices, 2000);
  }, []);

  const fetchRulesForPair = async (pair: TradingPair) => {
    try {
      const res = await api.get(`/trading/pairs/${pair.id}/rules`);
      let ruleList: TradingRule[] = res.data?.data || [];
      if (ruleList.length === 0) {
        // try global rules endpoint
        const globalRes = await api.get('/trading/rules').catch(() => ({ data: null }));
        ruleList = globalRes.data?.data || globalRes.data?.rules || [];
      }
      if (ruleList.length === 0) {
        ruleList = DEFAULT_RULES;
      }
      setRules(ruleList);
      // Update selectedOdds based on the currently selected duration (use ref to avoid stale closure)
      const currentDuration = selectedDurationRef.current;
      const match = ruleList.find((r) => r.duration_seconds === currentDuration);
      if (match) setSelectedOdds(match.odds);
    } catch {
      setRules(DEFAULT_RULES);
      setSelectedOdds(DEFAULT_RULES[0].odds);
    }
  };

  const openDetail = async (pair: TradingPair) => {
    setSelectedPair(pair);
    selectedPairRef.current = pair;
    setResultMsg(null);
    clearOrderError();
    // Clear existing entry price line when switching pairs
    if (entryPriceLineRef.current && candleSeriesRef.current) {
      try { candleSeriesRef.current.removePriceLine(entryPriceLineRef.current); } catch {}
      entryPriceLineRef.current = null;
    }
    // Immediately fetch the price for this pair so the detail view shows up-to-date data
    try {
      const priceRes = await api.get(`/trading/pairs/${pair.id}/price`);
      setPrices((prev) => ({
        ...prev,
        [pair.id]: {
          price: priceRes.data?.data?.price ?? 0,
          change24h: priceRes.data?.data?.change24h ?? 0,
        },
      }));
    } catch {
      // non-critical, poll will update soon
    }
    await fetchRulesForPair(pair);
  };

  const handleDurationSelect = (sec: number) => {
    setSelectedDuration(sec);
    const rule = rules.find((r) => r.duration_seconds === sec);
    if (rule) setSelectedOdds(rule.odds);
    // Clear existing entry price line when switching duration
    if (entryPriceLineRef.current && candleSeriesRef.current) {
      try { candleSeriesRef.current.removePriceLine(entryPriceLineRef.current); } catch {}
      entryPriceLineRef.current = null;
    }
  };

  const clearOrderError = () => {
    setOrderError(null);
    if (orderErrorTimerRef.current) clearTimeout(orderErrorTimerRef.current);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
    clearOrderError();
  };

  const handleQuickAmount = (v: number) => {
    setAmount(String(v));
    clearOrderError();
  };

  const openConfirm = (dir: 'up' | 'down') => {
    if (!amount || Number(amount) <= 0) return;
    clearOrderError();
    setConfirmDirection(dir);
    setConfirmOpen(true);
  };

  const submitOrder = async () => {
    if (!selectedPair || !amount || submitting) return;
    if (!tgUser?.id) {
      setOrderError('用户未登录，请重新打开应用');
      setConfirmOpen(false);
      return;
    }

    clearOrderError();
    setSubmitting(true);
    setConfirmOpen(false);

    // Debug: output auth state
    console.log('[Trading] submitOrder: authSyncDone=', authSyncDone, 'tgUser.id=', tgUser?.id);
    console.log('[Trading] submitOrder: api headers=', {
      sessionToken: api.defaults.headers.common['X-Session-Token'] ? 'present' : 'missing',
      initData: api.defaults.headers.common['X-Telegram-Init-Data'] ? 'present' : 'missing',
    });

    const payload: any = {
      pair_id: Number(selectedPair.id),
      duration: Number(selectedDuration),
      direction: confirmDirection,
      amount: Number(amount),
    };

    // Attach next-period boundaries so the backend can use fixed time boundaries
    // Always read the latest period info from the ref to avoid stale closure issues.
    // If we're within 2 seconds of a period boundary, wait briefly to avoid race conditions.
    let currentPeriodInfo = periodInfoRef.current ?? getCurrentPeriodInfo(selectedDurationRef.current);
    if (currentPeriodInfo.secondsUntilNext < 2) {
      await new Promise(resolve => setTimeout(resolve, 100));
      currentPeriodInfo = getCurrentPeriodInfo(selectedDurationRef.current);
      periodInfoRef.current = currentPeriodInfo;
    }
    if (currentPeriodInfo) {
      // currentPeriod is 1-indexed (period 1 starts at dayStartSec, period 2 at dayStartSec + duration, …).
      // Therefore dayStartSec + currentPeriod * durationSeconds equals the start of the NEXT (upcoming) period,
      // which is exactly what users are ordering into.
      const dayStartSec = Math.floor(Date.now() / 1000 / 86400) * 86400;
      const periodStartMs = (dayStartSec + currentPeriodInfo.currentPeriod * selectedDurationRef.current) * 1000;
      payload.period_label = currentPeriodInfo.nextPeriodLabel;
      payload.period_start = periodStartMs;
    }
    console.log('[Trading] submitOrder payload:', payload);

    try {
      const res = await api.post('/trading/quick-session', payload);
      const sessionEnd = res.data?.data?.session?.end_time
        ? new Date(res.data.data.session.end_time).getTime()
        : Date.now() + selectedDuration * 1000;
      const sessionId = res.data?.data?.session?.id;
      const sessionStartTime = res.data?.data?.session?.start_time
        ? new Date(res.data.data.session.start_time).getTime()
        : null;

      // Schedule drawing the entry price dashed line once the session becomes active
      // (period-snapshot job activates it at start_time with the correct open_price)
      if (sessionId) {
        const drawLineWhenActive = async () => {
          const POLL_INTERVAL_MS = 2000;
          const MAX_ACTIVATION_WAIT_MS = 30000;
          const start = Date.now();
          while (Date.now() - start < MAX_ACTIVATION_WAIT_MS) {
            try {
              const sessionRes = await api.get(`/trading/sessions/${sessionId}`);
              const sess = sessionRes.data?.data;
              if (sess && sess.status === 'active' && sess.open_price) {
                const openPrice = parseFloat(sess.open_price);
                if (candleSeriesRef.current) {
                  try {
                    if (entryPriceLineRef.current) {
                      candleSeriesRef.current.removePriceLine(entryPriceLineRef.current);
                    }
                    entryPriceLineRef.current = candleSeriesRef.current.createPriceLine({
                      price: openPrice,
                      color: '#F0B90B',
                      lineWidth: 1,
                      lineStyle: 2, // Dashed
                      axisLabelVisible: true,
                      title: '',
                    });
                  } catch { /* ignore chart errors */ }
                }
                // FIX: Sync lastCandleRef.open with the authoritative open_price from server.
                // This ensures the new period's first candle open matches what the admin panel shows,
                // eliminating the visual discrepancy caused by latency in the polling loop.
                if (lastCandleRef.current && !isNaN(openPrice) && openPrice > 0) {
                  const newHigh = Math.max(lastCandleRef.current.high, openPrice);
                  const newLow = Math.min(lastCandleRef.current.low, openPrice);
                  lastCandleRef.current = {
                    open: openPrice,
                    high: newHigh,
                    low: newLow,
                    close: lastCandleRef.current.close,
                  };
                  // Push the corrected candle to the chart immediately
                  if (candleSeriesRef.current && lastKlineTimeRef.current > 0) {
                    try {
                      candleSeriesRef.current.update({
                        time: lastKlineTimeRef.current,
                        open: openPrice,
                        high: newHigh,
                        low: newLow,
                        close: lastCandleRef.current.close,
                      });
                    } catch { /* ignore chart errors */ }
                  }
                }
                // Update the progress card to show the authoritative open_price from the session
                setActiveOrderEntryPrice(openPrice);
                return;
              }
            } catch { /* ignore polling errors */ }
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          }
        };

        // Wait until session start time before polling, with an extra 200ms buffer
        // for the period-snapshot job to write open_price
        const delay = sessionStartTime ? Math.max(0, sessionStartTime - Date.now() + 200) : 500;
        setTimeout(drawLineWhenActive, delay);
      }

      startCountdown(sessionEnd, res.data?.data?.order?.id);
      // Reset entry price display — will be populated once session becomes active
      setActiveOrderEntryPrice(null);
      // Show brief success feedback
      setOrderSuccess(t('order_placed_success'));
      if (orderSuccessTimerRef.current) clearTimeout(orderSuccessTimerRef.current);
      orderSuccessTimerRef.current = setTimeout(() => setOrderSuccess(null), 3000);
      // Refresh balance and order history after placing order
      await fetchBalance();
      await fetchOrderHistory();
    } catch (e: any) {
      const status = e?.response?.status;
      const errMsg = e?.response?.data?.error || e?.response?.data?.hint || e?.message || t('order_failed') || 'Order placement failed';
      console.error('[Trading] submitOrder error:', status, e?.response?.data);

      let displayMsg = errMsg;
      if (status === 401 || /Invalid init data|Authentication/i.test(errMsg)) {
        displayMsg = '登录状态已过期，请重新打开 App';
      } else if (status === 402 || /Insufficient balance|余额不足/i.test(errMsg)) {
        displayMsg = '余额不足，请充值后再试';
      } else if (status === 503 || /missing_migration|Trading feature is not ready/i.test(errMsg)) {
        displayMsg = '交易功能暂不可用，请联系管理员';
      } else if (/period_start is out of acceptable range/i.test(errMsg)) {
        displayMsg = '下单时机不佳，请稍后重试';
      } else if (/Invalid amount/i.test(errMsg)) {
        displayMsg = '请输入有效金额';
      } else if (/No active trading rule/i.test(errMsg)) {
        displayMsg = '当前交易对暂无可用规则，请稍后再试';
      } else if (status === 400) {
        displayMsg = `参数错误: ${errMsg}`;
      }

      setOrderError(displayMsg);
      orderErrorTimerRef.current = setTimeout(() => setOrderError(null), 8000);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  };

  const startCountdown = (endTime: number, orderId?: string) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const tick = () => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current!);
        setCountdown(null);
        // Remove entry price line when the period ends
        if (entryPriceLineRef.current && candleSeriesRef.current) {
          try { candleSeriesRef.current.removePriceLine(entryPriceLineRef.current); } catch {}
          entryPriceLineRef.current = null;
        }
        if (orderId) fetchResult(orderId);
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
  };

  const fetchResult = async (orderId: string) => {
    // Poll for the settled order with exponential backoff (up to ~15 seconds total)
    // to give the backend auto-settlement service time to finish.
    const delays = [1000, 2000, 3000, 5000, 5000];
    let settled = false;
    for (const delay of delays) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        const res = await api.get('/trading/orders/my', {
          params: { limit: 50, status: 'settled' },
        });
        const order = res.data?.data?.find((o: any) => o.id === orderId);
        if (order) {
          settled = true;
          const isDraw = order.result === 'draw';
          const win = order.result === 'win';
          const amountVal = parseFloat(String(order.amount));
          const oddsVal = parseFloat(String(order.odds));
          let profit: number;
          if (isDraw) {
            profit = 0;
          } else if (win) {
            const backendProfit = order.profit != null ? Number(order.profit) : NaN;
            if (!isNaN(backendProfit)) {
              profit = backendProfit;
            } else if (!isNaN(amountVal) && !isNaN(oddsVal) && oddsVal > 0) {
              profit = amountVal * oddsVal;
            } else {
              profit = isNaN(amountVal) ? 0 : amountVal;
            }
          } else {
            profit = isNaN(amountVal) ? 0 : -amountVal;
          }
          setResultMsg({ win: isDraw ? false : win, profit, draw: isDraw });

          // Add close price line to chart
          if (order.close_price && candleSeriesRef.current) {
            try {
              const closePrice = parseFloat(order.close_price);
              const lineColor = isDraw ? '#F0B90B' : win ? '#26a69a' : '#ef5350';
              const lineTitle = isDraw ? `➖ ${closePrice.toFixed(4)}` : win ? `✅ ${closePrice.toFixed(4)}` : `❌ ${closePrice.toFixed(4)}`;
              candleSeriesRef.current.createPriceLine({
                price: closePrice,
                color: lineColor,
                lineWidth: 2,
                lineStyle: 0, // Solid
                axisLabelVisible: true,
                title: lineTitle,
              });
            } catch { /* ignore chart errors */ }
          }

          // Confetti on win
          if (win) {
            setShowConfetti(true);
            setWinMessage({ win: true, profit });
            if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
            confettiTimerRef.current = setTimeout(() => { setShowConfetti(false); setWinMessage(null); }, 3000);
          } else if (isDraw) {
            setWinMessage({ win: false, profit: 0, draw: true });
            if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
            confettiTimerRef.current = setTimeout(() => setWinMessage(null), 3000);
          } else {
            setWinMessage({ win: false, profit });
            if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
            confettiTimerRef.current = setTimeout(() => setWinMessage(null), 3000);
          }

          break; // Order found and settled — stop retrying
        }
      } catch {}
    }
    // If polling ended without finding a settled order, check whether the order is still
    // active/pending and show a "settling in progress" banner instead of silently doing nothing.
    if (!settled) {
      try {
        const checkRes = await api.get('/trading/orders/my', { params: { limit: 50 } });
        const pendingOrder = checkRes.data?.data?.find(
          (o: any) => o.id === orderId && (o.status === 'active' || o.status === 'pending')
        );
        if (pendingOrder) {
          setResultMsg({ win: false, profit: 0, settling: true });
          if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
          confettiTimerRef.current = setTimeout(() => setResultMsg(null), 8000);
        }
      } catch {}
    }
    await fetchOrderHistory();
    await fetchBalance(); // refresh balance after settlement
  };

  const fetchOrderHistory = async () => {
    try {
      const res = await api.get('/trading/orders/my', {
        params: { limit: 20 },
      });
      setOrders(res.data?.data || []);
    } catch {}
  };

  const priceColor = (change: number) => (change >= 0 ? '#26a69a' : '#ef5350');

  if (loading) {
    return (
      <div style={{ padding: '16px', color: theme.textSecondary, textAlign: 'center', paddingTop: '80px' }}>
        {t('loading')}
      </div>
    );
  }

  // Detail view
  if (selectedPair) {
    const priceInfo = prices[selectedPair.id] || { price: 0, change24h: 0 };
    const amountNum = Number(amount) || 0;
    const expectedProfit = amountNum * (selectedOdds - 1);

    return (
      <div style={{ padding: '16px', paddingBottom: '32px' }}>
        {/* Confetti overlay */}
        {showConfetti && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, pointerEvents: 'none', overflow: 'hidden' }}>
            {Array.from({ length: 30 }).map((_, i) => (
              <div key={i} style={{
                position: 'absolute',
                width: `${6 + Math.random() * 8}px`,
                height: `${6 + Math.random() * 8}px`,
                backgroundColor: ['#f0b90b', '#26a69a', '#ef5350', '#fff', '#7b61ff'][i % 5],
                left: `${Math.random() * 100}%`,
                top: `-10px`,
                borderRadius: '2px',
                animation: `confettiFall ${1.5 + Math.random()}s ease-in ${Math.random() * 0.8}s forwards`,
              }} />
            ))}
            <style>{`@keyframes confettiFall { to { transform: translateY(100vh) rotate(720deg); opacity: 0; } }`}</style>
          </div>
        )}

        {/* Win/Lose floating message */}
        {winMessage && (
          <div style={{
            position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)',
            zIndex: 10000, textAlign: 'center', pointerEvents: 'none',
            animation: 'fadeOut 2.5s forwards',
          }}>
            <style>{`@keyframes fadeOut { 0%{opacity:1;transform:translateX(-50%) scale(1)} 70%{opacity:1} 100%{opacity:0;transform:translateX(-50%) scale(1.1)} }`}</style>
            <div style={{ fontSize: '28px', fontWeight: 800, color: winMessage.win ? '#26a69a' : winMessage.draw ? '#F0B90B' : '#ef5350',
              backgroundColor: 'rgba(0,0,0,0.85)', padding: '16px 28px', borderRadius: '16px',
              border: `2px solid ${winMessage.win ? '#26a69a' : winMessage.draw ? '#F0B90B' : '#ef5350'}` }}>
              {winMessage.win
                ? `🎉 恭喜获胜！ +${safeFixed(winMessage.profit)} USDT`
                : winMessage.draw
                ? `➖ 平局，退还金额`
                : `💔 很遗憾，下次加油！`}
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
          <button
            onClick={() => { setSelectedPair(null); selectedPairRef.current = null; setResultMsg(null); setCountdown(null); }}
            style={{ background: 'none', border: 'none', color: theme.text, fontSize: '20px', cursor: 'pointer', padding: 0 }}
          >←</button>
          <h2 style={{ margin: 0, color: theme.text, fontSize: '18px' }}>{selectedPair.display_name}</h2>
        </div>

        {/* Available balance — top center, prominent */}
        {availableBalance !== null && (
          <div style={{ textAlign: 'center', marginBottom: '10px' }}>
            <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{t('available_balance')}: </span>
            <span style={{ color: '#f0b90b', fontSize: '28px', fontWeight: 700 }}>{safeFixed(availableBalance)}</span>
            <span style={{ color: '#f0b90b', fontSize: '14px', fontWeight: 600 }}> USDT</span>
          </div>
        )}

        {/* Price + 24h change — compact */}
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '6px 16px', marginBottom: '10px', border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }} data-price-id={selectedPair.id}>
            {priceInfo.price === 0 && selectedPair.pair_type === 'custom'
              ? t('loading') || '加载中...'
              : `$${priceInfo.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </div>
          <div style={{ fontSize: '12px', color: priceColor(priceInfo.change24h) }}>
            {priceInfo.change24h >= 0 ? '▲' : '▼'} {safeFixed(Math.abs(Number(priceInfo.change24h)))}% 24h
          </div>
        </div>

        {/* K-line interval selector */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          {KLINE_INTERVALS.map((iv) => (
            <button
              key={iv.value}
              onClick={() => setKlineInterval(iv.value)}
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                border: `1px solid ${klineInterval === iv.value ? '#f0b90b' : theme.border}`,
                backgroundColor: klineInterval === iv.value ? '#f0b90b22' : theme.bgCard,
                color: klineInterval === iv.value ? '#f0b90b' : theme.textSecondary,
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {iv.label}
            </button>
          ))}
        </div>

        {/* K-line chart */}
        <div
          ref={chartContainerRef}
          style={{
            width: '100%',
            height: klineError ? '0px' : '200px',
            borderRadius: '12px',
            overflow: 'hidden',
            marginBottom: klineError ? '0' : '4px',
            backgroundColor: theme.bgCard,
            border: klineError ? 'none' : `1px solid ${theme.border}`,
          }}
        />
        {klineError && (
          <div style={{
            width: '100%',
            height: '60px',
            borderRadius: '12px',
            marginBottom: '4px',
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.textSecondary,
            fontSize: '13px',
          }}>
            📊 暂时无法显示K线图
          </div>
        )}

        {/* Period info — directly below chart */}
        {periodInfo && (
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            padding: '6px 12px',
            marginBottom: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
          }}>
            {/* 当前期号 */}
            <div style={{ color: theme.textSecondary, textAlign: 'center' }}>
              <div style={{ color: theme.text, fontWeight: 600 }}>{t('period_current')}</div>
              <div>{periodInfo.currentPeriodLabel}</div>
            </div>
            {/* 倒计时 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#f0b90b', fontSize: '16px', fontWeight: 700 }}>
                {String(Math.floor(periodInfo.secondsUntilNext / 60)).padStart(2, '0')}:
                {String(periodInfo.secondsUntilNext % 60).padStart(2, '0')}
              </div>
              <div style={{ color: theme.textSecondary, fontSize: '10px' }}>{t('period_countdown')}</div>
            </div>
            {/* 下一期号 */}
            <div style={{ color: theme.textSecondary, textAlign: 'center' }}>
              <div style={{ color: theme.text, fontWeight: 600 }}>{t('period_next')}</div>
              <div>{periodInfo.nextPeriodLabel}</div>
            </div>
          </div>
        )}

        {/* Result banner */}
        {resultMsg && (
          <div style={{
            backgroundColor: resultMsg.settling ? '#1a3a5c' : resultMsg.draw ? '#4a3800' : resultMsg.win ? '#1b5e20' : '#b71c1c',
            borderRadius: '12px', padding: '16px', marginBottom: '12px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#fff' }}>
              {resultMsg.settling ? '⏳ 结算处理中' : resultMsg.draw ? '➖ 平局' : resultMsg.win ? '🏆 WIN' : '😞 LOSE'}
            </div>
            <div style={{ color: '#fff', fontSize: '16px', marginTop: '4px' }}>
              {resultMsg.settling
                ? '订单正在结算，请稍候...'
                : resultMsg.draw
                ? '退还金额'
                : resultMsg.win
                ? `到账金额: +${safeFixed(resultMsg.profit)} USDT`
                : `亏损金额: ${safeFixed(resultMsg.profit)} USDT`}
            </div>
          </div>
        )}

        {/* Duration selector */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '8px' }}>{t('select_duration')}</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d.seconds}
                onClick={() => handleDurationSelect(d.seconds)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${selectedDuration === d.seconds ? '#f0b90b' : theme.border}`,
                  backgroundColor: selectedDuration === d.seconds ? '#f0b90b22' : theme.bgCard,
                  color: selectedDuration === d.seconds ? '#f0b90b' : theme.text,
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                {t(d.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Active order progress card */}
        {activeOrder && countdown !== null && (
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', marginBottom: '12px',
            backgroundColor: 'rgba(38,166,154,0.12)', border: '1px solid rgba(38,166,154,0.4)' }}>
            {/* Fade-out progress bar (background layer) */}
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${(countdown / selectedDuration) * 100}%`,
              backgroundColor: 'rgba(38,166,154,0.25)',
              transition: 'width 1s linear',
              borderRadius: '12px 0 0 12px',
            }} />
            {/* Content layer */}
            <div style={{ position: 'relative', zIndex: 1, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: activeOrder.direction === 'up' ? '#26a69a' : '#ef5350', fontWeight: 600, fontSize: '13px' }}>
                  {activeOrder.direction === 'up' ? '🟢 UP' : '🔴 DOWN'}
                </span>
                <span style={{ color: theme.text, fontWeight: 700, fontSize: '15px' }}>
                  {Number(activeOrder.amount).toFixed(2)} USDT
                </span>
                <span style={{ color: theme.textSecondary, fontSize: '11px' }}>{t('holdings_active')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '12px' }}>
                <span style={{ color: theme.textSecondary }}>
                  {activeOrder.display_name ?? activeOrder.symbol ?? selectedPair?.display_name ?? '--'}
                </span>
                <span style={{ color: theme.textSecondary }}>
                  {t('order_entry_price')} {activeOrderEntryPrice != null && activeOrderEntryPrice > 0 ? `${activeOrderEntryPrice.toFixed(2)} USDT` : '--'}
                </span>
                <span style={{ color: '#f0b90b', fontWeight: 700 }}>{countdown}s</span>
              </div>
            </div>
          </div>
        )}

        {/* Amount + UP/DOWN side by side */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            {/* Left: amount area */}
            <div style={{ flex: 1 }}>
              <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '6px' }}>{t('bet_amount')}</div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {QUICK_AMOUNTS.map((v) => (
                  <button
                    key={v}
                    onClick={() => handleQuickAmount(v)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '8px',
                      border: `1px solid ${Number(amount) === v ? '#f0b90b' : theme.border}`,
                      backgroundColor: Number(amount) === v ? '#f0b90b22' : theme.bgCard,
                      color: Number(amount) === v ? '#f0b90b' : theme.text,
                      cursor: 'pointer', fontSize: '12px',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={amount}
                onChange={handleAmountChange}
                placeholder={t('custom_amount')}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: '8px',
                  border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard,
                  color: theme.text, fontSize: '15px', boxSizing: 'border-box',
                }}
              />
              {amountNum > 0 && (
                <div style={{ color: theme.textSecondary, fontSize: '11px', marginTop: '4px' }}>
                  {t('expected_profit')}: +{safeFixed(expectedProfit)} USDT
                </div>
              )}
            </div>
            {/* Right: UP/DOWN buttons stacked vertically */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '120px', flexShrink: 0 }}>
              <button
                onClick={() => openConfirm('up')}
                disabled={!amount || Number(amount) <= 0 || countdown !== null || !!activeOrder}
                style={{
                  backgroundColor: '#26a69a', color: '#fff',
                  borderRadius: '10px', padding: '0 8px',
                  height: '45px',
                  fontSize: '15px', fontWeight: 700, border: 'none',
                  cursor: (!amount || Number(amount) <= 0 || countdown !== null || !!activeOrder) ? 'not-allowed' : 'pointer',
                  opacity: (!amount || Number(amount) <= 0 || countdown !== null || !!activeOrder) ? 0.5 : 1,
                  transition: 'opacity 0.2s', width: '100%',
                }}
              >
                ▲ {t('order_up')}
              </button>
              <button
                onClick={() => openConfirm('down')}
                disabled={!amount || Number(amount) <= 0 || countdown !== null || !!activeOrder}
                style={{
                  backgroundColor: '#ef5350', color: '#fff',
                  borderRadius: '10px', padding: '0 8px',
                  height: '45px',
                  fontSize: '15px', fontWeight: 700, border: 'none',
                  cursor: (!amount || Number(amount) <= 0 || countdown !== null || !!activeOrder) ? 'not-allowed' : 'pointer',
                  opacity: (!amount || Number(amount) <= 0 || countdown !== null || !!activeOrder) ? 0.5 : 1,
                  transition: 'opacity 0.2s', width: '100%',
                }}
              >
                ▼ {t('order_down')}
              </button>
            </div>
          </div>

        {/* Order error banner */}
        {orderError && (
          <div style={{
            backgroundColor: 'rgba(239, 83, 80, 0.15)',
            border: '1px solid #ef5350',
            borderRadius: '8px',
            padding: '10px 14px',
            color: '#ef5350',
            fontSize: '14px',
            marginBottom: '4px',
          }}>
            ⚠️ {orderError}
          </div>
        )}

        {/* Order success banner */}
        {orderSuccess && (
          <div style={{
            backgroundColor: 'rgba(38, 166, 154, 0.15)',
            border: '1px solid #26a69a',
            borderRadius: '8px',
            padding: '10px 14px',
            color: '#26a69a',
            fontSize: '14px',
            marginBottom: '4px',
          }}>
            {orderSuccess}
          </div>
        )}

        {/* Order history toggle */}
        <button
          onClick={() => { setHistoryOpen(!historyOpen); if (!historyOpen) fetchOrderHistory(); }}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, cursor: 'pointer', fontSize: '14px' }}
        >
          {historyOpen ? t('collapse_history') : t('view_history')}
        </button>

        {historyOpen && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {orders.length === 0 ? (
              <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '16px' }}>{t('no_history')}</div>
            ) : orders.map((o) => {
              const isWin = o.result === 'win';
              const isLose = o.result === 'lose';
              const isDraw = o.result === 'draw';
              const isSettled = isWin || isLose || isDraw;

              if (isSettled) {
                const goldColor = '#F0B90B';
                const borderColor = isLose ? theme.border : goldColor;
                const textColor = isLose ? undefined : goldColor;
                const rawEntryPrice = o.session_open_price != null ? o.session_open_price : o.entry_price;
                const rawClosePrice = o.session_close_price != null ? o.session_close_price : o.close_price;
                const entryPrice = rawEntryPrice != null ? `${Number(rawEntryPrice).toFixed(2)} USDT` : '--';
                const closePrice = rawClosePrice != null ? `${Number(rawClosePrice).toFixed(2)} USDT` : '--';
                const periodDisplay = o.period_label ? o.period_label.split('-').pop() ?? o.period_label : '-';

                let resultLabel: string;
                let amountDisplay: string;
                if (isWin) {
                  resultLabel = `🎉 ${t('order_win_label')} +${(Number(o.amount) * Number(o.odds)).toFixed(1)} USDT 🎉`;
                  amountDisplay = `+${(Number(o.amount) * Number(o.odds)).toFixed(1)} USDT`;
                } else if (isDraw) {
                  resultLabel = `${t('order_draw_label')} +${Number(o.amount).toFixed(1)} USDT`;
                  amountDisplay = `+${Number(o.amount).toFixed(1)} USDT`;
                } else {
                  resultLabel = `${t('order_lose_label')} -${Number(o.amount).toFixed(1)} USDT`;
                  amountDisplay = `-${Number(o.amount).toFixed(1)} USDT`;
                }

                return (
                  <div key={o.id} style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '12px', border: `1px solid ${borderColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: o.direction === 'up' ? '#26a69a' : '#ef5350', fontWeight: '600', fontSize: '13px' }}>
                        {o.direction === 'up' ? t('order_up') : t('order_down')}
                      </span>
                      <span style={{ color: textColor ?? theme.text, fontWeight: '700', fontSize: '14px', textAlign: 'center', flex: 1, padding: '0 8px' }}>
                        {resultLabel}
                      </span>
                      <span style={{ color: textColor ?? theme.textSecondary, fontSize: '11px' }}>
                        {t('order_settled')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '12px' }}>
                      <span style={{ color: textColor ?? theme.textSecondary }}>
                        {o.display_name ?? o.symbol ?? '--'}
                      </span>
                      <span style={{ color: textColor ?? theme.textSecondary }}>
                        {entryPrice} → {closePrice}
                      </span>
                      <span style={{ color: textColor ?? theme.textSecondary }}>
                        {periodDisplay}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
              <div key={o.id} style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '12px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: o.direction === 'up' ? '#26a69a' : '#ef5350', fontWeight: '600' }}>
                    {o.direction === 'up' ? t('order_up') : t('order_down')}
                  </span>
                  <span style={{ color: o.status === 'won' ? '#26a69a' : o.status === 'lost' ? '#ef5350' : theme.textSecondary, fontSize: '13px' }}>
                    {o.status === 'won' ? t('order_status_won') : o.status === 'lost' ? t('order_status_lost') : o.status}
                  </span>
                </div>
                <div style={{ color: theme.textSecondary, fontSize: '12px', marginTop: '4px' }}>
                  {t('order_amount_label')}: {o.amount} USDT · {t('order_odds_label')}: {o.odds}x · {new Date(o.created_at).toLocaleString()}
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Confirm dialog */}
        {confirmOpen && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', width: '320px', maxWidth: '90vw' }}>
              <h3 style={{ color: theme.text, margin: '0 0 16px' }}>{t('confirm_order')}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {[
                  [t('order_pair'), selectedPair.display_name],
                  [t('order_direction'), confirmDirection === 'up' ? t('order_up') : t('order_down')],
                  [t('order_amount'), `${amount} USDT`],
                  [t('order_duration'), `${selectedDuration}${t('order_seconds')}`],
                  [t('order_period') || '购买期号', periodInfo?.nextPeriodLabel ?? '—'],
                  [t('order_expected_yield'), `+${safeFixed(Number(amount) * (selectedOdds - 1))} USDT`],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.textSecondary }}>{label}</span>
                    <span style={{ color: theme.text, fontWeight: '500' }}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setConfirmOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.text, cursor: 'pointer', fontSize: '15px' }}>{t('cancel')}</button>
                <button onClick={submitOrder} disabled={submitting} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: confirmDirection === 'up' ? '#26a69a' : '#ef5350', color: '#fff', cursor: 'pointer', fontSize: '15px', fontWeight: '600' }}>
                  {submitting ? t('placing_order') : t('confirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Pairs list view
  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: '20px' }}>{t('trading_title')}</h1>
      {pairs.length === 0 && (
        <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>
          {t('no_trading_pairs') || '暂无可交易品种'}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {pairs.map((pair) => {
          const info = prices[pair.id] || { price: 0, change24h: 0 };
          return (
            <div
              key={pair.id}
              onClick={() => openDetail(pair)}
              style={{
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                padding: '16px',
                border: `1px solid ${theme.border}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {pair.icon_url ? (
                    <img
                      src={resolveIconUrl(pair.icon_url)}
                      alt={pair.symbol}
                      width={32}
                      height={32}
                      style={{ borderRadius: '50%', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      backgroundColor: '#1677ff', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: '700', fontSize: '14px',
                    }}>
                      {pair.symbol[0]}
                    </div>
                  )}
                  <div>
                    <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>{pair.display_name}</div>
                    <div style={{ color: theme.textSecondary, fontSize: '12px' }}>{pair.symbol}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: theme.text, fontWeight: '600' }} data-price-id={pair.id}>
                    ${info.price != null ? info.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '--'}
                  </div>
                  <div style={{ color: priceColor(info.change24h), fontSize: '13px' }}>
                    {info.change24h >= 0 ? '+' : ''}{safeFixed(info.change24h)}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
