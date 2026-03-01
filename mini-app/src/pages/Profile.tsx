import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import { getUserProfile, getTransactions, getAnnouncements, updateLanguage } from '../services/api';

interface UserProfile {
  unique_id: string;
  balance: number;
  username?: string;
  first_name?: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description?: string;
  created_at: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
  { code: 'ja', label: '日本語' },
];

const TX_TYPE_LABEL: Record<string, string> = {
  reward: '奖励',
  red_packet: '红包',
  invite: '邀请',
  withdrawal: '提现',
  deposit: '充值',
  trade: '交易',
  auction_join: '参与竞拍',
  auction_refund: '竞拍退款',
  auction_redeem: '竞拍兑换',
};

export const Profile: React.FC = () => {
  const { user: tgUser, initData } = useTelegram();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLang, setSelectedLang] = useState(tgUser?.language_code || 'en');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [annLoading, setAnnLoading] = useState(false);

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

  const handleToggleTransactions = async () => {
    const next = !showTransactions;
    setShowTransactions(next);
    if (next && transactions.length === 0 && initData) {
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

  const handleSelectLanguage = async (code: string) => {
    setSelectedLang(code);
    setShowLangPicker(false);
    if (initData) {
      try {
        await updateLanguage(code, initData);
      } catch {
        // Non-critical: language preference saved locally anyway
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
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            backgroundColor: theme.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
          }}>
            {tgUser?.first_name?.[0] || '?'}
          </div>
          <div>
            <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>
              {tgUser?.first_name} {tgUser?.last_name}
            </div>
            {tgUser?.username && (
              <div style={{ color: theme.textSecondary, fontSize: '13px' }}>@{tgUser.username}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '4px' }}>唯一ID</div>
            <div style={{ color: theme.accent, fontWeight: '600' }}>{profile?.unique_id || 'N/A'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '4px' }}>账户余额</div>
            <div style={{ color: theme.success, fontWeight: '600', fontSize: '18px' }}>
              ${(profile?.balance || 0).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction details */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', marginBottom: '12px', border: `1px solid ${theme.border}` }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={handleToggleTransactions}
        >
          <div style={{ color: theme.text }}>💰 交易明细</div>
          <div style={{ color: theme.textSecondary }}>{showTransactions ? '∧' : '›'}</div>
        </div>
        {showTransactions && (
          <div style={{ marginTop: '12px' }}>
            {txLoading
              ? <div style={{ color: theme.textSecondary, fontSize: '13px', textAlign: 'center', padding: '10px' }}>加载中...</div>
              : transactions.length === 0
                ? <div style={{ color: theme.textSecondary, fontSize: '13px', textAlign: 'center', padding: '10px' }}>暂无交易记录</div>
                : transactions.map(tx => (
                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <div>
                      <div style={{ color: theme.text, fontSize: '13px' }}>{TX_TYPE_LABEL[tx.type] || tx.type}</div>
                      <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{tx.description || ''}</div>
                      <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{new Date(tx.created_at).toLocaleString('zh-CN')}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: tx.amount >= 0 ? theme.success : '#ef4444', fontWeight: '600', fontSize: '14px' }}>
                        {tx.amount >= 0 ? '+' : ''}{parseFloat(String(tx.amount)).toFixed(2)}
                      </div>
                      <div style={{ color: theme.textSecondary, fontSize: '11px' }}>余额: ${parseFloat(String(tx.balance_after)).toFixed(2)}</div>
                    </div>
                  </div>
                ))
            }
          </div>
        )}
      </div>

      {/* Announcements */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '16px', marginBottom: '12px', border: `1px solid ${theme.border}` }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={handleToggleAnnouncements}
        >
          <div style={{ color: theme.text }}>📢 公告</div>
          <div style={{ color: theme.textSecondary }}>{showAnnouncements ? '∧' : '›'}</div>
        </div>
        {showAnnouncements && (
          <div style={{ marginTop: '12px' }}>
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
      </div>

      {/* Language picker */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        border: `1px solid ${theme.border}`,
      }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => setShowLangPicker(!showLangPicker)}
        >
          <div style={{ color: theme.text }}>🌐 语言切换</div>
          <div style={{ color: theme.textSecondary }}>
            {LANGUAGES.find(l => l.code === selectedLang)?.label || 'English'} ›
          </div>
        </div>
        {showLangPicker && (
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => handleSelectLanguage(lang.code)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${selectedLang === lang.code ? theme.accent : theme.border}`,
                  backgroundColor: selectedLang === lang.code ? theme.accent : 'transparent',
                  color: theme.text,
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                {lang.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User agreement */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        padding: '16px',
        border: `1px solid ${theme.border}`,
      }}>
        <div style={{ color: theme.text, cursor: 'pointer' }}>
          📄 用户协议 ›
        </div>
      </div>
    </div>
  );
};
