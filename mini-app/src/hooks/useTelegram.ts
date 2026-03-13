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
  const [initData, setInitData] = useState<string>('');

  useEffect(() => {
    tg?.ready();
    // After ready(), initData should be populated
    setInitData(tg?.initData || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tg]);

  const user = tg?.initDataUnsafe?.user;
  return { tg, user, initData };
}
