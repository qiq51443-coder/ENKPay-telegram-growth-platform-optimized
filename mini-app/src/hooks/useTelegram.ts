import { useEffect, useState, useRef, useCallback } from 'react';

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

// Read start_token from the URL query string once (static — the URL won't change at runtime).
const _urlParams = new URLSearchParams(window.location.search);
const _startToken = _urlParams.get('start_token') || '';

// Number of retries that use the shorter (5s) timeout before switching to the longer (10s) one
const MAX_FAST_RETRIES = 2;

export function useTelegram() {
  // Initialise synchronously — this already works when the SDK has loaded
  // before React renders (the common case). The state + effect below handle
  // the race where the SDK loads slightly after first render.
  const [tg, setTg] = useState(() => window.Telegram?.WebApp ?? null);
  const [initData, setInitData] = useState(() => window.Telegram?.WebApp?.initData ?? '');
  const [user, setUser] = useState(() => window.Telegram?.WebApp?.initDataUnsafe?.user);
  // sdkFailed is true when polling has given up and no initData was found
  const [sdkFailed, setSdkFailed] = useState(false);
  // sdkRetryCount is incremented by retrySDK() to trigger a fresh polling attempt
  const [sdkRetryCount, setSdkRetryCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Allow external callers to trigger a fresh SDK poll attempt
  const retrySDK = useCallback(() => {
    setSdkFailed(false);
    setSdkRetryCount(c => c + 1);
  }, []);

  useEffect(() => {
    // Call ready() as soon as tg is available AND initData is non-empty.
    // If tg exists but initData is still empty the SDK hasn't fully initialised
    // yet — fall through to polling so we wait for initData to populate.
    if (tg && initData) {
      try { tg.ready(); } catch { /* non-critical */ }
      return; // Already have complete data, no polling needed
    }

    // Helper to apply WebApp data once it becomes available
    const applyWebApp = (webApp: NonNullable<Window['Telegram']>['WebApp']) => {
      setTg(webApp);
      setInitData(webApp.initData);
      setUser(webApp.initDataUnsafe?.user);
      try { webApp.ready(); } catch { /* non-critical */ }
    };

    // Backup: also listen for window 'load' event in case the SDK script
    // is still loading when this effect runs (e.g. slow network conditions).
    let loadListenerAdded = false;
    const handleLoad = () => {
      const webApp = window.Telegram?.WebApp;
      if (webApp?.initData) {
        applyWebApp(webApp);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    };

    if (document.readyState === 'complete') {
      // Window already loaded — check once immediately as a backup
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
      loadListenerAdded = true;
    }

    // Poll every 100ms; use a shorter timeout for the first MAX_FAST_RETRIES attempts,
    // then a longer timeout to give Telegram WebApp more time to load on slow devices.
    const maxWait = sdkRetryCount < MAX_FAST_RETRIES ? 5000 : 10000;
    let elapsed = 0;
    pollRef.current = setInterval(() => {
      elapsed += 100;
      const webApp = window.Telegram?.WebApp;
      if (webApp?.initData) {
        applyWebApp(webApp);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else if (elapsed >= maxWait) {
        // Give up; notify callers so they can show error state
        setSdkFailed(true);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 100);

    return () => {
      if (loadListenerAdded) {
        window.removeEventListener('load', handleLoad);
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkRetryCount]);

  return { tg, user, initData, sdkFailed, startToken: _startToken, retrySDK };
}
