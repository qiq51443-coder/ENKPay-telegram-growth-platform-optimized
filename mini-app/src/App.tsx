import { useState, useEffect, useRef } from 'react';
import { LoadingScreen } from './components/LoadingScreen';
import { BottomNav } from './components/BottomNav';
import { AnnouncementModal } from './components/AnnouncementModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Trading } from './pages/Trading';
import { Auction } from './pages/Auction';
import { Products } from './pages/Products';
import { Charity } from './pages/Charity';
import { Profile } from './pages/Profile';
import { useTelegram } from './hooks/useTelegram';
import { theme } from './theme';
import { getAnnouncements, setInitData as setApiInitData, authSync } from './services/api';
import { LanguageProvider, useLang } from './context/LanguageContext';
import { AuthSyncContext } from './context/AuthSyncContext';
import { UserProvider, useUser } from './context/UserContext';

type TabKey = 'trading' | 'auction' | 'products' | 'charity' | 'profile';

interface Announcement {
  id: string;
  title: string;
  content: string;
  images?: string[];
}

function AppContent() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('trading');
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [authSyncDone, setAuthSyncDone] = useState(false);
  const [authError, setAuthError] = useState(false);
  const authAttemptedRef = useRef(false);

  const { tg, initData, sdkReady } = useTelegram();
  const { lang } = useLang();
  const { setUser } = useUser();

  // Auth sync: once initData is available, call authSync once
  useEffect(() => {
    if (authAttemptedRef.current) return;

    // Not ready yet — SDK still loading (null = polling in progress)
    if (sdkReady === null) return;

    // SDK loaded but no initData means not opened from Telegram (sdkReady === false)
    if (sdkReady === false && !initData) {
      setAuthError(true);
      setAuthSyncDone(true);
      return;
    }

    if (!initData) return;

    authAttemptedRef.current = true;
    setApiInitData(initData);

    authSync(initData)
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
        }
      })
      .catch((err) => {
        console.warn('[App] auth-sync failed:', String(err));
        // Non-fatal: user data will be null but app can still show public content
      })
      .finally(() => {
        setAuthSyncDone(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, sdkReady]);

  // After 10 seconds without initData, show error
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!initData && !authAttemptedRef.current) {
        setAuthError(true);
        setAuthSyncDone(true);
      }
    }, 10000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData]);

  // Loading progress animation
  useEffect(() => {
    tg?.expand();
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setLoading(false);
            getAnnouncements(true)
              .then(data => {
                const list: Announcement[] = data?.announcements || data?.data || [];
                if (list.length > 0) setAnnouncement(list[0]);
              })
              .catch(() => {/* non-critical */});
          }, 200);
          return 100;
        }
        return prev + 10;
      });
    }, 80);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <LoadingScreen progress={progress} />;
  }

  if (authError) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: theme.bgPrimary,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px', gap: '20px',
      }}>
        <div style={{ fontSize: '48px', textAlign: 'center' }}>⚠️</div>
        <div style={{ color: theme.text, fontSize: '16px', textAlign: 'center', lineHeight: '1.6' }}>
          无法连接到 Telegram<br />
          <span style={{ fontSize: '13px', opacity: 0.7 }}>
            请关闭此页面，从 Telegram 重新点击「打开应用」按钮
          </span>
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            backgroundColor: '#F0B90B', color: '#000', border: 'none',
            borderRadius: '8px', padding: '12px 32px',
            fontSize: '15px', fontWeight: '600', cursor: 'pointer',
          }}
        >
          重试
        </button>
        <button
          onClick={() => {
            try { window.Telegram?.WebApp?.close(); } catch { /* non-critical */ }
          }}
          style={{
            backgroundColor: 'transparent', color: theme.text, border: `1px solid ${theme.text}`,
            borderRadius: '8px', padding: '10px 24px',
            fontSize: '14px', fontWeight: '500', cursor: 'pointer', opacity: 0.7,
          }}
        >
          关闭
        </button>
      </div>
    );
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'trading': return <ErrorBoundary><Trading /></ErrorBoundary>;
      case 'auction': return <ErrorBoundary><Auction /></ErrorBoundary>;
      case 'products': return <ErrorBoundary><Products /></ErrorBoundary>;
      case 'charity': return <ErrorBoundary><Charity /></ErrorBoundary>;
      case 'profile': return <ErrorBoundary><Profile /></ErrorBoundary>;
      default: return <ErrorBoundary><Trading /></ErrorBoundary>;
    }
  };

  return (
    <AuthSyncContext.Provider value={{ authSyncDone }}>
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        style={{ minHeight: '100vh', backgroundColor: theme.bgPrimary, paddingBottom: '60px' }}
      >
        {announcement && (
          <AnnouncementModal
            title={announcement.title}
            content={announcement.content}
            images={announcement.images}
            onClose={() => setAnnouncement(null)}
          />
        )}
        {renderPage()}
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </AuthSyncContext.Provider>
  );
}

function App() {
  return (
    <LanguageProvider>
      <UserProvider>
        <AppContent />
      </UserProvider>
    </LanguageProvider>
  );
}

export default App;
