import { en } from './en';
import { zh } from './zh';
import { fr } from './fr';
import { de } from './de';
import { es } from './es';
import { ar } from './ar';
import { ja } from './ja';

type Lang = Record<string, string>;

const translations: Record<string, Lang> = {
  en,
  zh,
  fr,
  de,
  es,
  ar,
  ja,
};

export const SUPPORTED_LANGUAGE_CODES = ['zh', 'en', 'fr', 'de', 'es', 'ar', 'ja'] as const;
export type LangCode = typeof SUPPORTED_LANGUAGE_CODES[number];

export function isSupportedLang(code: string): code is LangCode {
  return (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code);
}

export function t(lang: string, key: string, replacements?: Record<string, string>): string {
  const langData = translations[lang] || translations['en'];
  let text = langData[key] || translations['en'][key] || key;
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return text;
}

const CONDITION_KEY_MAP: Record<string, string> = {
  first_follow: 'redpacket_condition_first_follow',
  deposited: 'redpacket_condition_deposited',
};

export function tClaimConditionNotMet(lang: string, condition: string): string {
  const conditionDescKey = CONDITION_KEY_MAP[condition];
  const conditionDesc = conditionDescKey ? t(lang, conditionDescKey) : condition;
  return t(lang, 'redpacket_condition_not_met', { condition_desc: conditionDesc });
}
