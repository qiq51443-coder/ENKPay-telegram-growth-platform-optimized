import { getSystemSetting } from '../services/api';

export interface EmojiConfig {
  header_enabled: boolean;
  header_emoji_id: string;
  header_emoji_fallback: string;
  header_text: string;
  emoji_success: string;
  emoji_reject: string;
  emoji_pending: string;
  emoji_warning: string;
  field_order_id: string;
  field_network: string;
  field_amount: string;
  field_address: string;
  field_time: string;
  field_fee: string;
  field_balance: string;
  field_wallet_title: string;
  field_id: string;
  field_nft: string;
  field_redpacket: string;
  field_account_status: string;
  field_txhash: string;
  field_deposit: string;
  field_withdraw: string;
  field_transfer_send: string;
  field_transfer_recv: string;
  field_min: string;
  notify_gift: string;
  notify_people: string;
  notify_sparkles: string;
  notify_alarm: string;
  notify_pin: string;
  notify_clock: string;
  notify_memo: string;
  notify_number: string;
  notify_target: string;
  notify_speech: string;
}

const DEFAULT_EMOJI_CONFIG: EmojiConfig = {
  header_enabled: false,
  header_emoji_id: '',
  header_emoji_fallback: '💎',
  header_text: 'ENKPAY',
  emoji_success: '✅',
  emoji_reject: '❌',
  emoji_pending: '⏳',
  emoji_warning: '⚠️',
  field_order_id: '📋',
  field_network: '🌐',
  field_amount: '💰',
  field_address: '📍',
  field_time: '🕐',
  field_fee: '💸',
  field_balance: '💳',
  field_wallet_title: '💰',
  field_id: '🆔',
  field_nft: '💎',
  field_redpacket: '🧧',
  field_account_status: '📊',
  field_txhash: '🔗',
  field_deposit: '📥',
  field_withdraw: '📤',
  field_transfer_send: '📤',
  field_transfer_recv: '💰',
  field_min: '💡',
  notify_gift: '🎁',
  notify_people: '👥',
  notify_sparkles: '✨',
  notify_alarm: '⏰',
  notify_pin: '📌',
  notify_clock: '🕙',
  notify_memo: '📝',
  notify_number: '🔢',
  notify_target: '🎯',
  notify_speech: '💬',
};

const CACHE_TTL = 60 * 1000;
let cache: { at: number; data: EmojiConfig } | null = null;

export async function getBotMessageEmojiConfig(): Promise<EmojiConfig> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL) return cache.data;

  try {
    const raw = await getSystemSetting('bot_message_emoji_config');
    let parsed: any = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
    }
    const data = {
      ...DEFAULT_EMOJI_CONFIG,
      ...(parsed || {}),
      header_enabled: Boolean(parsed?.header_enabled),
    } as EmojiConfig;
    cache = { at: now, data };
    return data;
  } catch {
    return { ...DEFAULT_EMOJI_CONFIG };
  }
}

export function renderHeader(config: EmojiConfig): string {
  if (!config.header_enabled) return '';
  const emoji = config.header_emoji_id
    ? `<tg-emoji emoji-id="${config.header_emoji_id}">${config.header_emoji_fallback || ''}</tg-emoji>`
    : (config.header_emoji_fallback || '');
  const text = (config.header_text || '').trim();
  if (!emoji && !text) return '';
  const titlePart = text ? `${emoji ? `${emoji} ` : ''}<b>${text}</b>` : emoji;
  return `${titlePart}\n──────\n`;
}

export function renderHeaderTitle(
  config: EmojiConfig,
  field: keyof EmojiConfig | string,
  title: string
): string {
  const header = renderHeader(config);
  const prefix = header ? '' : `${getEmoji(config, field)} `;
  return `${header}${prefix}<b>${title}</b>`;
}

export function getEmoji(config: EmojiConfig, field: keyof EmojiConfig | string): string {
  const value = (config as any)?.[field];
  if (typeof value === 'string' && value.trim()) return value;
  return (DEFAULT_EMOJI_CONFIG as any)[field] || '';
}
