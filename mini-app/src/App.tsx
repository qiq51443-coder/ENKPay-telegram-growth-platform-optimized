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
  setAuthSyncCompleted,
  isAuthSyncCompleted,
  exchangeBotToken,
  setSessionToken,
  getSessionToken,
} from './services/api';
import { LanguageProvider, useLang } from './context/LanguageContext';
import { AuthSyncContext } from './context/AuthSyncContext';
import { UserProvider, useUser } from './context/UserContext';

// Grace period (ms) before declaring a fatal auth error after SDK timeout.
// Allows any in-flight bot-token exchange to complete before we give up.
const AUTH_FATAL_GRACE_PERIOD_MS = 1000;

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
  // Track whether auth has completely and unrecoverably failed (no token, no initData)
  const [authFatalError, setAuthFatalError] = useState(false);
  const authAttemptedRef = useRef(false);
  const { tg, initData, sdkFailed, startToken, retrySDK } = useTelegram();
  const { lang } = useLang();
  const { setUser } = useUser();

  // Version-change detection: clear stale session data ONLY when no startToken is present.
  // If a startToken was provided by the bot, we do NOT clear the session here — the token
  // exchange will naturally refresh the session if needed.
  useEffect(() => {
    try {
      const APP_VERSION = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev';
      if (startToken) {
        // When a fresh bot token is provided, just update the version marker
        // but preserve existing session token as fallback in case exchange fails.
        sessionStorage.setItem('_app_version', APP_VERSION);
        return;
      }
      const storedVersion = sessionStorage.getItem('_app_version');
      if (storedVersion !== APP_VERSION) {
        // Only clear session token when version changes AND no startToken is present
        sessionStorage.removeItem('_session_token');
        sessionStorage.setItem('_app_version', APP_VERSION);
        console.info('[App] New version detected, cleared stale session data');
      }
    } catch {
      // sessionStorage not available (e.g. private mode) — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Prevent duplicate auth attempts
    if (authAttemptedRef.current) return;

    // ── Priority 1: bot temp token exchange (bypasses initData entirely) ──────
    if (startToken) {
      authAttemptedRef.current = true;
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
          setAuthSyncDone(true);
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
              .catch((e) => {
                console.warn('[App] auth-sync fallback also failed:', String(e));
                // If we have an existing session token from a previous valid session, proceed anyway
                if (getSessionToken()) {
                  setAuthSyncCompleted(true);
                }
              })
              .finally(() => { setAuthSyncDone(true); });
          } else {
            // No initData either — check if we have a stored session token we can reuse
            const existingToken = getSessionToken();
            if (existingToken) {
              console.info('[App] No initData, reusing existing session token');
              setAuthSyncCompleted(true);
              setAuthSyncDone(true);
            } else {
              setAuthSyncDone(true);
            }
          }
        });
      return;
    }

    // ── Priority 2: Existing session token (user already authenticated before) ─
    const existingToken = getSessionToken();
    if (existingToken) {
      // We have a valid session token — skip auth-sync for now, it will be refreshed as needed
      setApiInitData(initData || '');
      setAuthSyncCompleted(true);
      setAuthSyncDone(true);
      authAttemptedRef.current = true;
      return;
    }

    // ── Priority 3: Telegram initData (standard flow) ────────────────────────
    if (!initData) return;
    authAttemptedRef.current = true;
    setApiInitData(initData);
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

  // When SDK fails AND we have no session token AND no startToken, set fatal error
  useEffect(() => {
    if (sdkFailed && !initData && !getSessionToken() && !startToken) {
      // Give a brief window for the bot-token exchange to complete before declaring fatal
      const timer = setTimeout(() => {
        if (!getSessionToken() && !isAuthSyncCompleted()) {
          setAuthFatalError(true);
        }
      }, AUTH_FATAL_GRACE_PERIOD_MS);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkFailed, initData, startToken]);

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

  // Fatal auth error: SDK timed out, no session token, no startToken.
  // Show a friendly "please reopen from Telegram" message instead of a reload loop.
  if (authFatalError) {
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
          onClick={() => {
            // Try retrying SDK poll — may work if Telegram WebApp just took longer to load
            setAuthFatalError(false);
            authAttemptedRef.current = false;
            retrySDK();
          }}
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
          onClick={() => {
            authAttemptedRef.current = false;
            retrySDK();
          }}
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
