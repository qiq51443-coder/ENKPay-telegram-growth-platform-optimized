import { useEffect, useState } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
          start_param?: string;
        };
        expand: () => void;
        close: () => void;
        ready: () => void;
        openTelegramLink: (url: string) => void;
        MainButton: {
          setText: (text: string) => void;
          show: () => void;
          hide: () => void;
          onClick: (fn: () => void) => void;
        };
      };
    };
  }
}

export function useTelegram() {
  const [tg, setTg] = useState<Window['Telegram']['WebApp'] | null>(() => {
    return window.Telegram?.WebApp ?? null;
  });
  const [initData, setInitData] = useState<string>(() => {
    return window.Telegram?.WebApp?.initData ?? '';
  });
  // null = still loading/polling, true = SDK ready, false = timed out (not opened from Telegram)
  const [sdkReady, setSdkReady] = useState<boolean | null>(() => {
    return window.Telegram?.WebApp?.initData ? true : null;
  });

  useEffect(() => {
    // If already have initData from synchronous init, we're done
    if (initData) {
      try { window.Telegram?.WebApp?.ready(); } catch { /* non-critical */ }
      try { window.Telegram?.WebApp?.expand(); } catch { /* non-critical */ }
      setSdkReady(true);
      return;
    }

    // Poll for SDK availability (max 8 seconds, every 100ms = 80 attempts)
    let attempts = 0;
    const MAX_ATTEMPTS = 80;

    const timer = setInterval(() => {
      attempts++;
      const webApp = window.Telegram?.WebApp;
      if (webApp?.initData) {
        clearInterval(timer);
        setTg(webApp);
        setInitData(webApp.initData);
        setSdkReady(true);
        try { webApp.ready(); } catch { /* non-critical */ }
        try { webApp.expand(); } catch { /* non-critical */ }
      } else if (attempts >= MAX_ATTEMPTS) {
        clearInterval(timer);
        // SDK not available - app must be opened from Telegram
        setSdkReady(false);
      }
    }, 100);

    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    tg,
    initData,
    sdkReady,
    user: tg?.initDataUnsafe?.user ?? null,
  };
}
