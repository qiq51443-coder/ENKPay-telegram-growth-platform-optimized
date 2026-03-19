import axios from 'axios';

export const SUPPORTED_LANGS = ['zh', 'en', 'fr', 'de', 'es', 'ar', 'ja'] as const;
export type SupportedLang = typeof SUPPORTED_LANGS[number];

/**
 * Translate text to a single target language using Google Translate free API.
 * Returns the original text on failure.
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || !text.trim()) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await axios.get(url, { timeout: 8000 });
    const data = response.data;
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return (data[0] as any[]).map((segment: any) => segment[0] || '').join('');
    }
    return text;
  } catch (err) {
    console.error(`translateText failed for lang=${targetLang}:`, err);
    return text;
  }
}

/**
 * Translate text to all supported languages.
 * Returns a Record<lang, translatedText>.
 */
export async function translateToAllLangs(text: string): Promise<Record<string, string>> {
  if (!text || !text.trim()) return {};
  const pairs = await Promise.all(
    SUPPORTED_LANGS.map(async (lang): Promise<[string, string]> => {
      const translated = await translateText(text, lang);
      return [lang, translated];
    })
  );
  return Object.fromEntries(pairs);
}
