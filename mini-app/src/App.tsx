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
import {
  getAnnouncements,
  setInitData as setApiInitData,
  authSync,
} from './services/api';
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
  // authStatus: 'pending' | 'ok' | 'error'
  const [authStatus, setAuthStatus] = useState<'pending' | 'ok' | 'error'>('pending');

  // Prevent duplicate auth attempts (guard against React StrictMode double-invoke)
  const initDataAttemptedRef = useRef(false);

  const { tg, initData, sdkReady } = useTelegram();
  const { lang } = useLang();
  const { setUser } = useUser();

  // ── Loading progress animation: 0 → 90 % (then waits for authSyncDone) ─────
  useEffect(() => {
    if (tg) {
      try { tg.expand(); } catch { /* non-critical */ }
    }
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90; // Hold at 90 % — wait for auth to finish
        }
        return prev + 10;
      });
    }, 80);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Complete loading once auth finishes ────────────────────────────────────
  useEffect(() => {
    if (!authSyncDone) return;
    setProgress(100);
    const timer = setTimeout(() => {
      setLoading(false);
      getAnnouncements(true)
        .then(data => {
          const list: Announcement[] = data?.announcements || data?.data || [];
          if (list.length > 0) setAnnouncement(list[0]);
        })
        .catch(() => {/* non-critical */});
    }, 200);
    return () => clearTimeout(timer);
  }, [authSyncDone]);

  // ── 12 s timeout safety net (force-close loading if auth never settles) ────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn('[App] Auth timeout after 12 s — force-closing loading screen');
        setAuthStatus('error');
        setAuthSyncDone(true);
      }
    }, 12000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Main auth path: Telegram SDK / initData ────────────────────────────────
  useEffect(() => {
    if (initDataAttemptedRef.current) return;
    if (sdkReady === null) return; // Still polling — wait

    initDataAttemptedRef.current = true;

    if (sdkReady === false) {
      console.warn('[App] Telegram SDK unavailable — cannot authenticate');
      setAuthStatus('error');
      setAuthSyncDone(true);
      return;
    }

    if (!initData) {
      console.warn('[App] SDK ready but initData is empty — non-WebApp context?');
      setAuthStatus('error');
      setAuthSyncDone(true);
      return;
    }

    setApiInitData(initData);

    authSync(initData)
      .then((data) => {
        if (data?.user) setUser(data.user);
        setAuthStatus('ok');
      })
      .catch((err) => {
        console.error('[App] authSync failed:', err?.message || String(err));
        setAuthStatus('error');
      })
      .finally(() => {
        setAuthSyncDone(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady, initData, setUser]);

  if (loading) {
    return <LoadingScreen progress={progress} />;
  }

  // FIX: only hold on the "95% loading" screen while SDK is still polling AND
  // bot-token exchange has not already succeeded.  Previously this guard was
  // unconditional, which blocked the app from rendering even after a successful
  // bot-token exchange while Telegram SDK was still initializing.
  if (authStatus === 'error') {
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
