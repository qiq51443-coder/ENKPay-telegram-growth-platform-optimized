import React, { useEffect, useState, useRef } from 'react';
import { theme } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import { getTransactions, getAnnouncements, api } from '../services/api';
import { useLang } from '../context/LanguageContext';
import { useUser } from '../context/UserContext';
import { useAuthSync } from '../context/AuthSyncContext';
import { SUPPORTED_LANGUAGES, LangCode } from '../i18n';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after?: number;
  description?: string;
  order_id?: string;
  status?: string;
  created_at: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface TradingOrder {
  id: string;
  direction: 'up' | 'down';
  amount: number;
  entry_price?: number;
  close_price?: number;
  odds: number;
  status: string;
  result?: 'win' | 'lose' | 'draw';
  profit?: number;
  created_at: string;
  settled_at?: string;
  symbol?: string;
  display_name?: string;
  session_start?: string;
  session_end?: string;
  period_label?: string;
  session_open_price?: number | string;
  session_close_price?: number | string;
}

const TX_TYPE_LABEL_KEYS: Record<string, { labelKey: string; icon: string }> = {
  reward: { labelKey: 'tx_reward', icon: '🎁' },
  red_packet: { labelKey: 'tx_red_packet', icon: '🧧' },
  invite: { labelKey: 'tx_invite', icon: '👥' },
  invite_reward: { labelKey: 'tx_invite', icon: '👥' },
  follow_reward: { labelKey: 'tx_invite', icon: '👥' },
  bind_reward: { labelKey: 'tx_reward', icon: '🎁' },
  admin_credit: { labelKey: 'tx_reward', icon: '🎁' },
  admin_debit: { labelKey: 'tx_withdrawal', icon: '📤' },
  withdrawal: { labelKey: 'tx_withdrawal', icon: '💸' },
  deposit: { labelKey: 'tx_deposit', icon: '💰' },
  trade: { labelKey: 'tx_trade', icon: '📈' },
  transfer_in: { labelKey: 'tx_transfer_in', icon: '📥' },
  transfer_out: { labelKey: 'tx_transfer_out', icon: '📤' },
  trade_win: { labelKey: 'tx_trade_win', icon: '📈' },
  trade_loss: { labelKey: 'tx_trade_loss', icon: '📉' },
  auction_join: { labelKey: 'tx_auction_join', icon: '🎁' },
  auction_buy: { labelKey: 'tx_auction_join', icon: '🎁' },
  auction_refund: { labelKey: 'tx_auction_refund', icon: '↩️' },
  auction_redeem: { labelKey: 'tx_auction_redeem', icon: '🏆' },
  product_yield: { labelKey: 'tx_product_yield', icon: '💹' },
  nft_income: { labelKey: 'tx_product_yield', icon: '💹' },
  nft_settle: { labelKey: 'tx_product_yield', icon: '💹' },
  product_refund: { labelKey: 'tx_product_refund', icon: '✅' },
  nft_principal_return: { labelKey: 'tx_product_refund', icon: '✅' },
  product_purchase: { labelKey: 'tx_product_purchase', icon: '💎' },
  nft_purchase: { labelKey: 'tx_product_purchase', icon: '💎' },
};

type ProfileView = 'main' | 'orders' | 'trading_orders' | 'agreement' | 'announcements' | 'language';

const TX_FILTER_TABS = [
  { key: 'all',        labelKey: 'tx_filter_all' },
  { key: 'deposit',    labelKey: 'tx_deposit' },
  { key: 'withdrawal', labelKey: 'tx_withdrawal' },
  { key: 'transfer',   labelKey: 'tx_filter_transfer' },
  { key: 'trade',      labelKey: 'tx_filter_trade' },
  { key: 'other',      labelKey: 'tx_filter_other' },
];

const TX_DESC_TRUNCATE_LEN = 8;

// Types that represent outgoing / negative transactions (red, minus sign)
const NEGATIVE_TX_TYPES = new Set([
  'trade_loss',
  'product_purchase', 'nft_purchase',
  'auction_join', 'auction_buy',
  'transfer_out',
  'withdrawal',
  'admin_debit',
]);

// Types that represent incoming / positive transactions (green, plus sign)
const POSITIVE_TX_TYPES = new Set([
  'trade_win',
  'product_yield', 'nft_income', 'nft_settle',
  'product_refund', 'nft_principal_return',
  'transfer_in',
  'deposit',
  'auction_redeem', 'auction_refund',
  'reward', 'invite', 'invite_reward', 'follow_reward', 'bind_reward', 'red_packet',
  'admin_credit',
]);

function isTxNegative(type: string, amount: number): boolean {
  if (NEGATIVE_TX_TYPES.has(type)) return true;
  if (POSITIVE_TX_TYPES.has(type)) return false;
  return amount < 0;
}

export const Profile: React.FC = () => {
  const { user: tgUser } = useTelegram();
  const { lang, setLang, t } = useLang();
  const { user: contextUser, refreshBalance } = useUser();
  const { authSyncDone, authStatus } = useAuthSync();
  const [view, setView] = useState<ProfileView>('main');
  const [txFilter, setTxFilter] = useState<string>('all');
  const [idCopied, setIdCopied] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [annLoading, setAnnLoading] = useState(false);
  const [agreementText, setAgreementText] = useState('');
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [tradingOrders, setTradingOrders] = useState<TradingOrder[]>([]);
  const [tradingOrdersLoading, setTradingOrdersLoading] = useState(false);
  const [tradingOrdersPage, setTradingOrdersPage] = useState(1);
  const [tradingOrdersHasMore, setTradingOrdersHasMore] = useState(false);
  const tradingOrdersPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use contextUser (set by App-level auth flow) as the single source of truth
  const profile = contextUser;

  // Sync language preference from backend profile when contextUser becomes available
  useEffect(() => {
    if (contextUser?.language_code) {
      const supportedCodes = SUPPORTED_LANGUAGES.map(l => l.code as string);
      if (supportedCodes.includes(contextUser.language_code)) {
        setLang(contextUser.language_code as LangCode);
      }
    }
  }, [contextUser]);

  // When auth is done but profile is still null, attempt one final balance refresh
  useEffect(() => {
    if (authSyncDone && !contextUser) {
      refreshBalance().catch(err => {
        console.warn('[Profile] post-auth refreshBalance failed:', err?.message);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSyncDone, contextUser]);

  // Lightweight balance refresh — calls GET /miniapp/profile only (no auth-sync)
  const doRefreshBalance = () => {
    refreshBalance().catch(err => {
      console.warn('[Profile] refreshBalance error:', err?.message);
    });
  };

  const handleSelectLanguage = async (code: string) => {
    setLang(code as LangCode);
  };

  const openAnnouncements = async () => {
    setView('announcements');
    if (announcements.length === 0) {
      setAnnLoading(true);
      try {
        const data = await getAnnouncements();
        setAnnouncements(data.announcements || data.data || []);
      } catch {
        setAnnouncements([]);
      } finally {
        setAnnLoading(false);
      }
    }
  };

  const fetchTransactions = async () => {
    setTxLoading(true);
    try {
      const data = await getTransactions();
      setTransactions(data.transactions || data.data || []);
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  };

  const openOrders = async () => {
    setView('orders');
    setTxFilter('all');
    fetchTransactions();
  };

  const fetchTradingOrders = async (page = 1, append = false) => {
    setTradingOrdersLoading(true);
    try {
      const res = await api.get('/trading/orders/my', { params: { limit: 20, offset: (page - 1) * 20 } });
      const list: TradingOrder[] = res.data?.data || [];
      setTradingOrders(prev => append ? [...prev, ...list] : list);
      setTradingOrdersHasMore(list.length === 20);
      setTradingOrdersPage(page);
    } catch {
      if (!append) setTradingOrders([]);
    } finally {
      setTradingOrdersLoading(false);
    }
  };

  const openTradingOrders = () => {
    setView('trading_orders');
    setTradingOrders([]);
    setTradingOrdersPage(1);
    fetchTradingOrders(1);
  };

  const openAgreement = async () => {
    setView('agreement');
    if (!agreementText) {
      setAgreementLoading(true);
      try {
        const res = await api.get('/settings/public/user_agreement');
        setAgreementText(res.data?.value || t('no_agreement'));
      } catch {
        setAgreementText(t('no_agreement'));
      } finally {
        setAgreementLoading(false);
      }
    }
  };

  useEffect(() => {
    // Re-refresh balance when user returns to the page (tab focus / visibility change)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        doRefreshBalance();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also poll every 30 seconds while visible — lightweight GET only, no auth-sync
    const interval = setInterval(() => {
      if (!document.hidden) doRefreshBalance();
    }, 30000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll transactions every 30 seconds while in orders view
  useEffect(() => {
    if (view !== 'orders') return;
    const txInterval = setInterval(() => {
      fetchTransactions();
    }, 30000);
    return () => clearInterval(txInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Poll trading orders every 5 seconds while in trading_orders view (for active orders)
  useEffect(() => {
    if (view !== 'trading_orders') {
      if (tradingOrdersPollRef.current) { clearInterval(tradingOrdersPollRef.current); tradingOrdersPollRef.current = null; }
      return;
    }
    tradingOrdersPollRef.current = setInterval(() => {
      const hasActive = tradingOrders.some(o => o.status === 'active' || o.status === 'pending');
      // Only auto-refresh page 1 when there are active orders to avoid disrupting manual pagination
      if (hasActive && tradingOrdersPage === 1) fetchTradingOrders(1);
    }, 5000);
    return () => { if (tradingOrdersPollRef.current) clearInterval(tradingOrdersPollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tradingOrders]);

  // Show loading while App-level auth has not yet completed
  if (!authSyncDone || authStatus === 'pending') {
    return <div style={{ color: '#aaa', textAlign: 'center', padding: '40px' }}>{t('loading')}</div>;
  }

  // Auth failed / not a real Telegram session — don't show an error, just render nothing
  // (App.tsx already shows the "expired" screen when authStatus === 'expired')
  if (authStatus === 'error' || authStatus === 'expired') {
    return null;
  }

  // Auth succeeded but profile is still null — real backend problem, allow retry
  if (!profile) {
    return (
      <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '16px', marginBottom: '16px' }}>
          {t('profile_load_failed')}
        </div>
        <button
              onClick={doRefreshBalance}
              style={{
                backgroundColor: '#F0B90B', color: '#000', border: 'none',
                borderRadius: '8px', padding: '10px 24px', fontSize: '14px',
                fontWeight: '600', cursor: 'pointer',
              }}
            >
              {t('retry')}
        </button>
      </div>
    );
  }

  // Orders sub-page
  if (view === 'orders') {
    const filteredTransactions = transactions.filter(tx => {
      if (txFilter === 'all') return true;
      if (txFilter === 'deposit') return tx.type === 'deposit';
      if (txFilter === 'withdrawal') return tx.type === 'withdrawal';
      if (txFilter === 'transfer') return tx.type === 'transfer_in' || tx.type === 'transfer_out';
      if (txFilter === 'trade') return tx.type === 'trade_win' || tx.type === 'trade_loss' || tx.type === 'trade';
      return !['deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'trade_win', 'trade_loss', 'trade'].includes(tx.type);
    });
    return (
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${theme.border}` }}>
          <button
            onClick={() => setView('main')}
            style={{ background: 'none', border: 'none', color: theme.accent, fontSize: '16px', fontWeight: '700', cursor: 'pointer', padding: 0 }}
          >
            {t('back')}
          </button>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>{t('orders_title')}</h2>
        </div>
        {/* Filter Tabs */}
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          gap: '0',
          borderBottom: `1px solid ${theme.border}`,
          backgroundColor: theme.bgCard,
          scrollbarWidth: 'none',
        }}>
          {TX_FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setTxFilter(tab.key)}
              style={{
                flexShrink: 0,
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                borderBottom: txFilter === tab.key ? `2px solid ${theme.accent}` : '2px solid transparent',
                color: txFilter === tab.key ? theme.accent : theme.textSecondary,
                fontSize: '13px',
                fontWeight: txFilter === tab.key ? '700' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <div style={{ padding: '16px' }}>
          {txLoading ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>
          ) : filteredTransactions.length === 0 ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('no_transactions')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredTransactions.map(tx => {
                const typeInfo = TX_TYPE_LABEL_KEYS[tx.type] || { labelKey: tx.type, icon: '📋' };
                const dateStr = new Date(tx.created_at).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
                  + ' ' + new Date(tx.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                const isNeg = isTxNegative(tx.type, tx.amount);
                const amtColor = isNeg ? '#ef4444' : theme.success;
                const amtStr = `${isNeg ? '-' : '+'}${Math.abs(parseFloat(String(tx.amount))).toFixed(2)} USDT`;
                return (
                  <div key={tx.id} onClick={() => setSelectedTx(tx)} style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '12px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontSize: '20px' }}>{typeInfo.icon}</span>
                      <div>
                        <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{t(typeInfo.labelKey)}</div>
                        <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{dateStr}</div>
                        {tx.status && <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{tx.status}</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: amtColor, fontWeight: '600', fontSize: '14px' }}>{amtStr}</div>
                      <div style={{ color: theme.textSecondary, fontSize: '11px' }}>
                        {tx.balance_after != null ? `${t('balance_label')}: ${parseFloat(String(tx.balance_after)).toFixed(2)} USDT` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Transaction Detail Modal */}
        {selectedTx && (() => {
          const tx = selectedTx;
          const typeInfo = TX_TYPE_LABEL_KEYS[tx.type] || { labelKey: tx.type, icon: '📋' };
          const isNeg = isTxNegative(tx.type, tx.amount);
          const amtColor = isNeg ? '#ef4444' : theme.success;
          const amtStr = `${isNeg ? '-' : '+'}${Math.abs(parseFloat(String(tx.amount))).toFixed(2)} USDT`;
          return (
            <div
              onClick={() => setSelectedTx(null)}
              style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{ backgroundColor: theme.bgCard, borderRadius: '16px 16px 0 0', padding: '20px', width: '100%', maxWidth: '480px', maxHeight: '80vh', overflowY: 'auto' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '22px' }}>{typeInfo.icon}</span>
                    <span style={{ color: theme.text, fontWeight: '700', fontSize: '16px' }}>{t(typeInfo.labelKey)}</span>
                  </div>
                  <button onClick={() => setSelectedTx(null)} style={{ background: 'none', border: 'none', color: theme.textSecondary, fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.textSecondary }}>金额</span>
                    <span style={{ color: amtColor, fontWeight: '700', fontSize: '15px', fontFamily: 'monospace' }}>{amtStr}</span>
                  </div>
                  {tx.balance_after != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.textSecondary }}>余额</span>
                      <span style={{ color: theme.text, fontFamily: 'monospace' }}>{parseFloat(String(tx.balance_after)).toFixed(2)} USDT</span>
                    </div>
                  )}
                  {tx.status && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.textSecondary }}>状态</span>
                      <span style={{ color: theme.text }}>{tx.status}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: theme.textSecondary }}>时间</span>
                    <span style={{ color: theme.text }}>{new Date(tx.created_at).toLocaleString('zh-CN')}</span>
                  </div>
                  {tx.order_id && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ color: theme.textSecondary, flexShrink: 0 }}>订单号</span>
                      <span style={{ color: theme.text, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', textAlign: 'right' }}>{tx.order_id}</span>
                    </div>
                  )}
                  {tx.description && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ color: theme.textSecondary, flexShrink: 0 }}>
                        {tx.type === 'withdrawal' ? '提现地址' : tx.type === 'deposit' ? '交易哈希' : '描述'}
                      </span>
                      <span style={{ color: theme.text, fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', textAlign: 'right' }}>{tx.description}</span>
                    </div>
                  )}
                  {(tx.type === 'trade_win' || tx.type === 'trade_loss') && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.textSecondary }}>方向</span>
                      <span style={{ color: tx.type === 'trade_win' ? theme.success : '#ef4444', fontWeight: '700' }}>
                        {tx.type === 'trade_win' ? 'WIN' : 'LOSS'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // Trading Orders sub-page
  if (view === 'trading_orders') {
    const safeFixed = (v: any, d = 2) => { const n = Number(v); return isNaN(n) ? '0.00' : n.toFixed(d); };
    return (
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${theme.border}` }}>
          <button
            onClick={() => setView('main')}
            style={{ background: 'none', border: 'none', color: theme.accent, fontSize: '16px', fontWeight: '700', cursor: 'pointer', padding: 0 }}
          >
            {t('back')}
          </button>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>📈 交易订单</h2>
        </div>
        <div style={{ padding: '16px' }}>
          {tradingOrdersLoading && tradingOrders.length === 0 ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>
          ) : tradingOrders.length === 0 ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('no_history') || '暂无交易订单'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tradingOrders.map(order => {
                const isActive = order.status === 'active' || order.status === 'pending';
                const isWin = order.result === 'win';
                const isLose = order.result === 'lose';
                const isDraw = order.result === 'draw';
                const isSettled = isWin || isLose || isDraw;

                if (isSettled) {
                  const goldColor = '#F0B90B';
                  const borderColor = isLose ? theme.border : goldColor;
                  const textColor = isLose ? undefined : goldColor;
                  const rawEntryPrice = order.session_open_price != null ? order.session_open_price : order.entry_price;
                  const rawClosePrice = order.session_close_price != null ? order.session_close_price : order.close_price;
                  const entryPrice = rawEntryPrice != null ? Number(rawEntryPrice).toFixed(4) : '--';
                  const closePrice = rawClosePrice != null ? Number(rawClosePrice).toFixed(4) : '--';
                  const periodDisplay = order.period_label ? order.period_label.split('-').pop() ?? order.period_label : '-';

                  let resultLabel: string;
                  if (isWin) {
                    resultLabel = `🎉 ${t('order_win_label')} +${(Number(order.amount) * Number(order.odds)).toFixed(1)} USDT 🎉`;
                  } else if (isDraw) {
                    resultLabel = `${t('order_draw_label')} +${Number(order.amount).toFixed(1)} USDT`;
                  } else {
                    resultLabel = `${t('order_lose_label')} -${Number(order.amount).toFixed(1)} USDT`;
                  }

                  return (
                    <div key={order.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '14px', border: `1px solid ${borderColor}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: order.direction === 'up' ? '#26a69a' : '#ef5350', fontWeight: '600', fontSize: '13px' }}>
                          {order.direction === 'up' ? t('order_up') : t('order_down')}
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
                          {order.display_name ?? order.symbol ?? '--'}
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

                const dateStr = new Date(order.created_at).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
                  + ' ' + new Date(order.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={order.id} style={{
                    backgroundColor: theme.bgCard,
                    borderRadius: '12px', padding: '14px',
                    border: `1px solid ${isActive ? '#f0b90b' : theme.border}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: order.direction === 'up' ? '#26a69a' : '#ef5350', fontWeight: 700, fontSize: '15px' }}>
                          {order.direction === 'up' ? t('order_up') : t('order_down')}
                        </span>
                        {order.display_name && (
                          <span style={{ color: theme.textSecondary, fontSize: '12px' }}>{order.display_name}</span>
                        )}
                      </div>
                      <span style={{
                        fontSize: '12px', fontWeight: 600,
                        color: isActive ? '#f0b90b' : theme.textSecondary,
                      }}>
                        {isActive ? '进行中 🕐' : order.status}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '12px', color: theme.textSecondary }}>
                      <div>金额: <span style={{ color: theme.text }}>{safeFixed(order.amount)} USDT</span></div>
                      <div>赔率: <span style={{ color: theme.text }}>{safeFixed(order.odds)}x</span></div>
                      {order.entry_price != null && (
                        <div>入场价: <span style={{ color: theme.text }}>{safeFixed(order.entry_price, 4)}</span></div>
                      )}
                      {order.close_price != null && (
                        <div>结算价: <span style={{ color: theme.text }}>{safeFixed(order.close_price, 4)}</span></div>
                      )}
                      <div style={{ gridColumn: '1 / -1' }}>下单时间: {dateStr}</div>
                    </div>
                  </div>
                );
              })}
              {tradingOrdersHasMore && (
                <button
                  onClick={() => fetchTradingOrders(tradingOrdersPage + 1, true)}
                  disabled={tradingOrdersLoading}
                  style={{
                    width: '100%', padding: '10px', borderRadius: '8px',
                    border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard,
                    color: theme.text, cursor: 'pointer', fontSize: '13px',
                    opacity: tradingOrdersLoading ? 0.5 : 1,
                  }}
                >
                  {tradingOrdersLoading ? t('loading') : '加载更多'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Agreement sub-page
  if (view === 'agreement') {
    return (
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${theme.border}` }}>
          <button
            onClick={() => setView('main')}
            style={{ background: 'none', border: 'none', color: theme.accent, fontSize: '16px', fontWeight: '700', cursor: 'pointer', padding: 0 }}
          >
            {t('back')}
          </button>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>{t('agreement_title')}</h2>
        </div>
        <div style={{ padding: '16px' }}>
          {agreementLoading ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>
          ) : (
            <div style={{ color: theme.textSecondary, fontSize: '14px', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
              {agreementText}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Announcements sub-page
  if (view === 'announcements') {
    return (
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${theme.border}` }}>
          <button
            onClick={() => setView('main')}
            style={{ background: 'none', border: 'none', color: theme.accent, fontSize: '16px', fontWeight: '700', cursor: 'pointer', padding: 0 }}
          >
            {t('back')}
          </button>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>{t('menu_announcements')}</h2>
        </div>
        <div style={{ padding: '16px' }}>
          {annLoading ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>
          ) : announcements.length === 0 ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('no_announcements')}</div>
          ) : (
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              {announcements.map((ann, idx) => (
                <div
                  key={ann.id}
                  style={{
                    padding: '14px 16px',
                    borderBottom: idx < announcements.length - 1 ? `1px solid ${theme.border}` : 'none',
                  }}
                >
                  <div style={{ color: theme.text, fontSize: '14px', fontWeight: '600', marginBottom: '6px' }}>{ann.title}</div>
                  <div style={{ color: theme.textSecondary, fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{ann.content}</div>
                  <div style={{ color: theme.textSecondary, fontSize: '11px', marginTop: '6px' }}>{new Date(ann.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Language sub-page
  if (view === 'language') {
    return (
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${theme.border}` }}>
          <button
            onClick={() => setView('main')}
            style={{ background: 'none', border: 'none', color: theme.accent, fontSize: '16px', fontWeight: '700', cursor: 'pointer', padding: 0 }}
          >
            {t('back')}
          </button>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>{t('language_settings')}</h2>
        </div>
        <div style={{ padding: '16px' }}>
          {SUPPORTED_LANGUAGES.map(l => (
            <div
              key={l.code}
              onClick={() => { handleSelectLanguage(l.code); setView('main'); }}
              style={{
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '10px',
                border: `1px solid ${lang === l.code ? theme.accent : theme.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: theme.text, fontSize: '15px' }}>{l.label}</span>
              {lang === l.code && (
                <span style={{ color: theme.accent, fontSize: '18px', fontWeight: '700' }}>✓</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Main view
  return (
    <div style={{ padding: '16px', paddingBottom: '80px' }}>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: '20px' }}>{t('profile_title')}</h1>

      {/* User info card */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '16px',
        border: `1px solid ${theme.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            width: '50px', height: '50px', borderRadius: '50%',
            backgroundColor: '#F0B90B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', fontWeight: '700', color: '#000',
          }}>
            {(tgUser?.first_name?.[0] || profile?.first_name?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>
              {tgUser?.first_name || profile?.first_name} {tgUser?.last_name}
            </div>
            {tgUser?.username && (
              <div style={{ color: theme.textSecondary, fontSize: '13px' }}>@{tgUser.username}</div>
            )}
            <div
              onClick={() => {
                const id = profile?.unique_id || (tgUser?.id ? String(tgUser.id) : '');
                if (id) {
                  navigator.clipboard.writeText(id).then(() => {
                    setIdCopied(true);
                    setTimeout(() => setIdCopied(false), 1500);
                  }).catch(() => {
                    setIdCopied(true);
                    setTimeout(() => setIdCopied(false), 1500);
                  });
                }
              }}
              style={{
                color: idCopied ? theme.accent : theme.textSecondary,
                fontSize: '12px',
                fontFamily: 'monospace',
                userSelect: 'none',
                cursor: 'pointer',
              }}
            >
              ID: {profile?.unique_id || (tgUser?.id ? String(tgUser.id) : 'N/A')}
              {idCopied && <span style={{ marginLeft: '6px', color: theme.accent, fontSize: '11px' }}>✓ {t('copied')}</span>}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', paddingTop: '8px', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <div style={{ color: theme.textSecondary, fontSize: '12px' }}>{t('account_balance')}</div>
            <button
              onClick={() => doRefreshBalance()}
              style={{ background: 'none', border: 'none', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
              title="Refresh"
            >
              🔄
            </button>
          </div>
          <div style={{ color: '#F0B90B', fontWeight: '700', fontSize: '24px' }}>
            {parseFloat(String(profile?.wallet_balance ?? 0)).toFixed(2)} <span style={{ fontSize: '14px' }}>USDT</span>
          </div>
        </div>

        {/* NFT & Red Packet balance row */}
        <div style={{ display: 'flex', justifyContent: 'space-around', paddingTop: '12px', marginTop: '8px', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: theme.textSecondary, fontSize: '11px', marginBottom: '2px' }}>💎 NFT</div>
            <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
              {parseFloat(String(profile?.nft_balance || 0)).toFixed(2)} <span style={{ fontSize: '10px' }}>USDT</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: theme.textSecondary, fontSize: '11px', marginBottom: '2px' }}>🧧 {t('red_packet_balance') || '红包余额 (USDT)'}</div>
            <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
              {parseFloat(String(profile?.red_packet_balance ?? 0)).toFixed(2)} <span style={{ fontSize: '10px' }}>USDT</span>
            </div>
          </div>
        </div>

        {/* Reward balance & unlock progress */}
        {(profile?.reward_balance ?? 0) > 0 && (
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ color: theme.textSecondary, fontSize: '11px' }}>🎁 {t('reward_balance') || '奖励余额'}（打码解锁）</span>
              <span style={{ color: '#f59e0b', fontWeight: '600', fontSize: '13px' }}>
                {parseFloat(String(profile.reward_balance)).toFixed(2)} USDT
              </span>
            </div>
            <div style={{ height: '4px', backgroundColor: theme.border, borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${profile?.reward_unlock_progress ?? 0}%`,
                backgroundColor: '#f59e0b',
                borderRadius: '2px',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ color: theme.textSecondary, fontSize: '10px', marginTop: '2px', textAlign: 'right' }}>
              {(profile?.reward_unlock_progress ?? 0).toFixed(1)}% · 需交易 {(profile?.reward_unlock_required ?? 0).toFixed(2)} USDT 解锁
            </div>
          </div>
        )}

        {/* Tip message */}
        {profile?.wallet_tip_message ? (
          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: '12px', textAlign: 'center' }}>
            💡 {profile.wallet_tip_message}
          </div>
        ) : null}
      </div>

      {/* Menu items */}
      {[
        { label: t('menu_orders'), onClick: openOrders },
        { label: t('menu_announcements'), onClick: openAnnouncements },
        { label: t('menu_agreement'), onClick: openAgreement },
      ].map(item => (
        <div
          key={item.label}
          onClick={item.onClick}
          style={{
            backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px',
            marginBottom: '10px', border: `1px solid ${theme.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            cursor: 'pointer',
          }}
        >
          <span style={{ color: theme.text }}>{item.label}</span>
          <span style={{ color: theme.textSecondary }}>›</span>
        </div>
      ))}

      {/* Language setting - navigate to list */}
      <div
        onClick={() => setView('language')}
        style={{
          backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px',
          marginBottom: '10px', border: `1px solid ${theme.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: theme.text }}>{t('language_settings')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: theme.textSecondary, fontSize: '13px' }}>
            {SUPPORTED_LANGUAGES.find(l => l.code === lang)?.label || lang}
          </span>
          <span style={{ color: theme.textSecondary }}>›</span>
        </div>
      </div>
    </div>
  );
};
