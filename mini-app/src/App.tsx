import { useState, useEffect } from 'react';
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
  setAuthSyncCompleted,
  exchangeBotToken,
  setSessionToken,
  getSessionToken,
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
  const { tg, initData, sdkFailed, startToken } = useTelegram();
  const { lang } = useLang();
  const { setUser } = useUser();

  // Version-change detection: clear stale session data when a new build is deployed
  useEffect(() => {
    const APP_VERSION = __BUILD_TIMESTAMP__;
    const storedVersion = sessionStorage.getItem('_app_version');
    if (storedVersion !== APP_VERSION) {
      sessionStorage.removeItem('_session_token');
      sessionStorage.setItem('_app_version', APP_VERSION);
      console.info('[App] New version detected, cleared stale session data');
    }
  }, []);

  useEffect(() => {
    // ── Priority 1: bot temp token exchange (bypasses initData entirely) ──────
    if (startToken) {
      exchangeBotToken(startToken)
        .then((data) => {
          if (data.session_token) {
            setSessionToken(data.session_token);
          }
          // Store the full profile returned by the token exchange so child
          // components (Profile, Trading) don't need to re-authenticate.
          if (data.user) {
            setUser(data.user);
          }
          setAuthSyncCompleted(true);
        })
        .catch((err) => {
          console.warn('[App] bot-token exchange failed, falling back to initData:', String(err));
          // Fall back to the initData flow if the token exchange fails
          if (initData) {
            setApiInitData(initData);
            authSync(initData)
              .then((authData) => {
                if (authData?.user) setUser(authData.user);
                setAuthSyncCompleted(true);
              })
              .catch((e) => { console.warn('[App] auth-sync fallback also failed:', String(e)); });
          }
        })
        .finally(() => { setAuthSyncDone(true); });
      return;
    }

    // ── Priority 2: Telegram initData (legacy / fallback) ────────────────────
    if (!initData) return;
    setApiInitData(initData);
    // Ensure the backend has a complete user record (with unique_id, invite_code, etc.)
    // the moment the MiniApp opens. Failure is non-critical — profile fetch will surface
    // missing-user errors explicitly if the record still doesn't exist.
    let cancelled = false;
    authSync(initData)
      .then((authData) => {
        if (!cancelled) {
          if (authData?.user) setUser(authData.user);
          setAuthSyncCompleted(true);
        }
      })
      .catch((err) => {
        console.warn('[App] auth-sync failed (non-critical):', String(err));
      })
      .finally(() => { if (!cancelled) setAuthSyncDone(true); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startToken, initData]);

  useEffect(() => {
    tg?.expand();
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setLoading(false);
            // Fetch launch announcements after loading completes
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
  // tg is stable after initial mount; expand only needs to be called once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <LoadingScreen progress={progress} />;
  }

  // SDK timed out and no initData available — the app cannot function without it.
  // Exception: if a session token was obtained via bot-token exchange, we can
  // proceed normally even when Telegram SDK initData is absent.
  if (sdkFailed && !initData && !getSessionToken()) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: theme.bgPrimary,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px', gap: '16px',
      }}>
        <div style={{ color: theme.text, fontSize: '16px', textAlign: 'center' }}>
          加载失败，请重试
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
