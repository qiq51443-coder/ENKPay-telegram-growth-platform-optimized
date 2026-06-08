import { query } from '../db';
import TelegramAPI from './telegram';

export interface CrossBotRecipient {
  user_id: string;
  bot_id: string;
  bot_token: string;
  telegram_id: number;
  language_code: string;
}

const SUPPORTED_LANGS = new Set(['zh', 'en', 'fr', 'de', 'es', 'ar', 'ja', 'ru', 'pt']);

export function normalizeNotificationLang(raw?: string | null): string {
  const value = String(raw || '').toLowerCase();
  if (!value) return 'en';
  if (value.startsWith('zh')) return 'zh';
  if (value.startsWith('fr')) return 'fr';
  if (value.startsWith('de')) return 'de';
  if (value.startsWith('es')) return 'es';
  if (value.startsWith('ar')) return 'ar';
  if (value.startsWith('ja')) return 'ja';
  if (value.startsWith('ru')) return 'ru';
  if (value.startsWith('pt')) return 'pt';
  const base = value.split('-')[0];
  return SUPPORTED_LANGS.has(base) ? base : 'en';
}

export async function getCrossBotRecipientsByUserId(userId: string | number): Promise<CrossBotRecipient[]> {
  const userResult = await query(
    'SELECT telegram_id FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  if (userResult.rows.length === 0 || !userResult.rows[0].telegram_id) return [];
  return getCrossBotRecipientsByTelegramId(Number(userResult.rows[0].telegram_id));
}

export async function getCrossBotRecipientsByTelegramId(telegramId: number): Promise<CrossBotRecipient[]> {
  if (!telegramId) return [];
  const result = await query(
    `SELECT DISTINCT ON (u.bot_id)
        u.id::text AS user_id,
        u.bot_id::text AS bot_id,
        b.token AS bot_token,
        u.telegram_id,
        COALESCE(u.language_code, 'en') AS language_code
     FROM users u
     JOIN bots b ON b.id = u.bot_id
     WHERE u.telegram_id = $1
       AND u.telegram_id IS NOT NULL
       AND b.is_active = true
       AND b.token IS NOT NULL
     ORDER BY u.bot_id, u.created_at ASC`,
    [telegramId]
  );
  return result.rows as CrossBotRecipient[];
}

export async function sendCrossBotNotification(params: {
  userId: string | number;
  buildMessage: (lang: string, recipient: CrossBotRecipient) => Promise<string> | string;
  parseMode?: 'HTML' | 'MarkdownV2';
}): Promise<void> {
  const recipients = await getCrossBotRecipientsByUserId(params.userId);
  if (recipients.length === 0) return;

  const sent = new Set<string>();
  for (const recipient of recipients) {
    const dedupeKey = `${recipient.bot_id}:${recipient.telegram_id}`;
    if (sent.has(dedupeKey)) continue;
    sent.add(dedupeKey);

    try {
      const lang = normalizeNotificationLang(recipient.language_code);
      const text = await params.buildMessage(lang, recipient);
      if (!text || !text.trim()) continue;
      const tg = new TelegramAPI(recipient.bot_token);
      await tg.sendMessage(recipient.telegram_id, text, {
        parse_mode: params.parseMode || 'HTML',
      });
    } catch (error: any) {
      console.error(
        `[cross-bot-notify] failed for user=${params.userId} bot=${recipient.bot_id}:`,
        error?.message || error
      );
    }
  }
}
