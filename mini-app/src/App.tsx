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
  exchangeBotToken,
  setSessionToken,
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

  // Prevent duplicate auth attempts per phase
  const botTokenAttemptedRef = useRef(false);
  const initDataAttemptedRef = useRef(false);
  // Shared flag: set true as soon as ANY auth path succeeds
  const authSucceededRef = useRef(false);

  // Read URL query params once on mount (stable across renders)
  const urlParamsRef = useRef(new URLSearchParams(window.location.search));
  const startTokenRef = useRef(urlParamsRef.current.get('start_token') || '');
  const urlTelegramIdRef = useRef(
    parseInt(urlParamsRef.current.get('telegram_id') || '', 10) || undefined
  );

  const { tg, initData, sdkReady } = useTelegram();
  const { lang } = useLang();
  const { setUser } = useUser();

  // ── Phase 1: Bot-token exchange (immediate — does NOT need Telegram SDK) ──────
  //
  // The bot embeds a short-lived `start_token` and `telegram_id` in the WebApp
  // URL (?start_token=...&telegram_id=...).  Exchanging it gives a 24-hour
  // session token + canonical user profile without relying on initData HMAC
  // validation, which is sensitive to bot-token misconfiguration.
  //
  // The backend exchange endpoint also has a fallback: if the token is already
  // expired but `telegram_id` belongs to an existing user, it issues a fresh
  // recovery session — so even cached/replayed URLs often succeed.
  useEffect(() => {
    const startToken = startTokenRef.current;
    const urlTelegramId = urlTelegramIdRef.current;

    if (!startToken) return; // No bot token in URL — skip, let Phase 2 handle auth
    if (botTokenAttemptedRef.current) return;
    botTokenAttemptedRef.current = true;

    console.info('[App] Attempting bot-token exchange');

    exchangeBotToken(startToken, urlTelegramId)
      .then((data) => {
        // Always persist the session token so subsequent API calls use it
        if (data?.session_token) {
          setSessionToken(data.session_token);
        }
        if (authSucceededRef.current) return; // Phase 2 (initData) won the race
        if (data?.user) {
          setUser(data.user);
        }
        authSucceededRef.current = true;
        setAuthStatus('ok');
        setAuthSyncDone(true);
        console.info('[App] Bot-token exchange succeeded', { recovered: !!data?.recovered });
      })
      .catch((err) => {
        console.warn('[App] Bot-token exchange failed — falling back to initData:', err?.message || String(err));
        // Do NOT set 'error' here; Phase 2 (initData) will decide the final outcome.
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run exactly once on mount

  // ── Phase 2: Telegram SDK / initData auth (fires when sdkReady settles) ──────
  //
  // Fallback path when no start_token in URL or bot-token exchange failed.
  //
  // FIX: previously, authSync failures were silently ignored and authStatus was
  // forced to 'ok' regardless.  This caused the app to render with no user data
  // and made all subsequent API calls fail with 401.  The failure is now
  // correctly propagated so the user sees the retry screen.
  useEffect(() => {
    if (authSucceededRef.current) return; // Phase 1 already succeeded
    if (initDataAttemptedRef.current) return;
    if (sdkReady === null) return; // Still polling — wait

    initDataAttemptedRef.current = true;

    if (sdkReady === false) {
      console.warn('[App] SDK unavailable and no valid bot-token — cannot authenticate');
      setAuthStatus('error');
      setAuthSyncDone(true);
      return;
    }

    if (!initData) {
      // SDK reports ready but initData is empty.  This can happen if the
      // Telegram client version is too old to inject initData, or if the
      // page is being viewed outside a proper WebApp context.
      console.warn('[App] SDK reports ready but initData is empty — possible old Telegram client or non-WebApp context');
      setAuthStatus('error');
      setAuthSyncDone(true);
      return;
    }

    setApiInitData(initData);

    authSync(initData)
      .then((data) => {
        if (authSucceededRef.current) return; // Bot-token exchange won the race
        if (data?.user) {
          setUser(data.user);
        }
        authSucceededRef.current = true;
        setAuthStatus('ok');
      })
      .catch((err) => {
        if (authSucceededRef.current) return; // Bot-token exchange won the race
        console.error('[App] authSync failed:', err?.message || String(err));
        // FIX: propagate failure instead of silently setting 'ok'
        setAuthStatus('error');
      })
      .finally(() => {
        setAuthSyncDone(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady, initData, setUser]);

  // Loading progress animation (independent of auth)
  useEffect(() => {
    if (tg) {
      try { tg.expand(); } catch { /* non-critical */ }
    }
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

  // FIX: only hold on the "95% loading" screen while SDK is still polling AND
  // bot-token exchange has not already succeeded.  Previously this guard was
  // unconditional, which blocked the app from rendering even after a successful
  // bot-token exchange while Telegram SDK was still initializing.
  if (sdkReady === null && !authSucceededRef.current) {
    return <LoadingScreen progress={95} />;
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
