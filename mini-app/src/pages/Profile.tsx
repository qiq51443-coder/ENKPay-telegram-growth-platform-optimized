import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import { getUserProfile, getTransactions, getAnnouncements, updateLanguage } from '../services/api';

interface UserProfile {
  id: string;
  unique_id: string;
  balance: number;
  username?: string;
  first_name?: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after?: number;
  description?: string;
  created_at: string;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
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

const txTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    deposit: '充值', withdrawal: '提现', trade: '交易',
    red_packet: '红包', auction: '竞拍', refund: '退款',
    transfer: '转账', adjust: '调整',
  };
  return map[type] || type;
};

export const Profile: React.FC = () => {
  const { user: tgUser, initData } = useTelegram();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLang, setSelectedLang] = useState(tgUser?.language_code || 'en');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annLoading, setAnnLoading] = useState(false);

  const fetchProfile = async () => {
    try {
      const data = await getUserProfile(initData);
      setProfile(data.user);
    } catch {
      if (tgUser) {
        setProfile({ id: '', unique_id: 'N/A', balance: 0, username: tgUser.username, first_name: tgUser.first_name });
      }
    } finally {
      setLoading(false);
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

  const handleToggleTransactions = async () => {
    if (!showTransactions && transactions.length === 0 && profile?.id) {
      setTxLoading(true);
      try {
        const data = await getTransactions(profile.id);
        setTransactions(data.data || data.transactions || []);
      } catch { setTransactions([]); }
      finally { setTxLoading(false); }
    }
    setShowTransactions(v => !v);
  };

  const handleToggleAnnouncements = async () => {
    if (!showAnnouncements && announcements.length === 0) {
      setAnnLoading(true);
      try {
        const data = await getAnnouncements();
        setAnnouncements(data.data || []);
      } catch { setAnnouncements([]); }
      finally { setAnnLoading(false); }
    }
    setShowAnnouncements(v => !v);
  };

  const handleSelectLang = async (code: string) => {
    setSelectedLang(code);
    setShowLangPicker(false);
    if (profile?.id) {
      try { await updateLanguage(profile.id, code); } catch { /* silent */ }
    }
  };

  if (loading) {
    return <div style={{ color: '#aaa', textAlign: 'center', padding: '40px' }}>加载中...</div>;
  }

  const menuItemStyle: React.CSSProperties = {
    backgroundColor: theme.bgCard,
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    border: `1px solid ${theme.border}`,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
  };

  return (
    <div style={{ padding: '16px' }}>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: '20px' }}>👤 个人中心</h1>

      {/* User info card */}
      <div style={{ ...menuItemStyle, marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
            {tgUser?.first_name?.[0] || '?'}
          </div>
          <div>
            <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>
              {tgUser?.first_name} {tgUser?.last_name}
            </div>
            {tgUser?.username && <div style={{ color: theme.textSecondary, fontSize: '13px' }}>@{tgUser.username}</div>}
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

      {/* Transactions */}
      <div style={menuItemStyle}>
        <div style={rowStyle} onClick={handleToggleTransactions}>
          <div style={{ color: theme.text }}>💰 交易明细</div>
          <div style={{ color: theme.textSecondary }}>{showTransactions ? '▲' : '▼'}</div>
        </div>
        {showTransactions && (
          <div style={{ marginTop: '12px' }}>
            {txLoading ? (
              <div style={{ color: theme.textSecondary, fontSize: '13px' }}>加载中...</div>
            ) : transactions.length === 0 ? (
              <div style={{ color: theme.textSecondary, fontSize: '13px' }}>暂无记录</div>
            ) : (
              transactions.slice(0, 20).map(tx => (
                <div key={tx.id} style={{ borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{txTypeLabel(tx.type)}</span>
                    <span style={{ color: Number(tx.amount) >= 0 ? theme.success : '#E74C3C', fontSize: '13px', fontWeight: '600' }}>
                      {Number(tx.amount) >= 0 ? '+' : ''}{Number(tx.amount).toFixed(2)} USDT
                    </span>
                  </div>
                  {tx.description && <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{tx.description}</div>}
                  <div style={{ color: theme.textSecondary, fontSize: '11px' }}>{new Date(tx.created_at).toLocaleString('zh-CN')}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Announcements */}
      <div style={menuItemStyle}>
        <div style={rowStyle} onClick={handleToggleAnnouncements}>
          <div style={{ color: theme.text }}>📢 公告</div>
          <div style={{ color: theme.textSecondary }}>{showAnnouncements ? '▲' : '▼'}</div>
        </div>
        {showAnnouncements && (
          <div style={{ marginTop: '12px' }}>
            {annLoading ? (
              <div style={{ color: theme.textSecondary, fontSize: '13px' }}>加载中...</div>
            ) : announcements.length === 0 ? (
              <div style={{ color: theme.textSecondary, fontSize: '13px' }}>暂无公告</div>
            ) : (
              announcements.map(ann => (
                <div key={ann.id} style={{ borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px', marginBottom: '8px' }}>
                  <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>{ann.title}</div>
                  <div style={{ color: theme.textSecondary, fontSize: '12px' }}>{ann.content}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Language picker */}
      <div style={menuItemStyle}>
        <div style={rowStyle} onClick={() => setShowLangPicker(!showLangPicker)}>
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
                onClick={() => handleSelectLang(lang.code)}
                style={{
                  padding: '6px 12px', borderRadius: '6px',
                  border: `1px solid ${selectedLang === lang.code ? theme.accent : theme.border}`,
                  backgroundColor: selectedLang === lang.code ? theme.accent : 'transparent',
                  color: theme.text, cursor: 'pointer', fontSize: '13px',
                }}
              >
                {lang.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User agreement */}
      <div style={{ ...menuItemStyle, marginBottom: 0 }}>
        <div style={{ color: theme.text, cursor: 'pointer' }}>
          📄 用户协议 ›
        </div>
      </div>
    </div>
  );
};
