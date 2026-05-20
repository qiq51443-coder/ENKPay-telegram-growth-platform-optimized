import React, { useEffect, useState, useRef } from 'react';
import { theme } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import { getTransactions, getAnnouncements, api, verifyQRCode, submitTransferWithPassword } from '../services/api';
import { useLang } from '../context/LanguageContext';
import { useUser } from '../context/UserContext';
import { useAuthSync } from '../context/AuthSyncContext';
import { SUPPORTED_LANGUAGES, LangCode } from '../i18n';
import { useMiniAppBg, buildBgStyle } from '../hooks/useMiniAppBg';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after?: number;
  description?: string;
  order_id?: string;
  status?: string;
  created_at: string;
  counterparty_name?: string;
  counterparty_uid?: string;
}

interface Announcement {
  id: string;
  title?: string;
  content?: string;
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

type ProfileView = 'main' | 'orders' | 'trading_orders' | 'agreement' | 'announcements' | 'language' | 'scan_confirm_recipient' | 'scan_enter_amount' | 'scan_confirm_transfer' | 'scan_enter_password' | 'scan_result';

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
  const bgUrl = useMiniAppBg('profile');
  const { user: contextUser, refreshBalance } = useUser();
  const { authSyncDone, authStatus } = useAuthSync();
  const [view, setView] = useState<ProfileView>('main');
  const [txFilter, setTxFilter] = useState<string>('all');
  const [idCopied, setIdCopied] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedTradingOrder, setSelectedTradingOrder] = useState<TradingOrder | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [annLoading, setAnnLoading] = useState(false);
  const [agreementText, setAgreementText] = useState('');
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [tradingOrders, setTradingOrders] = useState<TradingOrder[]>([]);
  const [allTradingOrders, setAllTradingOrders] = useState<TradingOrder[]>([]);
  const [tradingOrdersLoading, setTradingOrdersLoading] = useState(false);
  const [tradingOrdersPage, setTradingOrdersPage] = useState(1);
  const [tradingOrdersHasMore, setTradingOrdersHasMore] = useState(false);
  const tradingOrdersPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scan QR payment flow state
  const [scanRecipient, setScanRecipient] = useState<{uid: string; name: string; unique_id: string} | null>(null);
  const [scanAmount, setScanAmount] = useState('');
  const [scanAmountError, setScanAmountError] = useState('');
  const [scanPassword, setScanPassword] = useState('');
  const [scanPasswordError, setScanPasswordError] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<any | null>(null);
  const pageBgStyle = buildBgStyle(bgUrl);

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

  const fetchAllTradingOrdersForMatch = async () => {
    try {
      const res = await api.get('/trading/orders/my', { params: { limit: 200, offset: 0 } });
      const list: TradingOrder[] = res.data?.data || [];
      setAllTradingOrders(list);
    } catch {
      setAllTradingOrders([]);
    }
  };

  const openOrders = async () => {
    setView('orders');
    setTxFilter('all');
    fetchTransactions();
    fetchAllTradingOrdersForMatch();  // 用于 trade_win/trade_loss 匹配
    fetchTradingOrders(1);            // 用于 trading_orders 子页面
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
    setAgreementLoading(true);
    setAgreementText('');
    try {
      const res = await api.get('/miniapp/user-agreement', { params: { lang } });
      // Backend returns `text` field; `value` is kept as a fallback for the legacy endpoint shape
      const raw = res.data?.text || res.data?.value || '';
      let content = raw;
      if (typeof raw === 'string' && raw.startsWith('"') && raw.endsWith('"')) {
        try { content = JSON.parse(raw); } catch { /* keep as-is */ }
      }
      setAgreementText(content || t('no_agreement'));
    } catch {
      setAgreementText(t('no_agreement'));
    } finally {
      setAgreementLoading(false);
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
    return <div style={{ ...pageBgStyle, color: '#aaa', textAlign: 'center', padding: '40px' }}>{t('loading')}</div>;
  }

  // Auth failed / not a real Telegram session — don't show an error, just render nothing
  // (App.tsx already shows the "expired" screen when authStatus === 'expired')
  if (authStatus === 'error' || authStatus === 'expired') {
    return null;
  }

  // Auth succeeded but profile is still null — real backend problem, allow retry
  if (!profile) {
    return (
      <div style={{ ...pageBgStyle, color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>
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
    return (
      <div style={{ ...pageBgStyle, paddingBottom: '80px' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${theme.border}` }}>
          <button
            onClick={() => setView('main')}
            style={{ background: 'none', border: 'none', color: theme.accent, fontSize: '16px', fontWeight: '700', cursor: 'pointer', padding: 0 }}
          >
            {t('back')}
          </button>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>{t('orders_title')}</h2>
        </div>
        <div style={{ padding: '16px' }}>
          <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>暂无数据</div>
        </div>
      </div>
    );
  }

  // Trading Orders sub-page
  if (view === 'trading_orders') {
    return (
      <div style={{ ...pageBgStyle, paddingBottom: '80px' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${theme.border}` }}>
          <button
            onClick={() => setView('main')}
            style={{ background: 'none', border: 'none', color: theme.accent, fontSize: '16px', fontWeight: '700', cursor: 'pointer', padding: 0 }}
          >
            {t('back')}
          </button>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>{t('trading_orders_title')}</h2>
        </div>
        <div style={{ padding: '16px' }}>
          <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>暂无数据</div>
        </div>
      </div>
    );
  }

  // Agreement sub-page
  if (view === 'agreement') {
    return (
      <div style={{ ...pageBgStyle, paddingBottom: '80px' }}>
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
      <div style={{ ...pageBgStyle, paddingBottom: '80px' }}>
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
      <div style={{ ...pageBgStyle, paddingBottom: '80px' }}>
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

  // ─── Scan QR flow handlers ────────────────────────────────────────────────

  const handleScanQR = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.showScanQrPopup) {
      alert(t('scan_not_available'));
      return;
    }
    tg.showScanQrPopup({ text: t('scan_qr_hint') }, async (data: string) => {
      tg.closeScanQrPopup();
      if (!data) return;
      setScanLoading(true);
      try {
        const result = await verifyQRCode(data);
        if (!result.valid) {
          if (result.expired) {
            alert(t('scan_qr_expired'));
          } else {
            alert(t('scan_qr_invalid'));
          }
          return;
        }
        const u = result.user;
        setScanRecipient({ uid: u.unique_id || u.uid, name: u.first_name || u.username || u.uid, unique_id: u.unique_id || u.uid });
        setScanAmount('');
        setScanAmountError('');
        setScanPassword('');
        setScanPasswordError('');
        setScanResult(null);
        setView('scan_confirm_recipient');
      } catch {
        alert(t('scan_qr_invalid'));
      } finally {
        setScanLoading(false);
      }
    });
  };

  const handleScanConfirmAmount = () => {
    const amt = parseFloat(scanAmount);
    const balance = parseFloat(String(profile?.wallet_balance || '0'));
    if (!scanAmount || isNaN(amt) || amt <= 0) {
      setScanAmountError(t('scan_amount_invalid'));
      return;
    }
    if (amt > balance) {
      setScanAmountError(t('scan_balance_insufficient').replace('{balance}', balance.toFixed(2)));
      return;
    }
    setScanAmountError('');
    setView('scan_confirm_transfer');
  };

  const handleScanSubmitTransfer = async () => {
    if (!scanPassword || scanPassword.length < 4) {
      setScanPasswordError(t('scan_password_invalid'));
      return;
    }
    if (!scanRecipient) return;
    setScanPasswordError('');
    setScanLoading(true);
    try {
      const result = await submitTransferWithPassword({
        to_identifier: scanRecipient.unique_id,
        amount: parseFloat(scanAmount),
        password: scanPassword,
        transfer_type: 'scan_transfer',
      });
      setScanResult(result);
      setView('scan_result');
      // Refresh balance after successful transfer
      refreshBalance().catch(() => {});
    } catch (err: any) {
      const msg = err?.response?.data?.error || t('scan_transfer_failed');
      setScanPasswordError(msg);
    } finally {
      setScanLoading(false);
    }
  };

  if (view === 'scan_confirm_recipient' && scanRecipient) {
    return (
      <div style={{ ...pageBgStyle, padding: '16px' }}>
        <div onClick={() => setView('main')} style={{ color: theme.accent, cursor: 'pointer', marginBottom: '16px' }}>
          {t('back')}
        </div>
        <h2 style={{ color: theme.text, marginBottom: '16px' }}>{t('scan_qr_confirm_title')}</h2>
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', marginBottom: '16px', border: `1px solid ${theme.border}` }}>
          <div style={{ color: theme.accent, marginBottom: '8px', fontSize: '13px' }}>{t('scan_qr_verified')}</div>
          <div style={{ color: theme.text, fontSize: '18px', fontWeight: '600' }}>{scanRecipient.name}</div>
          <div style={{ color: theme.textSecondary, fontSize: '13px' }}>ID: {scanRecipient.unique_id}</div>
        </div>
        <button
          onClick={() => setView('scan_enter_amount')}
          style={{ width: '100%', padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer' }}
        >
          {t('confirm')}
        </button>
        <button
          onClick={() => setView('main')}
          style={{ width: '100%', padding: '14px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '10px', fontSize: '16px', cursor: 'pointer', marginTop: '10px' }}
        >
          {t('cancel')}
        </button>
      </div>
    );
  }

  if (view === 'scan_enter_amount' && scanRecipient) {
    const balance = parseFloat(String(profile?.wallet_balance || '0'));
    const amt = parseFloat(scanAmount) || 0;
    return (
      <div style={{ ...pageBgStyle, padding: '16px' }}>
        <div onClick={() => setView('scan_confirm_recipient')} style={{ color: theme.accent, cursor: 'pointer', marginBottom: '16px' }}>
          {t('back')}
        </div>
        <h2 style={{ color: theme.text, marginBottom: '8px' }}>{t('scan_enter_amount')}</h2>
        <div style={{ color: theme.textSecondary, fontSize: '13px', marginBottom: '16px' }}>
          {t('scan_amount_hint').replace('{balance}', balance.toFixed(2))}
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          value={scanAmount}
          onChange={e => { setScanAmount(e.target.value); setScanAmountError(''); }}
          placeholder="0.00"
          style={{ width: '100%', padding: '14px', fontSize: '20px', backgroundColor: theme.bgCard, color: theme.text, border: `1px solid ${scanAmountError ? '#ff4d4f' : theme.border}`, borderRadius: '10px', outline: 'none', boxSizing: 'border-box' }}
        />
        {scanAmountError && <div style={{ color: '#ff4d4f', fontSize: '13px', marginTop: '6px' }}>{scanAmountError}</div>}
        {amt > 0 && (
          <div style={{ color: theme.textSecondary, fontSize: '12px', marginTop: '8px' }}>
            {t('scan_fee_hint')}
          </div>
        )}
        <button
          onClick={handleScanConfirmAmount}
          style={{ width: '100%', padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', marginTop: '16px' }}
        >
          {t('confirm')}
        </button>
      </div>
    );
  }

  if (view === 'scan_confirm_transfer' && scanRecipient) {
    const amt = parseFloat(scanAmount);
    const fee = (0).toFixed(4); // Fee is 0 for scan transfer
    const actual = amt.toFixed(2);
    const total = amt.toFixed(4); // Total cost equals amount (no fee)
    return (
      <div style={{ ...pageBgStyle, padding: '16px' }}>
        <div onClick={() => setView('scan_enter_amount')} style={{ color: theme.accent, cursor: 'pointer', marginBottom: '16px' }}>
          {t('back')}
        </div>
        <h2 style={{ color: theme.text, marginBottom: '16px' }}>{t('scan_confirm_title')}</h2>
        {[
          [t('scan_confirm_to'), scanRecipient.name],
          [t('scan_confirm_amount'), `${amt.toFixed(2)} USDT`],
          [t('scan_confirm_fee'), `${fee} USDT`],
          [t('scan_confirm_actual'), `${actual} USDT`],
        ].map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${theme.border}` }}>
            <span style={{ color: theme.textSecondary }}>{label}</span>
            <span style={{ color: theme.text, fontWeight: '500' }}>{value}</span>
          </div>
        ))}
        <button
          onClick={() => setView('scan_enter_password')}
          style={{ width: '100%', padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', marginTop: '20px' }}
        >
          {t('confirm')}
        </button>
        <button
          onClick={() => setView('main')}
          style={{ width: '100%', padding: '14px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '10px', fontSize: '16px', cursor: 'pointer', marginTop: '10px' }}
        >
          {t('cancel')}
        </button>
      </div>
    );
  }

  if (view === 'scan_enter_password') {
    return (
      <div style={{ ...pageBgStyle, padding: '16px' }}>
        <div onClick={() => setView('scan_confirm_transfer')} style={{ color: theme.accent, cursor: 'pointer', marginBottom: '16px' }}>
          {t('back')}
        </div>
        <h2 style={{ color: theme.text, marginBottom: '8px' }}>{t('scan_enter_password')}</h2>
        <div style={{ color: theme.textSecondary, fontSize: '13px', marginBottom: '16px' }}>{t('scan_password_hint')}</div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={scanPassword}
          onChange={e => { setScanPassword(e.target.value); setScanPasswordError(''); }}
          placeholder="••••••"
          style={{ width: '100%', padding: '14px', fontSize: '20px', letterSpacing: '8px', backgroundColor: theme.bgCard, color: theme.text, border: `1px solid ${scanPasswordError ? '#ff4d4f' : theme.border}`, borderRadius: '10px', outline: 'none', boxSizing: 'border-box' }}
        />
        {scanPasswordError && <div style={{ color: '#ff4d4f', fontSize: '13px', marginTop: '6px' }}>{scanPasswordError}</div>}
        <button
          onClick={handleScanSubmitTransfer}
          disabled={scanLoading}
          style={{ width: '100%', padding: '14px', backgroundColor: scanLoading ? theme.border : theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: scanLoading ? 'not-allowed' : 'pointer', marginTop: '16px' }}
        >
          {scanLoading ? t('scan_submitting') : t('confirm')}
        </button>
      </div>
    );
  }

  if (view === 'scan_result' && scanResult) {
    const data = scanResult.data || scanResult;
    const balance = parseFloat(String(profile?.wallet_balance || '0'));
    return (
      <div style={{ ...pageBgStyle, padding: '16px', textAlign: 'center' }}>
        <h2 style={{ color: theme.accent, marginBottom: '16px', fontSize: '22px' }}>{t('scan_success_title')}</h2>
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', marginBottom: '20px', border: `1px solid ${theme.border}`, textAlign: 'left' }}>
          {[
            [t('scan_order_id'), data.order_id || '—'],
            [t('scan_transfer_to'), scanRecipient?.name || '—'],
            [t('scan_transfer_amount'), `${parseFloat(data.amount || scanAmount).toFixed(2)} USDT`],
            [t('scan_transfer_fee'), `${parseFloat(data.fee || '0').toFixed(4)} USDT`],
            [t('scan_transfer_actual'), `${parseFloat(data.actual_received || scanAmount).toFixed(2)} USDT`],
            [t('scan_current_balance'), `${balance.toFixed(2)} USDT`],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${theme.border}` }}>
              <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{label}</span>
              <span style={{ color: theme.text, fontWeight: '500', fontSize: '13px' }}>{value}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            setScanRecipient(null); setScanAmount(''); setScanPassword(''); setScanResult(null);
            setView('main');
          }}
          style={{ width: '100%', padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', cursor: 'pointer', marginBottom: '10px' }}
        >
          {t('scan_back_home')}
        </button>
        <button
          onClick={() => {
            setScanAmount(''); setScanPassword(''); setScanResult(null);
            setView('scan_confirm_recipient');
          }}
          style={{ width: '100%', padding: '14px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '10px', fontSize: '16px', cursor: 'pointer' }}
        >
          {t('scan_transfer_again')}
        </button>
      </div>
    );
  }

  // Main view
  return (
    <div style={{ ...pageBgStyle, padding: '16px', paddingBottom: '80px' }}>
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

      </div>

      {/* Scan to Pay button */}
      <div
        onClick={handleScanQR}
        style={{
          backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px',
          marginBottom: '10px', border: `1px solid ${theme.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: scanLoading ? 'not-allowed' : 'pointer',
          opacity: scanLoading ? 0.7 : 1,
        }}
      >
        <span style={{ color: theme.text }}>{t('scan_to_pay')}</span>
        <span style={{ color: theme.textSecondary }}>›</span>
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
