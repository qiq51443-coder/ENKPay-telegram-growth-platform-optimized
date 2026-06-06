import { getCustomAnimatedEmojiLibrary } from './custom-emojis';
import { getBotMessageEmojiConfig } from './emoji-config';

const CACHE_TTL = 60 * 1000;
const TG_EMOJI_TAG_RE = /<tg-emoji\b[^>]*>[\s\S]*?<\/tg-emoji>/gi;
const TG_EMOJI_VALUE_RE = /<tg-emoji\s+emoji-id="([^"]+)"\s*>([\s\S]*?)<\/tg-emoji>/gi;

let cachedMappings: Record<string, string> | null = null;
let cachedAt = 0;
let inFlight: Promise<Record<string, string>> | null = null;

function extractMappingsFromConfig(config: Record<string, any>): Record<string, string> {
  const mappings: Record<string, string> = {};

  for (const value of Object.values(config)) {
    if (typeof value === 'string' && value.includes('<tg-emoji')) {
      TG_EMOJI_VALUE_RE.lastIndex = 0;
      let match = TG_EMOJI_VALUE_RE.exec(value);
      while (match) {
        const [, emojiId, fallback] = match;
        const safeFallback = String(fallback || '').trim();
        const safeId = String(emojiId || '').trim();
        if (safeFallback && safeId) {
          mappings[safeFallback] = safeId;
        }
        match = TG_EMOJI_VALUE_RE.exec(value);
      }
    }

    if (!value || typeof value !== 'object') continue;

    const fallback = typeof value.header_emoji_fallback === 'string'
      ? value.header_emoji_fallback.trim()
      : '';
    const id = typeof value.header_emoji_id === 'string'
      ? value.header_emoji_id.trim()
      : '';
    if (fallback && id && !fallback.includes('<tg-emoji')) {
      mappings[fallback] = id;
    }
  }

  if (typeof config.header_emoji_id === 'string' && typeof config.header_emoji_fallback === 'string') {
    const fallback = config.header_emoji_fallback.trim();
    const id = config.header_emoji_id.trim();
    if (fallback && id && !fallback.includes('<tg-emoji')) {
      mappings[fallback] = id;
    }
  }

  return mappings;
}

async function loadAnimatedEmojiMappings(): Promise<Record<string, string>> {
  const [{ emojis }, config] = await Promise.all([
    getCustomAnimatedEmojiLibrary(),
    getBotMessageEmojiConfig(),
  ]);

  const mappings: Record<string, string> = {};

  for (const emoji of emojis) {
    const fallback = emoji.fallback.trim();
    const id = emoji.id.trim();
    if (!fallback || !id) continue;
    mappings[fallback] = id;
  }

  return {
    ...mappings,
    ...extractMappingsFromConfig(config as Record<string, any>),
  };
}

export async function getAnimatedEmojiMappings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedMappings && now - cachedAt < CACHE_TTL) return cachedMappings;
  if (inFlight) return inFlight;

  inFlight = loadAnimatedEmojiMappings()
    .then((mappings) => {
      cachedMappings = mappings;
      cachedAt = Date.now();
      inFlight = null;
      return mappings;
    })
    .catch((error) => {
      console.error('[animated-emojis] load failed:', error);
      inFlight = null;
      return cachedMappings || {};
    });

  return inFlight;
}

function replaceEmojiText(text: string, mappings: Record<string, string>): string {
  let output = text;
  const entries = Object.entries(mappings)
    .filter(([emoji, id]) => Boolean(emoji && id))
    .sort((a, b) => b[0].length - a[0].length);

  for (const [emoji, id] of entries) {
    const escapedEmoji = emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(
      new RegExp(escapedEmoji, 'g'),
      `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`
    );
  }

  return output;
}

function replaceOutsideTelegramEmojiTags(text: string, mappings: Record<string, string>): string {
  let result = '';
  let lastIndex = 0;

  TG_EMOJI_TAG_RE.lastIndex = 0;
  let match = TG_EMOJI_TAG_RE.exec(text);
  while (match) {
    const start = match.index;
    result += replaceEmojiText(text.slice(lastIndex, start), mappings);
    result += match[0];
    lastIndex = start + match[0].length;
    match = TG_EMOJI_TAG_RE.exec(text);
  }

  result += replaceEmojiText(text.slice(lastIndex), mappings);
  return result;
}

export async function ae(emoji: string, customId?: string): Promise<string> {
  const id = customId || (await getAnimatedEmojiMappings())[emoji];
  if (!id) return emoji;
  return `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`;
}

export async function animateEmojis(text: string): Promise<string> {
  const mappings = await getAnimatedEmojiMappings();
  if (Object.keys(mappings).length === 0) return text;
  return replaceOutsideTelegramEmojiTags(text, mappings);
}

export function invalidateAnimatedEmojiCache() {
  cachedMappings = null;
  cachedAt = 0;
  inFlight = null;
}
