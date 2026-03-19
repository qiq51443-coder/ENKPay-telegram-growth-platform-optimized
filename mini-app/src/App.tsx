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
  const [authStatus, setAuthStatus] = useState<'pending' | 'ok' | 'error'>('pending');

  // Guards against React StrictMode double-invoke
  const jtAttemptedRef = useRef(false);
  const initDataAttemptedRef = useRef(false);

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

  // ── 16s timeout safety net (covers 15s SDK polling + network time) ─────────
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn('[App] Auth timeout after 16s — force-closing loading screen');
        setAuthStatus('error');
        setAuthSyncDone(true);
      }
    }, 16000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase 1: jt token auth (runs immediately on mount, no SDK required) ─────
  // The Bot embeds ?jt=<token> in the WebApp URL on every /start command.
  // This token is stored in Redis for 30 minutes and is single-use.
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
        setAuthStatus('ok');
        setAuthSyncDone(true);
      })
      .catch(err => {
        // jt token expired or already consumed — fall through to Phase 2
        console.warn('[App] jt-auth failed (token may be expired), falling back to initData:', err?.message);
        // Do NOT set authStatus/authSyncDone here — let Phase 2 handle it
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase 2: initData fallback (runs once SDK is ready) ───────────────────
  // Only runs if Phase 1 did not already set authSyncDone.
  useEffect(() => {
    if (authSyncDone) return;           // Phase 1 already succeeded — skip
    if (initDataAttemptedRef.current) return;
    if (sdkReady === null) return;      // Still polling Telegram SDK — wait

    initDataAttemptedRef.current = true;

    if (sdkReady === false) {
      console.warn('[App] Telegram SDK unavailable and no jt token — cannot authenticate');
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

    console.info('[App] initData available — attempting authSync (Phase 2)');

    authSync(initData)
      .then(data => {
        if (data?.user) setUser(data.user);
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
  }, [sdkReady, initData, authSyncDone, setUser]);

  if (loading) {
    return <LoadingScreen progress={progress} />;
  }

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
      case 'trading':  return <ErrorBoundary><Trading /></ErrorBoundary>;
      case 'auction':  return <ErrorBoundary><Auction /></ErrorBoundary>;
      case 'products': return <ErrorBoundary><Products /></ErrorBoundary>;
      case 'charity':  return <ErrorBoundary><Charity /></ErrorBoundary>;
      case 'profile':  return <ErrorBoundary><Profile /></ErrorBoundary>;
      default:         return <ErrorBoundary><Trading /></ErrorBoundary>;
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
