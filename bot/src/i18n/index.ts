import { en } from './en';
import { zh } from './zh';

// Simplified versions for other languages (can be expanded later)
export const fr = { ...en }; // French - using English as base
export const es = { ...en }; // Spanish - using English as base
export const ar = { ...en }; // Arabic - using English as base

export const translations: Record<string, typeof en> = {
  en,
  zh,
  fr,
  es,
  ar,
};

export const getTranslation = (lang: string = 'en'): typeof en => {
  return translations[lang] || translations.en;
};

export const t = (lang: string, key: keyof typeof en, replacements?: Record<string, string>): string => {
  const translation = getTranslation(lang);
  let text = translation[key] || en[key] || key;
  
  if (replacements) {
    Object.entries(replacements).forEach(([placeholder, value]) => {
      text = text.replace(`{${placeholder}}`, value);
    });
  }
  
  return text;
};
