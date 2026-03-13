import React, { createContext, useContext, useState, useCallback } from 'react';
import { LangCode, SUPPORTED_LANGUAGES, t } from '../i18n';
import { api } from '../services/api';

interface LanguageContextValue {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key: string) => key,
});

function resolveInitialLang(): LangCode {
  // 1. Saved user preference
  const saved = localStorage.getItem('userLang');
  const supportedCodes = SUPPORTED_LANGUAGES.map(l => l.code as string);
  if (saved && supportedCodes.includes(saved)) {
    return saved as LangCode;
  }

  // 2. Telegram user language
  const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  if (tgLang && supportedCodes.includes(tgLang)) {
    return tgLang as LangCode;
  }

  return 'en';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<LangCode>(resolveInitialLang);

  const setLang = useCallback((newLang: LangCode) => {
    setLangState(newLang);
    localStorage.setItem('userLang', newLang);

    // Sync language preference to backend (non-critical)
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
      api.post('/miniapp/language', { language: newLang }, {
        headers: { 'X-Telegram-Init-Data': initData },
      }).catch(() => {/* non-critical */});
    }
  }, []);

  const translate = useCallback((key: string) => t(lang, key), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translate }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLang(): LanguageContextValue {
  return useContext(LanguageContext);
}
