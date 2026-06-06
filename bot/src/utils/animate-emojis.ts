import { fetchEmojiMappings } from '../services/api';

const CACHE_TTL = 60 * 1000;
const TG_EMOJI_TAG_RE = /<tg-emoji\b[^>]*>[\s\S]*?<\/tg-emoji>/gi;

let cachedMappings: Record<string, string> | null = null;
let cachedAt = 0;
let inFlight: Promise<Record<string, string>> | null = null;

async function getMappings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedMappings && now - cachedAt < CACHE_TTL) return cachedMappings;
  if (inFlight) return inFlight;

  inFlight = fetchEmojiMappings()
    .then((mappings) => {
      cachedMappings = mappings || {};
      cachedAt = Date.now();
      inFlight = null;
      return cachedMappings;
    })
    .catch(() => {
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

export async function animateEmojis(text: string): Promise<string> {
  const mappings = await getMappings();
  if (Object.keys(mappings).length === 0) return text;
  return replaceOutsideTelegramEmojiTags(text, mappings);
}
