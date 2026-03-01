import React, { useEffect, useState } from 'react';
import { theme } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import { getUserProfile } from '../services/api';

interface UserProfile {
  unique_id: string;
  balance: number;
  username?: string;
  first_name?: string;
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

export const Profile: React.FC = () => {
  const { user: tgUser, initData } = useTelegram();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLang, setSelectedLang] = useState(tgUser?.language_code || 'en');
  const [showLangPicker, setShowLangPicker] = useState(false);

  const fetchProfile = async () => {
    try {
      const data = await getUserProfile(initData);
      setProfile(data.user);
    } catch {
      // Fallback to telegram user data
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
    <div style={{ padding: '16px' }}>
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
                onClick={() => { setSelectedLang(lang.code); setShowLangPicker(false); }}
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
