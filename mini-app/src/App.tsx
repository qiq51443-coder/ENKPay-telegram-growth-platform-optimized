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
  setSessionToken,
  clearSessionToken,
  getStoredSessionToken,
  getUserProfile,
  authSync,
  jtAuth,
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
  content_translations?: Record<string, string>;
  title_translations?: Record<string, string>;
}

/** Read a single query-param from the current URL without depending on any framework. */
function getUrlParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

function AppContent() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('trading');
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [authSyncDone, setAuthSyncDone] = useState(false);
  const [authStatus, setAuthStatus] = useState<'pending' | 'ok' | 'error' | 'expired'>('pending');

  // Guards against React StrictMode double-invoke
  const jtAttemptedRef = useRef(false);
  const initDataAttemptedRef = useRef(false);
  const sessionRestoreAttemptedRef = useRef(false);
  // True once any auth phase succeeds — prevents the timeout safety net from
  // overwriting a successful auth status with 'error' after the timeout fires.
  const authSucceededRef = useRef(false);
  // True once Phase 1 (jt-auth) has settled — either no ?jt= param, or the HTTP
  // request has resolved/rejected. Phase 2 waits for this before showing 'expired',
  // preventing a race where sdkReady turns false before jt-auth finishes.
  const [jtDone, setJtDone] = useState(() => !getUrlParam('jt'));

  const { tg, initData, sdkReady } = useTelegram();
  const { lang } = useLang();
  const { setUser } = useUser();

  // ── Loading progress animation: 0 → 90% (holds until authSyncDone) ──────────
  useEffect(() => {
    if (tg) {
      try { tg.expand(); } catch { /* non-critical */ }
    }
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 15;
      });
    }, 50);
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
          if (list.length > 0) {
            const raw = list[0];
            const resolvedTitle =
              (raw.title_translations && lang && raw.title_translations[lang])
              || raw.title_translations?.['en']
              || raw.title;
            const resolvedContent =
              (raw.content_translations && lang && raw.content_translations[lang])
              || raw.content_translations?.['en']
              || raw.content;
            setAnnouncement({ ...raw, title: resolvedTitle, content: resolvedContent });
          }
        })
        .catch(() => {/* non-critical */});
    }, 200);
    return () => clearTimeout(timer);
  }, [authSyncDone]);

  // ── Timeout safety net: 10s when jt token present, 12s otherwise ─────────
  // JT_AUTH_TIMEOUT_MS must exceed fastApi's axios timeout (8s) so that the
  // HTTP request can fail/succeed and be reported before this safety net fires.
  useEffect(() => {
    const JT_AUTH_TIMEOUT_MS = 10000;    // > fastApi axios timeout (8s): lets HTTP finish first
    const FALLBACK_AUTH_TIMEOUT_MS = 12000; // Without jt token: allow time for SDK + initData
    const timeoutMs = getUrlParam('jt') ? JT_AUTH_TIMEOUT_MS : FALLBACK_AUTH_TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (!authSucceededRef.current) {
        console.warn(`[App] Auth timeout after ${timeoutMs / 1000}s — force-closing loading screen`);
        setAuthStatus('error');
        setAuthSyncDone(true);
      }
    }, timeoutMs);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase 0: restore session token from localStorage (runs before SDK is needed) ───
  // If a valid session token is stored locally, skip jt-auth and initData entirely.
  // api.ts already restores the token into axios headers on module load; here we
  // verify the token is still accepted by the backend and set the user context.
  useEffect(() => {
    const storedToken = getStoredSessionToken();
    if (!storedToken) return;
    if (sessionRestoreAttemptedRef.current) return;
    sessionRestoreAttemptedRef.current = true;

    console.info('[App] Found stored session token — attempting to restore session (Phase 0)');

    getUserProfile()
      .then(data => {
        const user = data?.user || data;
        if (user?.unique_id) {
          setUser(user);
          authSucceededRef.current = true;
          setAuthStatus('ok');
          setAuthSyncDone(true);
          console.info('[App] Session token restored successfully (Phase 0)');
        } else {
          console.warn('[App] Phase 0: profile response missing user — clearing token');
          clearSessionToken();
        }
      })
      .catch(err => {
        console.warn('[App] Stored session token invalid/expired, clearing:', err?.message);
        clearSessionToken();
        // authSyncDone stays false — Phase 1 (jt-auth) or Phase 2 (initData) will continue
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase 1: jt token auth (runs immediately on mount, no SDK required) ─────
  // The Bot embeds ?jt=<token> in the WebApp URL on every /start command.
  // This token is stored in Redis for 30 minutes; after first use its TTL is
  // reset to 5 minutes (sliding window) so Telegram's cached URL can be reopened.
  // Because this requires only a URL param read + HTTP POST, it works even when
  // Telegram does not inject initData (observed on Desktop and some Android builds).
  useEffect(() => {
    if (jtAttemptedRef.current) return;
    jtAttemptedRef.current = true;

    const jtToken = getUrlParam('jt');
    if (!jtToken) {
      // No jt param in URL — skip Phase 1, let Phase 2 (initData) handle it
      console.info('[App] No ?jt= param — skipping jt-auth, waiting for initData');
      return;
    }

    console.info('[App] ?jt= param found — attempting jt-auth (Phase 1)');

    jtAuth(jtToken)
      .then(data => {
        if (data?.user) setUser(data.user);
        if (data?.session_token) setSessionToken(data.session_token);
        console.info('[App] jt-auth succeeded');
        authSucceededRef.current = true;
        setAuthStatus('ok');
        setAuthSyncDone(true);
        setJtDone(true);
      })
      .catch(err => {
        const is401 = err?.response?.status === 401;
        if (is401) {
          console.warn('[App] jt-auth 401: token expired — will check initData before showing expired screen');
          // Do NOT immediately set expired — let Phase 2 try initData first.
          // Phase 2 effect will detect authSyncDone=false and try initData when SDK is ready.
          // Only if SDK is also unavailable will we fall through to the expired/error screen.
        } else {
          // Network / server error — fall through to Phase 2 (initData) as a last resort
          console.warn('[App] jt-auth failed (network error), falling back to initData:', err?.message);
          // Do NOT set authStatus/authSyncDone here — let Phase 2 handle it
        }
        setJtDone(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase 2: initData fallback (runs once SDK is ready) ───────────────────
  // Only runs if Phase 1 did not already set authSyncDone AND there is no jt token
  // (jt expired or network error falls back to initData only when no jt param exists).
  useEffect(() => {
    if (authSyncDone) return;           // Phase 1 already succeeded — skip
    if (sdkReady === null) return;      // Still polling Telegram SDK — wait
    if (initDataAttemptedRef.current) return;

    // If a jt token was present in the URL but auth failed, show expired screen
    // instead of attempting initData (which won't help if jt is the auth mechanism).
    // Guard: wait for jt-auth to settle (jtDone) before deciding — avoids a race
    // where sdkReady turns false while the jt-auth HTTP request is still in-flight.
    if (getUrlParam('jt')) {
      if (!jtDone) {
        // jt-auth is still running — wait for it to complete before deciding
        return;
      }
      console.warn('[App] jt token present but auth failed — showing expired screen');
      setAuthStatus('expired');
      setAuthSyncDone(true);
      return;
    }

    initDataAttemptedRef.current = true;  // Only set after sdkReady is determined

    if (sdkReady === false) {
      const hasJtToken = !!getUrlParam('jt');
      console.warn('[App] Telegram SDK unavailable' + (hasJtToken ? ' and jt expired' : ' and no jt token') + ' — cannot authenticate');
      setAuthStatus(hasJtToken ? 'expired' : 'error');
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

    console.info('[App] initData available — attempting authSync (Phase 2)');

    authSync(initData)
      .then(data => {
        if (data?.user) setUser(data.user);
        if (data?.session_token) setSessionToken(data.session_token);
        authSucceededRef.current = true;
        setAuthStatus('ok');
      })
      .catch(err => {
        console.error('[App] authSync failed:', err?.message || String(err));
        setAuthStatus('error');
      })
      .finally(() => {
        setAuthSyncDone(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady, initData, authSyncDone, jtDone, setUser]);

  if (loading) {
    return <LoadingScreen progress={progress} />;
  }

  if (authStatus === 'expired' || authStatus === 'error') {
    const isExpired = authStatus === 'expired';
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: theme.bgPrimary,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px', gap: '20px',
      }}>
        <div style={{ fontSize: '48px', textAlign: 'center' }}>🔗</div>
        <div style={{ color: theme.text, fontSize: '16px', textAlign: 'center', lineHeight: '1.6' }}>
          {isExpired ? '链接已过期' : '认证失败'}<br />
          <span style={{ fontSize: '13px', opacity: 0.7 }}>
            请返回聊天界面，点击「打开应用」按钮重新进入
          </span>
        </div>
        <button
          onClick={() => {
            try { window.Telegram?.WebApp?.close(); } catch (e) { console.warn('[App] WebApp.close() failed:', e); }
          }}
          style={{
            backgroundColor: '#F0B90B', color: '#000', border: 'none',
            borderRadius: '8px', padding: '12px 32px',
            fontSize: '15px', fontWeight: '600', cursor: 'pointer',
          }}
        >
          返回 Telegram
        </button>
      </div>
    );
  }

  const renderPage = () => {
    switch (activeTab) {
      case 'trading':  return <ErrorBoundary><Trading /></ErrorBoundary>;
      case 'auction':  return <ErrorBoundary><Auction /></ErrorBoundary>;
      case 'products': return <ErrorBoundary><Products /></ErrorBoundary>;
      case 'charity':  return <ErrorBoundary><Charity /></ErrorBoundary>;
      case 'profile':  return <ErrorBoundary><Profile /></ErrorBoundary>;
      default:         return <ErrorBoundary><Trading /></ErrorBoundary>;
    }
  };

  return (
    <AuthSyncContext.Provider value={{ authSyncDone, authStatus }}>
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        style={{ minHeight: '100vh', backgroundColor: theme.bgPrimary, paddingBottom: '60px' }}
      >
        {announcement && (
          <AnnouncementModal
            title={announcement.title}
            content={announcement.content}
            images={announcement.images}
            lang={lang}
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
