import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import { getUserProfile, getTransactions, getAnnouncements, updateLanguage, api } from '../services/api';

interface UserProfile {
  unique_id: string;
  balance: number;
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

const LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
  { code: 'ja', label: '日本語' },
];

const TX_TYPE_LABEL: Record<string, { label: string; icon: string }> = {
  reward: { label: '奖励', icon: '🎁' },
  red_packet: { label: '红包', icon: '🧧' },
  invite: { label: '邀请', icon: '👥' },
  withdrawal: { label: '提现', icon: '💸' },
  deposit: { label: '充值', icon: '💰' },
  trade: { label: '交易', icon: '📈' },
  auction_join: { label: '参与夺宝', icon: '🎁' },
  auction_refund: { label: '夺宝退款', icon: '↩️' },
  auction_redeem: { label: '夺宝兑换', icon: '🏆' },
  product_yield: { label: '定期收益', icon: '💹' },
  product_refund: { label: '本金退回', icon: '✅' },
};

type ProfileView = 'main' | 'orders' | 'agreement';

export const Profile: React.FC = () => {
  const { user: tgUser, initData } = useTelegram();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLang, setSelectedLang] = useState(tgUser?.language_code || 'zh');
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
    setSelectedLang(code);
    if (initData) {
      try {
        await updateLanguage(code, initData);
      } catch {
        // Non-critical
      }
    }
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
        setAgreementText(res.data?.value || '暂无协议内容');
      } catch {
        setAgreementText('暂无协议内容');
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
    return <div style={{ color: '#aaa', textAlign: 'center', padding: '40px' }}>加载中...</div>;
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
            ← 返回
          </button>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>订单详情</h2>
        </div>
        <div style={{ padding: '16px' }}>
          {txLoading ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>加载中...</div>
          ) : transactions.length === 0 ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>暂无交易记录</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {transactions.map(tx => {
                const typeInfo = TX_TYPE_LABEL[tx.type] || { label: tx.type, icon: '📋' };
                const dateStr = new Date(tx.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
                  + ' ' + new Date(tx.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={tx.id} style={{ backgroundColor: theme.bgCard, borderRadius: '10px', padding: '12px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ fontSize: '20px' }}>{typeInfo.icon}</span>
                      <div>
                        <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{typeInfo.label}</div>
                        <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{dateStr}</div>
                        {tx.status && <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{tx.status}</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: tx.amount >= 0 ? theme.success : '#ef4444', fontWeight: '600', fontSize: '14px' }}>
                        {tx.amount >= 0 ? '+' : ''}{parseFloat(String(tx.amount)).toFixed(2)}
                      </div>
                      <div style={{ color: theme.textSecondary, fontSize: '11px' }}>余额: ${parseFloat(String(tx.balance_after)).toFixed(2)}</div>
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
            ← 返回
          </button>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>用户协议</h2>
        </div>
        <div style={{ padding: '16px' }}>
          {agreementLoading ? (
            <div style={{ color: theme.textSecondary, textAlign: 'center', padding: '40px' }}>加载中...</div>
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
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: '20px' }}>👤 个人中心</h1>

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
          <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '4px' }}>账户余额</div>
          <div style={{ color: '#F0B90B', fontWeight: '700', fontSize: '24px' }}>
            ${(profile?.balance || 0).toFixed(2)} <span style={{ fontSize: '14px' }}>USDT</span>
          </div>
        </div>
      </div>

      {/* Menu items */}
      {[
        { label: '💰 订单详情', onClick: openOrders },
        { label: '📢 系统公告', onClick: handleToggleAnnouncements },
        { label: '📄 用户协议', onClick: openAgreement },
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
            ? <div style={{ color: theme.textSecondary, fontSize: '13px', textAlign: 'center', padding: '10px' }}>加载中...</div>
            : announcements.length === 0
              ? <div style={{ color: theme.textSecondary, fontSize: '13px', textAlign: 'center', padding: '10px' }}>暂无公告</div>
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
          <span style={{ color: theme.text }}>🌐 语言设置</span>
          <select
            value={selectedLang}
            onChange={e => handleSelectLanguage(e.target.value)}
            style={{
              padding: '4px 8px', borderRadius: '6px', border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCardHover, color: theme.text, fontSize: '13px', cursor: 'pointer',
            }}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
