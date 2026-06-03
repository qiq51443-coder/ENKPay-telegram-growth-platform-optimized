import { query } from '../db';

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
}

export const DEFAULT_EMOJI_CONFIG: EmojiConfig = {
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
};

const CACHE_TTL = 60 * 1000;
let cachedConfig: EmojiConfig | null = null;
let cachedAt = 0;
let inFlight: Promise<EmojiConfig> | null = null;

function normalizeConfig(raw: any): EmojiConfig {
  const merged = { ...DEFAULT_EMOJI_CONFIG, ...(raw || {}) } as Record<string, any>;
  const out: Record<string, any> = { ...DEFAULT_EMOJI_CONFIG };

  for (const key of Object.keys(DEFAULT_EMOJI_CONFIG) as Array<keyof EmojiConfig>) {
    if (key === 'header_enabled') {
      out[key] = Boolean(merged[key]);
      continue;
    }
    out[key] = typeof merged[key] === 'string' ? merged[key] : DEFAULT_EMOJI_CONFIG[key];
  }

  return out as EmojiConfig;
}

async function loadConfig(): Promise<EmojiConfig> {
  try {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'bot_message_emoji_config' LIMIT 1`
    );

    if (result.rows.length === 0) {
      return { ...DEFAULT_EMOJI_CONFIG };
    }

    let value = result.rows[0]?.value;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        value = null;
      }
    }

    return normalizeConfig(value);
  } catch (error: any) {
    if (error?.code === '42P01') return { ...DEFAULT_EMOJI_CONFIG };
    console.error('[emoji-config] load failed:', error);
    return { ...DEFAULT_EMOJI_CONFIG };
  }
}

export async function getBotMessageEmojiConfig(): Promise<EmojiConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL) return cachedConfig;
  if (inFlight) return inFlight;

  inFlight = loadConfig()
    .then((config) => {
      cachedConfig = config;
      cachedAt = Date.now();
      inFlight = null;
      return config;
    })
    .catch(() => {
      inFlight = null;
      return cachedConfig || { ...DEFAULT_EMOJI_CONFIG };
    });

  return inFlight;
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

export function getEmoji(config: EmojiConfig, field: keyof EmojiConfig | string): string {
  const value = (config as any)?.[field];
  if (typeof value === 'string' && value.trim()) return value;
  return (DEFAULT_EMOJI_CONFIG as any)[field] || '';
}
