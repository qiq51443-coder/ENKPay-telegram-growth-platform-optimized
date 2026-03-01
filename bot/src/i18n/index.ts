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

export function t(lang: string, key: string, replacements?: Record<string, string>): string {
  const langData = translations[lang] || translations['en'];
  let text = langData[key] || translations['en'][key] || key;
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}
