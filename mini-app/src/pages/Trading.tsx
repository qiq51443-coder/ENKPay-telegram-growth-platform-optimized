// @ts-nocheck
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { theme } from '../theme';
import { api, setInitData } from '../services/api';
import { useLang } from '../context/LanguageContext';
import { useTelegram } from '../hooks/useTelegram';
import { createChart } from 'lightweight-charts';

interface TradingPair {
  id: string;
  symbol: string;
  display_name: string;
  pair_type: string;
  binance_symbol?: string;
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
  result?: 'win' | 'lose';
  profit?: number;
  created_at: string;
  symbol?: string;
  display_name?: string;
}

const DURATION_OPTIONS = [
  { label: '1分钟', seconds: 60, periodsPerDay: 1440 },
  { label: '5分钟', seconds: 300, periodsPerDay: 288 },
  { label: '10分钟', seconds: 600, periodsPerDay: 144 },
];

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

const DEFAULT_RULES: TradingRule[] = [
  { id: 'default', duration_seconds: 60, odds: 1.95, min_bet: 1, max_bet: 1000 },
];

export const Trading: React.FC = () => {
  const { t } = useLang();
  const { initData, user: tgUser, tg } = useTelegram();
  const [pairs, setPairs] = useState<TradingPair[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPair, setSelectedPair] = useState<TradingPair | null>(null);
  const [rules, setRules] = useState<TradingRule[]>([]);
  const [selectedDuration, setSelectedDuration] = useState(60);
  const [selectedOdds, setSelectedOdds] = useState(1.95);
  const [amount, setAmount] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDirection, setConfirmDirection] = useState<'up' | 'down'>('up');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [resultMsg, setResultMsg] = useState<{ win: boolean; profit: number } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [klineInterval, setKlineInterval] = useState('1m');
  const [klineError, setKlineError] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  // Available balance: wallet_balance + red_packet_balance
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const lastKlineTimeRef = useRef<number>(0);
  const lastCandleRef = useRef<{ open: number; high: number; low: number; close: number } | null>(null);

  // Set global initData header so all requests carry it automatically
  useEffect(() => {
    if (initData) {
      setInitData(initData);
    }
  }, [initData]);

  useEffect(() => {
    fetchPairs();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Fetch balance once Telegram WebApp is ready and initData is available
  useEffect(() => {
    if (tg && initData) {
      fetchBalance();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tg, initData]);

  // Track active order from order history
  useEffect(() => {
    const active = orders.find(o => o.status === 'active' || o.status === 'pending');
    setActiveOrder(active || null);
  }, [orders]);

  // Push real-time price tick into the last candle of the chart
  useEffect(() => {
    if (!selectedPair || !candleSeriesRef.current || lastKlineTimeRef.current === 0) return;
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

  // K-line chart: initialize when a pair is selected or interval changes
  useEffect(() => {
    if (!selectedPair || !chartContainerRef.current) return;
    // Use fallback width of window.innerWidth if container hasn't been laid out yet
    const containerWidth = chartContainerRef.current.clientWidth || window.innerWidth - 32;
    if (containerWidth === 0) return;
    setKlineError(false);

    // Destroy old chart if exists
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch {}
      chartRef.current = null;
      candleSeriesRef.current = null;
    }
    lastKlineTimeRef.current = 0;

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

    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        const w = chartContainerRef.current.clientWidth || window.innerWidth - 32;
        if (w > 0) chart.applyOptions({ width: w });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try { chart.remove(); } catch {}
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
      if (list.length > 0) startPricePoll(list);
    } catch {
      setPairs([
        { id: '1', symbol: 'BTC', display_name: 'BTC/USDT', pair_type: 'real', binance_symbol: 'BTCUSDT' },
        { id: '2', symbol: 'ETH', display_name: 'ETH/USDT', pair_type: 'real', binance_symbol: 'ETHUSDT' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBalance = async () => {
    if (!initData) return;
    try {
      const res = await api.get('/miniapp/profile', {
        headers: { 'X-Telegram-Init-Data': initData },
      });
      const user = res.data?.user;
      if (user) {
        const walletBal = parseFloat(String(user.wallet_balance ?? user.balance ?? 0));
        const redPacketBal = parseFloat(String(user.red_packet_balance ?? user.red_packet_credits ?? 0));
        setAvailableBalance(walletBal + redPacketBal);
      }
    } catch {
      // non-critical
    }
  };

  const startPricePoll = useCallback((pairList: TradingPair[]) => {
    const fetchPrices = async () => {
      const updates: Record<string, PriceInfo> = {};
      await Promise.allSettled(
        pairList.map(async (p) => {
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
    };
    fetchPrices();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchPrices, 5000);
  }, []);

  const openDetail = async (pair: TradingPair) => {
    setSelectedPair(pair);
    setResultMsg(null);
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
      const firstMatch = ruleList.find((r) => r.duration_seconds === selectedDuration) || ruleList[0];
      if (firstMatch) {
        setSelectedDuration(firstMatch.duration_seconds);
        setSelectedOdds(firstMatch.odds);
      }
    } catch {
      setRules(DEFAULT_RULES);
      setSelectedDuration(DEFAULT_RULES[0].duration_seconds);
      setSelectedOdds(DEFAULT_RULES[0].odds);
    }
  };

  const handleDurationSelect = (sec: number) => {
    setSelectedDuration(sec);
    const rule = rules.find((r) => r.duration_seconds === sec);
    if (rule) setSelectedOdds(rule.odds);
  };

  const handleQuickAmount = (v: number) => setAmount(String(v));

  const openConfirm = (dir: 'up' | 'down') => {
    if (!amount || Number(amount) <= 0) return;
    setOrderError(null);
    setConfirmDirection(dir);
    setConfirmOpen(true);
  };

  const submitOrder = async () => {
    if (!selectedPair || !amount || submitting) return;
    if (!initData || !tgUser?.id) {
      setOrderError(t('open_in_telegram') || '请在 Telegram 中打开此应用后再进行交易');
      setConfirmOpen(false);
      return;
    }
    setSubmitting(true);
    setConfirmOpen(false);
    setOrderError(null);
    try {
      const res = await api.post('/trading/quick-session', {
        pair_id: selectedPair.id,
        duration: selectedDuration,
        direction: confirmDirection,
        amount: Number(amount),
      }, {
        headers: { 'X-Telegram-Init-Data': initData },
      });
      const sessionEnd = res.data?.data?.session?.end_time
        ? new Date(res.data.data.session.end_time).getTime()
        : Date.now() + selectedDuration * 1000;

      startCountdown(sessionEnd, res.data?.data?.order?.id);
      // Refresh balance and order history after placing order
      await fetchBalance();
      await fetchOrderHistory();
    } catch (e: any) {
      const msg = e?.response?.data?.hint
        || e?.response?.data?.error
        || t('order_failed');
      setOrderError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const startCountdown = (endTime: number, orderId?: string) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const tick = () => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current!);
        setCountdown(null);
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
    for (const delay of delays) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        const res = await api.get('/trading/orders/my', {
          params: { limit: 50, status: 'settled' },
          headers: { 'X-Telegram-Init-Data': initData },
        });
        const order = res.data?.data?.find((o: any) => o.id === orderId);
        if (order) {
          const win = order.result === 'win';
          const profit = win ? parseFloat(order.amount) * (parseFloat(order.odds) - 1) : -parseFloat(order.amount);
          setResultMsg({ win, profit });
          break; // Order found and settled — stop retrying
        }
      } catch {}
    }
    await fetchOrderHistory();
    await fetchBalance(); // refresh balance after settlement
  };

  const fetchOrderHistory = async () => {
    if (!initData) return;
    try {
      const res = await api.get('/trading/orders/my', {
        params: { limit: 20 },
        headers: { 'X-Telegram-Init-Data': initData },
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
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', gap: '8px' }}>
          <button
            onClick={() => { setSelectedPair(null); setResultMsg(null); setCountdown(null); }}
            style={{ background: 'none', border: 'none', color: theme.text, fontSize: '20px', cursor: 'pointer', padding: 0 }}
          >←</button>
          <h2 style={{ margin: 0, color: theme.text, fontSize: '18px' }}>{selectedPair.display_name}</h2>
          {availableBalance !== null && (
            <div style={{ marginLeft: 'auto', fontSize: '12px', color: theme.textSecondary }}>
              {t('available_balance') || '可用余额(含红包)'}: <span style={{ color: '#f0b90b', fontWeight: '600' }}>${safeFixed(availableBalance)}</span>
            </div>
          )}
        </div>

        {/* Price + 24h change */}
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', marginBottom: '12px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>
            ${priceInfo.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '14px', color: priceColor(priceInfo.change24h), marginTop: '4px' }}>
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
            marginBottom: klineError ? '0' : '12px',
            backgroundColor: theme.bgCard,
            border: klineError ? 'none' : `1px solid ${theme.border}`,
          }}
        />
        {klineError && (
          <div style={{
            width: '100%',
            height: '60px',
            borderRadius: '12px',
            marginBottom: '12px',
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

        {/* Result banner */}
        {resultMsg && (
          <div style={{
            backgroundColor: resultMsg.win ? '#1b5e20' : '#b71c1c',
            borderRadius: '12px', padding: '16px', marginBottom: '12px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#fff' }}>
              {resultMsg.win ? '🏆 WIN' : '😞 LOSE'}
            </div>
            <div style={{ color: '#fff', fontSize: '16px', marginTop: '4px' }}>
              {resultMsg.win ? `+${safeFixed(resultMsg.profit)} USDT` : `${safeFixed(resultMsg.profit)} USDT`}
            </div>
          </div>
        )}

        {/* Countdown */}
        {countdown !== null && (
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '12px', marginBottom: '12px', border: `1px solid ${theme.border}` }}>
            <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '6px' }}>{t('order_countdown')}</div>
            <div style={{ height: '6px', backgroundColor: theme.border, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(countdown / selectedDuration) * 100}%`,
                backgroundColor: '#f0b90b',
                borderRadius: '3px',
                transition: 'width 1s linear',
              }} />
            </div>
            <div style={{ color: theme.text, fontWeight: '600', marginTop: '6px', textAlign: 'center' }}>
              {countdown}s
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
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Odds display */}
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '12px', marginBottom: '12px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: theme.textSecondary }}>{t('odds')}</span>
          <span style={{ color: '#f0b90b', fontWeight: '600' }}>{safeFixed(selectedOdds)}x</span>
        </div>

        {/* Amount input */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '8px' }}>{t('bet_amount')}</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                onClick={() => handleQuickAmount(v)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${Number(amount) === v ? '#f0b90b' : theme.border}`,
                  backgroundColor: Number(amount) === v ? '#f0b90b22' : theme.bgCard,
                  color: Number(amount) === v ? '#f0b90b' : theme.text,
                  cursor: 'pointer', fontSize: '13px',
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('custom_amount')}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard,
              color: theme.text, fontSize: '16px', boxSizing: 'border-box',
            }}
          />
          {amountNum > 0 && (
            <div style={{ color: theme.textSecondary, fontSize: '12px', marginTop: '6px' }}>
              {t('expected_profit')}: +{safeFixed(expectedProfit)} USDT
            </div>
          )}
        </div>

        {/* Order error banner */}
        {orderError && (
          <div style={{
            backgroundColor: '#1a1a2e', borderRadius: '12px', padding: '12px',
            marginBottom: '12px', border: '1px solid #ef5350',
            color: '#ef5350', fontSize: '13px', textAlign: 'center',
          }}>
            ⚠️ {orderError}
            <button
              onClick={() => setOrderError(null)}
              style={{ marginLeft: '8px', background: 'none', border: 'none', color: '#ef5350', cursor: 'pointer', fontSize: '14px' }}
            >✕</button>
          </div>
        )}

        {/* UP/DOWN buttons */}
        {activeOrder && countdown !== null ? (
          <div style={{ textAlign: 'center', color: theme.textSecondary, padding: '12px 0', marginBottom: '16px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
            <div style={{ marginBottom: 6 }}>当前持仓：
              <span style={{ color: activeOrder.direction === 'up' ? '#26a69a' : '#ef5350', fontWeight: 'bold' }}>
                {activeOrder.direction === 'up' ? `📈 ${t('btn_up')}` : `📉 ${t('btn_down')}`}
              </span>
            </div>
            <div style={{ fontSize: '13px' }}>金额：{activeOrder.amount} USDT · 等待结算...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <button
              onClick={() => openConfirm('up')}
              disabled={!amount || Number(amount) <= 0 || countdown !== null || !!activeOrder}
              style={{
                flex: 1, padding: '16px', borderRadius: '12px', border: 'none',
                backgroundColor: '#26a69a', color: '#fff', fontSize: '18px', fontWeight: '700',
                cursor: 'pointer', opacity: (!amount || Number(amount) <= 0 || countdown !== null || !!activeOrder) ? 0.5 : 1,
              }}
            >
              {t('btn_up')}
            </button>
            <button
              onClick={() => openConfirm('down')}
              disabled={!amount || Number(amount) <= 0 || countdown !== null || !!activeOrder}
              style={{
                flex: 1, padding: '16px', borderRadius: '12px', border: 'none',
                backgroundColor: '#ef5350', color: '#fff', fontSize: '18px', fontWeight: '700',
                cursor: 'pointer', opacity: (!amount || Number(amount) <= 0 || countdown !== null || !!activeOrder) ? 0.5 : 1,
              }}
            >
              {t('btn_down')}
            </button>
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
            ) : orders.map((o) => (
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
            ))}
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
                  [t('order_odds_label'), `${safeFixed(selectedOdds)}x`],
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
                <div>
                  <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>{pair.display_name}</div>
                  <div style={{ color: theme.textSecondary, fontSize: '12px' }}>{pair.symbol}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: theme.text, fontWeight: '600' }}>
                    ${info.price > 0 ? info.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '--'}
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
