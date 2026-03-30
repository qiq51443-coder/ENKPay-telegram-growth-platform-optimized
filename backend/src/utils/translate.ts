import axios from 'axios';

export const SUPPORTED_LANGS = ['zh', 'en', 'fr', 'de', 'es', 'ar', 'ja'] as const;
export type SupportedLang = typeof SUPPORTED_LANGS[number];

/**
 * Translate text to a single target language using LibreTranslate.
 * Falls back to the original text on error.
 * Configure via env vars: LIBRETRANSLATE_URL, LIBRETRANSLATE_API_KEY
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || !text.trim()) return text;
  const libreUrl = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000';
  const apiKey = process.env.LIBRETRANSLATE_API_KEY || '';
  try {
    const response = await axios.post(
      `${libreUrl}/translate`,
      {
        q: text,
        source: 'auto',
        target: targetLang,
        format: 'text',
        api_key: apiKey,
      },
      { timeout: 15000 }
    );
    return (response.data?.translatedText as string) || text;
  } catch (err) {
    console.error(`LibreTranslate failed for lang=${targetLang}:`, err);
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
