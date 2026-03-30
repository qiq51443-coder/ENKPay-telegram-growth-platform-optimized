import axios from 'axios';

export const SUPPORTED_LANGS = ['zh', 'en', 'fr', 'de', 'es', 'ar', 'ja'] as const;
export type SupportedLang = typeof SUPPORTED_LANGS[number];

/**
 * Translate text using Google Translate free API (fallback).
 */
async function translateWithGoogle(text: string, targetLang: string): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return (data[0] as any[]).map((segment: any) => segment[0] || '').join('') || text;
    }
    return text;
  } catch (err) {
    console.error(`Google Translate fallback failed for lang=${targetLang}:`, err);
    return text;
  }
}

/**
 * Translate text to a single target language.
 * Uses LibreTranslate if LIBRETRANSLATE_URL is configured (and not localhost),
 * otherwise falls back to Google Translate free API.
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || !text.trim()) return text;

  const libreUrl = process.env.LIBRETRANSLATE_URL || '';
  const apiKey = process.env.LIBRETRANSLATE_API_KEY || '';

  // Only use LibreTranslate if a non-localhost URL is explicitly configured
  let useLibre = false;
  if (libreUrl) {
    try {
      const parsed = new URL(libreUrl);
      const host = parsed.hostname;
      useLibre = host !== 'localhost' && host !== '127.0.0.1' && !host.startsWith('::1');
    } catch {
      // Invalid URL — skip LibreTranslate
    }
  }

  if (useLibre) {
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
      const translated = (response.data?.translatedText as string) || '';
      if (translated && translated !== text) return translated;
      // If result is identical to source, fall through to Google
    } catch (err) {
      console.warn(`LibreTranslate failed for lang=${targetLang}, falling back to Google:`, err);
    }
  }

  // Fallback: Google Translate free API
  return translateWithGoogle(text, targetLang);
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
