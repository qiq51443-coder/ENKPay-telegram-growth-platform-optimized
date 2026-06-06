import { query } from '../db';

export interface CustomAnimatedEmoji {
  id: string;
  fallback: string;
  label: string;
  thumbnailFileId?: string;
}

export const DEFAULT_CUSTOM_ANIMATED_EMOJIS: CustomAnimatedEmoji[] = [
  { id: '5471952986970267163', fallback: '🔥', label: '🔥 火焰' },
  { id: '5449767077127979601', fallback: '⭐', label: '⭐ 星星' },
  { id: '5357419756283924461', fallback: '👑', label: '👑 皇冠' },
  { id: '5461151367724015569', fallback: '💎', label: '💎 钻石' },
  { id: '5440539497383087970', fallback: '🎉', label: '🎉 庆祝' },
  { id: '5388823707011509811', fallback: '💰', label: '💰 金钱' },
  { id: '5346026631252222062', fallback: '🚀', label: '🚀 火箭' },
];

const STORAGE_KEY = 'custom_animated_emojis';
const CACHE_TTL = 60 * 1000;

let cachedEmojis: CustomAnimatedEmoji[] | null = null;
let cachedExists = false;
let cachedAt = 0;
let inFlight: Promise<{ emojis: CustomAnimatedEmoji[]; exists: boolean }> | null = null;

function normalizeEmoji(raw: any): CustomAnimatedEmoji | null {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;

  const fallback = typeof raw?.fallback === 'string' && raw.fallback.trim()
    ? raw.fallback.trim()
    : '⭐';
  const label = typeof raw?.label === 'string' && raw.label.trim()
    ? raw.label.trim()
    : `${fallback} 自定义表情`;
  const thumbnailRaw = typeof raw?.thumbnailFileId === 'string'
    ? raw.thumbnailFileId
    : raw?.thumbnail_file_id;
  const thumbnailFileId = typeof thumbnailRaw === 'string' && thumbnailRaw.trim()
    ? thumbnailRaw.trim()
    : undefined;

  return { id, fallback, label, thumbnailFileId };
}

export function normalizeCustomAnimatedEmojis(raw: any): CustomAnimatedEmoji[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const emojis: CustomAnimatedEmoji[] = [];

  for (const item of raw) {
    const emoji = normalizeEmoji(item);
    if (!emoji || seen.has(emoji.id)) continue;
    seen.add(emoji.id);
    emojis.push(emoji);
  }

  return emojis;
}

async function loadCustomAnimatedEmojiLibrary(): Promise<{ emojis: CustomAnimatedEmoji[]; exists: boolean }> {
  try {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = $1 LIMIT 1`,
      [STORAGE_KEY]
    );

    if (result.rows.length === 0) {
      return {
        emojis: DEFAULT_CUSTOM_ANIMATED_EMOJIS.map((emoji) => ({ ...emoji })),
        exists: false,
      };
    }

    let value = result.rows[0]?.value;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        value = null;
      }
    }

    return {
      emojis: normalizeCustomAnimatedEmojis(value),
      exists: true,
    };
  } catch (error: any) {
    if (error?.code === '42P01') {
      return {
        emojis: DEFAULT_CUSTOM_ANIMATED_EMOJIS.map((emoji) => ({ ...emoji })),
        exists: false,
      };
    }

    console.error('[custom-emojis] load failed:', error);
    return {
      emojis: DEFAULT_CUSTOM_ANIMATED_EMOJIS.map((emoji) => ({ ...emoji })),
      exists: false,
    };
  }
}

export async function getCustomAnimatedEmojiLibrary(): Promise<{ emojis: CustomAnimatedEmoji[]; exists: boolean }> {
  const now = Date.now();
  if (cachedEmojis && now - cachedAt < CACHE_TTL) {
    return {
      emojis: cachedEmojis.map((emoji) => ({ ...emoji })),
      exists: cachedExists,
    };
  }

  if (inFlight) return inFlight;

  inFlight = loadCustomAnimatedEmojiLibrary()
    .then((result) => {
      cachedEmojis = result.emojis.map((emoji) => ({ ...emoji }));
      cachedExists = result.exists;
      cachedAt = Date.now();
      inFlight = null;
      return {
        emojis: result.emojis.map((emoji) => ({ ...emoji })),
        exists: result.exists,
      };
    })
    .catch(() => {
      inFlight = null;
      return {
        emojis: (cachedEmojis || DEFAULT_CUSTOM_ANIMATED_EMOJIS).map((emoji) => ({ ...emoji })),
        exists: cachedExists,
      };
    });

  return inFlight;
}

export function invalidateCustomAnimatedEmojiCache() {
  cachedEmojis = null;
  cachedExists = false;
  cachedAt = 0;
  inFlight = null;
}
