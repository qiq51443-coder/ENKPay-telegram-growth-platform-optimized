import { useEffect, useState, useRef } from 'react';

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
        version?: string;
        platform?: string;
        colorScheme?: string;
        themeParams?: Record<string, string>;
        isExpanded?: boolean;
        viewportHeight?: number;
        viewportStableHeight?: number;
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
    TelegramGameProxy?: unknown; // Legacy Telegram game proxy
  }
}

const POLL_INTERVAL_MS = 100;
const MAX_POLL_ATTEMPTS = 150; // 15 seconds total

export function useTelegram() {
  const [tg, setTg] = useState<Window['Telegram']['WebApp'] | null>(null);
  const [initData, setInitData] = useState<string>('');
  // null = still detecting; true = SDK ready; false = SDK unavailable
  const [sdkReady, setSdkReady] = useState<boolean | null>(null);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    // Guard against StrictMode double-invocation and re-renders
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    function tryInit(): boolean {
      const webApp = window.Telegram?.WebApp;
      const currentInitData = webApp?.initData;
      if (currentInitData && currentInitData.length > 0) {
        setTg(webApp!);
        setInitData(currentInitData);
        setSdkReady(true);
        try { webApp!.ready(); } catch { /* non-critical */ }
        // Delay expand() slightly to avoid iOS issues with early calls
        setTimeout(() => {
          try { webApp!.expand(); } catch { /* non-critical */ }
        }, 100);
        return true;
      }
      return false;
    }

    // Attempt synchronous detection first (works when Telegram injects initData before render)
    if (tryInit()) return;

    // Poll for SDK availability
    // Telegram mobile/desktop apps may inject initData after the page starts rendering
    // Give up after 15 seconds (150 attempts × 100ms)
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (tryInit()) {
        clearInterval(timer);
        return;
      }
      if (attempts >= MAX_POLL_ATTEMPTS) {
        clearInterval(timer);
        // Log diagnostic info to aid debugging
        const webApp = window.Telegram?.WebApp;
        if (webApp && webApp.initData === '') {
          console.warn('[useTelegram] Telegram SDK present but no initData after 15s. Not opened from Telegram?');
        }
        setSdkReady(false); // Definitively not available
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []); // Run once on mount only

  return {
    tg,
    initData,
    sdkReady,
    user: tg?.initDataUnsafe?.user ?? null,
  };
}
