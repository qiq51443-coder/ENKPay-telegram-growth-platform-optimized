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
  // Try to read initData synchronously first (works on most Telegram versions)
  const initialInitData = window.Telegram?.WebApp?.initData ?? '';

  const [tg, setTg] = useState<Window['Telegram']['WebApp'] | null>(() => {
    return window.Telegram?.WebApp ?? null;
  });
  const [initData, setInitData] = useState<string>(() => initialInitData);

  // If we already have initData synchronously, sdkReady starts as true.
  // Otherwise, null = still polling.
  const [sdkReady, setSdkReady] = useState<boolean | null>(() => {
    return initialInitData ? true : null;
  });

  useEffect(() => {
    // Already have initData — just call SDK lifecycle methods
    if (initialInitData) {
      try { window.Telegram?.WebApp?.ready(); } catch { /* non-critical */ }
      try { window.Telegram?.WebApp?.expand(); } catch { /* non-critical */ }
      // sdkReady is already true from useState init
      return;
    }

    // Poll for SDK availability
    // Telegram mobile apps typically inject initData within 0-500ms
    // Give up after 10 seconds (100 attempts × 100ms)
    let attempts = 0;
    const MAX_ATTEMPTS = 100; // 10 seconds

    const timer = setInterval(() => {
      attempts++;
      const webApp = window.Telegram?.WebApp;
      const currentInitData = webApp?.initData;

      if (currentInitData) {
        clearInterval(timer);
        setTg(webApp!);
        setInitData(currentInitData);
        setSdkReady(true);
        try { webApp!.ready(); } catch { /* non-critical */ }
        try { webApp!.expand(); } catch { /* non-critical */ }
      } else if (attempts >= MAX_ATTEMPTS) {
        clearInterval(timer);
        setSdkReady(false); // Definitively not available
      }
    }, 100);

    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  return {
    tg,
    initData,
    sdkReady,
    user: tg?.initDataUnsafe?.user ?? null,
  };
}
