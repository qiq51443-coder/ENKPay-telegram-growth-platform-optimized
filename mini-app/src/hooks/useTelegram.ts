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
  const user = tg?.initDataUnsafe?.user;
  const initData = tg?.initData || '';

  useEffect(() => {
    tg?.ready();
  }, [tg]);

  return { tg, user, initData };
}
