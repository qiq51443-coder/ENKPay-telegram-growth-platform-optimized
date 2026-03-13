import { useEffect } from 'react';

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
  const tg = window.Telegram?.WebApp;
  // Read initData synchronously to avoid timing race conditions.
  // window.Telegram.WebApp is populated before React renders, so this is safe.
  const initData = tg?.initData || '';

  useEffect(() => {
    tg?.ready();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const user = tg?.initDataUnsafe?.user;
  return { tg, user, initData };
}
