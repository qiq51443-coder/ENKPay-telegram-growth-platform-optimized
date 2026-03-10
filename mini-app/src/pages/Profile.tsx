import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import { getUserProfile, getTransactions, getAnnouncements, api } from '../services/api';
import { useLang } from '../context/LanguageContext';
import { SUPPORTED_LANGUAGES, LangCode } from '../i18n';

interface UserProfile {
  unique_id: string;
  balance: number;
  nft_balance?: number;
  red_packet_balance?: number;
  red_packet_credits?: number;
  account_status?: string;
  wallet_tip_message?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description?: string;
  status?: string;
  created_at: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

const TX_TYPE_LABEL_KEYS: Record<string, { labelKey: string; icon: string }> = {
  reward: { labelKey: 'tx_reward', icon: '🎁' },
  red_packet: { labelKey: 'tx_red_packet', icon: '🧧' },
  invite: { labelKey: 'tx_invite', icon: '👥' },
  withdrawal: { labelKey: 'tx_withdrawal', icon: '💸' },
  deposit: { labelKey: 'tx_deposit', icon: '💰' },
  trade: { labelKey: 'tx_trade', icon: '📈' },
  auction_join: { labelKey: 'tx_auction_join', icon: '🎁' },
  auction_refund: { labelKey: 'tx_auction_refund', icon: '↩️' },
  auction_redeem: { labelKey: 'tx_auction_redeem', icon: '🏆' },
  product_yield: { labelKey: 'tx_product_yield', icon: '💹' },
  product_refund: { labelKey: 'tx_product_refund', icon: '✅' },
};

type ProfileView = 'main' | 'orders' | 'agreement';

export const Profile: React.FC = () => {
  const { user: tgUser, initData } = useTelegram();
  const { lang, setLang, t } = useLang();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ProfileView>('main');
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [annLoading, setAnnLoading] = useState(false);
  const [agreementText, setAgreementText] = useState('');
  const [agreementLoading, setAgreementLoading] = useState(false);

  const fetchProfile = async () => {
    try {
      const data = await getUserProfile(initData);
      setProfile(data.user);
    } catch {
      if (tgUser) {
        setProfile({
          unique_id: 'N/A',
          balance: 0,
          username: tgUser.username,
          first_name: tgUser.first_name,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLanguage = async (code: string) => {
    setLang(code as LangCode);
  };

  const handleToggleAnnouncements = async () => {
    const next = !showAnnouncements;
    setShowAnnouncements(next);
    if (next && announcements.length === 0) {
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

  const openOrders = async () => {
    setView('orders');
    if (transactions.length === 0 && initData) {
      setTxLoading(true);
      try {
        const data = await getTransactions(initData);
        setTransactions(data.transactions || data.data || []);
      } catch {
        setTransactions([]);
      } finally {
        setTxLoading(false);
      }
    }
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
    if (initData) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData]);

  if (loading) {
    return <div style={{ color: '#aaa', textAlign: 'center', padding: '40px' }}>{t('loading')}</div>;
  }

  // Orders sub-page
  if (view === 'orders') {
    return (
      <div style={{ paddingBottom: '80px' }}>
        <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${theme.border}` }}>
          <button
            onClick={() => setView('main')}
            style={{ background: 'none', border: 'none', color: theme.textSecondary, fontSize: '16px', cursor: 'pointer', padding: 0 }}
          >
            {t('back')}
          </button>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>{t('orders_title')}</h2>
        </div>
        <div style={{ padding: '16px' }}>
          {txLoading ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('loading')}</div>
          ) : transactions.length === 0 ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>{t('no_transactions')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {transactions.map(tx => {
                const typeInfo = TX_TYPE_LABEL_KEYS[tx.type] || { labelKey: tx.type, icon: '📋' };
                const dateStr = new Date(tx.created_at).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
                  + ' ' + new Date(tx.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={tx.id} style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '12px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontSize: '20px' }}>{typeInfo.icon}</span>
                      <div>
                        <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{t(typeInfo.labelKey)}</div>
                        <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{dateStr}</div>
                        {tx.status && <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{tx.status}</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: tx.amount >= 0 ? theme.success : '#ef4444', fontWeight: '600', fontSize: '14px' }}>
                        {tx.amount >= 0 ? '+' : ''}{parseFloat(String(tx.amount)).toFixed(2)}
                      </div>
                      <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{t('balance_label')}: ${parseFloat(String(tx.balance_after)).toFixed(2)}</div>
                    </div>
                  </div>
                );
              })}
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
            style={{ background: 'none', border: 'none', color: theme.textSecondary, fontSize: '16px', cursor: 'pointer', padding: 0 }}
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
            <div style={{ color: theme.textSecondary, fontSize: '12px' }}>ID: #{profile?.unique_id || 'N/A'}</div>
          </div>
        </div>

        <div style={{ textAlign: 'center', paddingTop: '8px', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '4px' }}>{t('account_balance')}</div>
          <div style={{ color: '#F0B90B', fontWeight: '700', fontSize: '24px' }}>
            ${parseFloat(String(profile?.balance || 0)).toFixed(2)} <span style={{ fontSize: '14px' }}>USDT</span>
          </div>
        </div>

        {/* NFT & Red Packet balance row */}
        <div style={{ display: 'flex', justifyContent: 'space-around', paddingTop: '12px', marginTop: '8px', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: theme.textSecondary, fontSize: '11px', marginBottom: '2px' }}>💎 NFT</div>
            <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
              ${parseFloat(String(profile?.nft_balance || 0)).toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: theme.textSecondary, fontSize: '11px', marginBottom: '2px' }}>🧧 {t('account_red_packet_credits') || '红包余额'}</div>
            <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
              {parseFloat(String(profile?.red_packet_balance ?? profile?.red_packet_credits ?? 0)).toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: theme.textSecondary, fontSize: '11px', marginBottom: '2px' }}>📊 {t('account_account_status') || '状态'}</div>
            <div style={{ color: profile?.account_status === 'active' ? '#22c55e' : '#f59e0b', fontWeight: '600', fontSize: '13px' }}>
              {profile?.account_status === 'active' ? (t('account_active') || '正常') : (t('account_pending') || '待审')}
            </div>
          </div>
        </div>

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
        { label: t('menu_announcements'), onClick: handleToggleAnnouncements },
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

      {/* Announcements inline */}
      {showAnnouncements && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', marginBottom: '10px', border: `1px solid ${theme.border}` }}>
          {annLoading
            ? <div style={{ color: theme.textSecondary, fontSize: '13px', textAlign: 'center', padding: '10px' }}>{t('loading')}</div>
            : announcements.length === 0
              ? <div style={{ color: theme.textSecondary, fontSize: '13px', textAlign: 'center', padding: '10px' }}>{t('no_announcements')}</div>
              : announcements.map(ann => (
                <div key={ann.id} style={{ padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                  <div style={{ color: theme.text, fontSize: '13px', fontWeight: '600', marginBottom: '2px' }}>{ann.title}</div>
                  <div style={{ color: theme.textSecondary, fontSize: '12px', lineHeight: '1.5' }}>{ann.content}</div>
                  <div style={{ color: theme.textSecondary, fontSize: '11px', marginTop: '4px' }}>{new Date(ann.created_at).toLocaleString('zh-CN')}</div>
                </div>
              ))
          }
        </div>
      )}

      {/* Language setting - inline select */}
      <div style={{
        backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px',
        marginBottom: '10px', border: `1px solid ${theme.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: theme.text }}>{t('language_settings')}</span>
          <select
            value={lang}
            onChange={e => handleSelectLanguage(e.target.value)}
            style={{
              padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCardHover, color: theme.text, fontSize: '13px', cursor: 'pointer',
            }}
          >
            {SUPPORTED_LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
