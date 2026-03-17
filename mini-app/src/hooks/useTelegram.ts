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
  // Initialise synchronously — this already works when the SDK has loaded
  // before React renders (the common case). The state + effect below handle
  // the race where the SDK loads slightly after first render.
  const [tg, setTg] = useState(() => window.Telegram?.WebApp ?? null);
  const [initData, setInitData] = useState(() => window.Telegram?.WebApp?.initData ?? '');
  const [user, setUser] = useState(() => window.Telegram?.WebApp?.initDataUnsafe?.user);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Call ready() as soon as tg is available AND initData is non-empty.
    // If tg exists but initData is still empty the SDK hasn't fully initialised
    // yet — fall through to polling so we wait for initData to populate.
    if (tg && initData) {
      tg.ready();
      return; // Already have complete data, no polling needed
    }

    // SDK not ready yet (or initData still empty) – poll every 100ms for up to 3 seconds
    let elapsed = 0;
    pollRef.current = setInterval(() => {
      elapsed += 100;
      const webApp = window.Telegram?.WebApp;
      if (webApp?.initData) {
        setTg(webApp);
        setInitData(webApp.initData);
        setUser(webApp.initDataUnsafe?.user);
        webApp.ready();
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } else if (elapsed >= 3000) {
        // Give up after 3 seconds
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 100);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tg, user, initData };
}
