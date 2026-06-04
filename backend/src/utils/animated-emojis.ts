/**
 * Telegram Animated Custom Emoji utilities.
 *
 * Each entry maps a plain emoji character to its Telegram custom_emoji_id.
 *
 * IMPORTANT:
 * - Replace "0" placeholder IDs with real values before enabling in production.
 * - If ENABLE_ANIMATED_EMOJIS is not "true", all helpers safely return plain emoji text.
 *
 * How to fetch/update real IDs:
 * 1) Call Telegram Bot API:
 *    https://api.telegram.org/bot{TOKEN}/getStickerSet?name=AnimatedEmojies
 *    (optionally also AnimatedEmojiesReactionsPack)
 * 2) In the response, find matching emoji and copy sticker.custom_emoji_id
 * 3) Update this map and deploy with ENABLE_ANIMATED_EMOJIS=true
 *
 * Alternative:
 * - Use @getidsbot and send target emoji/sticker to read custom_emoji_id.
 */
export const ANIMATED_EMOJI_IDS: Record<string, string> = {
  '🎁': '0',
  '🧧': '0',
  '💰': '0',
  '📊': '0',
  '⏳': '0',
  '⚠️': '0',
  '✅': '0',
  '📌': '0',
  '⏰': '0',
  '🕙': '0',
  '✨': '0',
  '👥': '0',
  '🎉': '0',
};

function isAnimatedEmojisEnabled(): boolean {
  return process.env.ENABLE_ANIMATED_EMOJIS === 'true';
}

/**
 * Returns animated <tg-emoji> tag if animated emojis are enabled,
 * otherwise returns the plain emoji character.
 */
export function ae(emoji: string, customId?: string): string {
  if (!isAnimatedEmojisEnabled()) return emoji;
  const id = customId || ANIMATED_EMOJI_IDS[emoji];
  if (!id) return emoji;
  return `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`;
}

/**
 * Replace all known static emojis in a template string with animated versions.
 * Only replaces emojis that exist in ANIMATED_EMOJI_IDS map.
 */
export function animateEmojis(text: string): string {
  if (!isAnimatedEmojisEnabled()) return text;

  let result = text;
  const entries = Object.entries(ANIMATED_EMOJI_IDS)
    .filter(([, id]) => Boolean(id))
    .sort((a, b) => b[0].length - a[0].length);

  for (const [emoji, id] of entries) {
    const escaped = emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(escaped, 'g'),
      `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`
    );
  }

  return result;
}
