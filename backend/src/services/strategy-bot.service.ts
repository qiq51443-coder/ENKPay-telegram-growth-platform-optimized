import axios from 'axios';
import { query } from '../db';
import { getNextPeriod } from './period.service';

const TELEGRAM_BASE = 'https://api.telegram.org';

type LanguageCode = 'zh' | 'en' | 'ja' | 'ko' | 'ru' | 'ar' | 'es' | 'fr' | 'de' | 'pt' | 'vi' | 'th';

export const I18N_LABELS: Record<string, Record<LanguageCode, string>> = {
  up: { zh: '买涨 ▲', en: 'Buy Up ▲', ja: '上昇 ▲', ko: '상승 ▲', ru: 'Вверх ▲', ar: 'شراء صعود ▲', es: 'Comprar Subida ▲', fr: 'Acheter Hausse ▲', de: 'Kaufen Aufwärts ▲', pt: 'Comprar Alta ▲', vi: 'Mua Tăng ▲', th: 'ซื้อขึ้น ▲' },
  down: { zh: '买跌 ▼', en: 'Buy Down ▼', ja: '下落 ▼', ko: '하락 ▼', ru: 'Вниз ▼', ar: 'شراء هبوط ▼', es: 'Comprar Bajada ▼', fr: 'Acheter Baisse ▼', de: 'Kaufen Abwärts ▼', pt: 'Comprar Baixa ▼', vi: 'Mua Giảm ▼', th: 'ซื้อลง ▼' },
  issue: { zh: '期号', en: 'Issue', ja: '期番号', ko: '기번호', ru: 'Выпуск', ar: 'الإصدار', es: 'Emisión', fr: 'Numéro', de: 'Ausgabe', pt: 'Emissão', vi: 'Kỳ số', th: 'รอบ' },
  probability: { zh: '概率', en: 'Probability', ja: '確率', ko: '확률', ru: 'Вероятность', ar: 'الاحتمالية', es: 'Probabilidad', fr: 'Probabilité', de: 'Wahrscheinlichkeit', pt: 'Probabilidade', vi: 'Xác suất', th: 'ความน่าจะเป็น' },
  signal: { zh: '建议', en: 'Signal', ja: '推奨', ko: '추천', ru: 'Сигнал', ar: 'الإشارة', es: 'Señal', fr: 'Signal', de: 'Signal', pt: 'Sinal', vi: 'Tín hiệu', th: 'สัญญาณ' },
  timeframe_min: { zh: '分钟', en: 'Min', ja: '分', ko: '분', ru: 'мин', ar: 'دقيقة', es: 'Min', fr: 'Min', de: 'Min', pt: 'Min', vi: 'phút', th: 'นาที' },
};

interface StrategyBotRecord {
  id: string;
  bot_token: string;
  bot_name: string | null;
  username: string | null;
  is_active: boolean;
}

interface StrategyConfigRecord {
  id: string;
  strategy_bot_id: string;
  name: string;
  is_active: boolean;
  auto_send_daily: boolean;
  coin_rotation: any;
  send_times: any;
  custom_text: string | null;
  custom_text_translations: any;
  media_url: string | null;
  media_telegram_file_id: string | null;
  target_group_ids: any;
  current_coin_index: number;
}

interface StrategyBotGroup {
  id: string;
  strategy_bot_id: string;
  chat_id: string;
  chat_title: string | null;
  language: string | null;
  is_active: boolean;
}

interface CoinRotationItem {
  pair_id?: string;
  symbol?: string;
  display_name?: string;
  time_frame?: number;
}

function toTextArray(input: any): string[] {
  if (Array.isArray(input)) return input.map((v) => String(v)).filter(Boolean);
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed.map((v) => String(v)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toCoinRotation(input: any): CoinRotationItem[] {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toTranslations(input: any): Record<string, string> {
  if (!input) return {};
  if (typeof input === 'object' && !Array.isArray(input)) return input as Record<string, string>;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function htmlEscape(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeLanguage(lang?: string | null): LanguageCode {
  const value = (lang || 'zh').toLowerCase() as LanguageCode;
  return I18N_LABELS.up[value] ? value : 'zh';
}

async function telegramPost(botToken: string, method: string, payload: Record<string, any>) {
  const response = await axios.post(`${TELEGRAM_BASE}/bot${botToken}/${method}`, payload, { timeout: 15000 });
  if (!response.data?.ok) {
    throw new Error(response.data?.description || `Telegram ${method} failed`);
  }
  return response.data.result;
}

function isGifMedia(url: string): boolean {
  return /\.gif(\?|$)/i.test(url);
}

async function sendMediaByFileId(botToken: string, chatId: string, fileId: string, caption: string) {
  try {
    return await telegramPost(botToken, 'sendPhoto', {
      chat_id: chatId,
      photo: fileId,
      caption,
      parse_mode: 'HTML',
    });
  } catch {
    return telegramPost(botToken, 'sendAnimation', {
      chat_id: chatId,
      animation: fileId,
      caption,
      parse_mode: 'HTML',
    });
  }
}

async function sendMediaByUrl(botToken: string, chatId: string, mediaUrl: string, caption: string) {
  const primaryMethod = isGifMedia(mediaUrl) ? 'sendAnimation' : 'sendPhoto';
  const primaryField = primaryMethod === 'sendAnimation' ? 'animation' : 'photo';
  const fallbackMethod = primaryMethod === 'sendAnimation' ? 'sendPhoto' : 'sendAnimation';
  const fallbackField = fallbackMethod === 'sendAnimation' ? 'animation' : 'photo';

  try {
    return await telegramPost(botToken, primaryMethod, {
      chat_id: chatId,
      [primaryField]: mediaUrl,
      caption,
      parse_mode: 'HTML',
    });
  } catch {
    return telegramPost(botToken, fallbackMethod, {
      chat_id: chatId,
      [fallbackField]: mediaUrl,
      caption,
      parse_mode: 'HTML',
    });
  }
}

function extractTelegramFileId(result: any): string | null {
  if (result?.animation?.file_id) return result.animation.file_id;
  if (Array.isArray(result?.photo) && result.photo.length > 0) {
    return result.photo[result.photo.length - 1]?.file_id || null;
  }
  return null;
}

async function writeStrategyAuditLog(details: Record<string, any>) {
  const detailsJson = JSON.stringify(details);
  try {
    await query(
      `INSERT INTO audit_logs (action, details, created_at)
       VALUES ('strategy_send', $1::jsonb, NOW())`,
      [detailsJson]
    );
    return;
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (!msg.includes('relation "audit_logs" does not exist')) {
      throw err;
    }
  }

  await query(
    `INSERT INTO admin_audit_logs (admin_user_id, action, resource_type, resource_id, details, created_at)
     VALUES (NULL, 'strategy_send', 'strategy_config', $1, $2::jsonb, NOW())`,
    [String(details.configId || ''), detailsJson]
  );
}

export async function sendStrategyMessage(configId: string) {
  const configRes = await query(
    `SELECT
      sc.*,
      sb.id AS sb_id,
      sb.bot_token,
      sb.bot_name,
      sb.username,
      sb.is_active AS bot_active
    FROM strategy_configs sc
    JOIN strategy_bots sb ON sc.strategy_bot_id = sb.id
    WHERE sc.id = $1`,
    [configId]
  );

  if (configRes.rows.length === 0) {
    throw new Error(`Strategy config ${configId} not found`);
  }

  const row = configRes.rows[0] as StrategyConfigRecord & StrategyBotRecord & { bot_active: boolean };

  const coinRotation = toCoinRotation(row.coin_rotation);
  const targetGroupIds = toTextArray(row.target_group_ids);

  if (!row.is_active) throw new Error('Strategy config is inactive');
  if (!row.strategy_bot_id) throw new Error('Strategy config has no strategy bot');
  if (!row.bot_active) throw new Error('Strategy bot is inactive');
  if (coinRotation.length === 0) throw new Error('coin_rotation is empty');
  if (targetGroupIds.length === 0) throw new Error('target_group_ids is empty');

  const currentIndex = Math.max(0, Number(row.current_coin_index) || 0);
  const selectedCoin = coinRotation[currentIndex % coinRotation.length] || coinRotation[0];

  const symbolRaw = selectedCoin.display_name || selectedCoin.symbol || 'N/A';
  const timeFrame = Number(selectedCoin.time_frame || 60);
  const periodInfo = getNextPeriod(timeFrame);
  const periodLabel = periodInfo.periodLabel;

  const direction = Math.random() < 0.5 ? 'up' : 'down';
  const probability = 60 + Math.floor(Math.random() * 31);

  const groupsRes = await query(
    `SELECT * FROM strategy_bot_groups
     WHERE strategy_bot_id = $1
       AND chat_id = ANY($2::text[])
       AND is_active = true`,
    [row.strategy_bot_id, targetGroupIds]
  );

  const groups = groupsRes.rows as StrategyBotGroup[];
  if (groups.length === 0) {
    throw new Error('No active groups matched target_group_ids');
  }

  const translations = toTranslations(row.custom_text_translations);
  const timeframeMinutes = Math.max(1, Math.floor(timeFrame / 60));

  let cachedFileId = row.media_telegram_file_id || null;
  let successCount = 0;

  for (const group of groups) {
    const lang = normalizeLanguage(group.language);
    const labels = {
      issue: I18N_LABELS.issue[lang],
      signal: I18N_LABELS.signal[lang],
      probability: I18N_LABELS.probability[lang],
      direction: I18N_LABELS[direction][lang],
      timeframeUnit: I18N_LABELS.timeframe_min[lang],
    };

    const customText =
      lang === 'zh'
        ? (row.custom_text || '')
        : (translations[lang] ?? row.custom_text ?? '');

    const messageText = [
      `📊 ${htmlEscape(String(symbolRaw))} · ${timeframeMinutes}${labels.timeframeUnit}`,
      '',
      `🔢 ${labels.issue}：${htmlEscape(periodLabel)}`,
      `${labels.signal}：${labels.direction}`,
      `🎯 ${labels.probability}：${probability}%`,
      '',
      `💬 ${customText || ''}`,
    ].join('\n');

    try {
      if (cachedFileId) {
        await sendMediaByFileId(row.bot_token, group.chat_id, cachedFileId, messageText);
      } else if (row.media_url) {
        const result = await sendMediaByUrl(row.bot_token, group.chat_id, row.media_url, messageText);
        const newFileId = extractTelegramFileId(result);
        if (newFileId && !cachedFileId) {
          cachedFileId = newFileId;
          await query('UPDATE strategy_configs SET media_telegram_file_id = $1, updated_at = NOW() WHERE id = $2', [newFileId, row.id]);
        }
      } else {
        await telegramPost(row.bot_token, 'sendMessage', {
          chat_id: group.chat_id,
          text: messageText,
          parse_mode: 'HTML',
        });
      }
      successCount += 1;
    } catch (err: any) {
      console.error(`[strategy-send] Failed for group ${group.chat_id}:`, err.message || err);
    }
  }

  const nextIndex = (currentIndex + 1) % coinRotation.length;
  await query(
    'UPDATE strategy_configs SET current_coin_index = $1, updated_at = NOW() WHERE id = $2',
    [nextIndex, row.id]
  );

  await writeStrategyAuditLog({
    configId: row.id,
    configName: row.name,
    periodLabel,
    direction,
    probability,
    groupCount: successCount,
    coin: {
      pair_id: selectedCoin.pair_id || null,
      symbol: selectedCoin.symbol || null,
      display_name: selectedCoin.display_name || null,
      time_frame: timeFrame,
    },
  });

  return {
    configId: row.id,
    periodLabel,
    direction,
    probability,
    groupCount: successCount,
    currentCoinIndex: nextIndex,
  };
}
