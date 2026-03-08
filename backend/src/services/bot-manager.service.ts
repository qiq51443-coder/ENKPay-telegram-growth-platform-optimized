import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';
import { query } from '../db';

interface BotInstance {
  botId: string;
  token: string;
  defaultLanguage: string;
  telegraf: Telegraf;
}

interface User {
  id: string;
  bot_id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code: string;
  robot_user_id: string;
  unique_id?: string;
  invite_code: string;
  balance: number;
  [key: string]: any;
}

// Lazy-load bot i18n to avoid path issues at module load time
let _botI18n: {
  t: (lang: string, key: string) => string;
  isSupportedLang: (lang: string) => boolean;
  SUPPORTED_LANGUAGE_CODES: readonly string[];
} | null = null;

function getBotI18n() {
  if (!_botI18n) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _botI18n = require('../../../bot/src/i18n');
    } catch {
      _botI18n = {
        t: (_lang: string, key: string) => key,
        isSupportedLang: () => false,
        SUPPORTED_LANGUAGE_CODES: ['en', 'zh', 'fr', 'de', 'es', 'ar', 'ja'],
      };
    }
  }
  return _botI18n!;
}

function getUserLanguage(user: User): string {
  return user.language_code || 'en';
}

async function getOrCreateUser(ctx: Context, botId: string, inviteCode?: string): Promise<User> {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  const tgUser = ctx.from!;

  try {
    const response = await axios.get(`${backendUrl}/api/users/telegram/${tgUser.id}`, {
      params: { bot_id: botId },
    });
    return response.data.user;
  } catch (err: any) {
    if (err.response?.status === 404) {
      const createResponse = await axios.post(`${backendUrl}/api/users`, {
        telegram_id: tgUser.id,
        username: tgUser.username,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name,
        language_code: tgUser.language_code || 'en',
        bot_id: botId,
        invite_code: inviteCode,
      });
      return createResponse.data.user;
    }
    throw err;
  }
}

function setupBotHandlers(bot: Telegraf, botId: string, defaultLanguage: string) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';

  // Inject botId into every context
  bot.use((ctx, next) => {
    (ctx as any).botId = botId;
    return next();
  });

  // /start command
  bot.command('start', async (ctx) => {
    try {
      if (!ctx.from) return;

      const startPayload = ctx.message && 'text' in ctx.message
        ? ctx.message.text.split(' ')[1]
        : undefined;

      let inviteCodeUsed: string | undefined;
      if (startPayload && startPayload.startsWith('REF_')) {
        inviteCodeUsed = startPayload.substring(4);
      }

      const user = await getOrCreateUser(ctx, botId, inviteCodeUsed);

      // Language priority: user preference > bot default_language > 'en'
      const { isSupportedLang } = getBotI18n();
      let lang = user.language_code;
      if (!lang || !isSupportedLang(lang)) {
        lang = defaultLanguage;
      }
      if (!lang || !isSupportedLang(lang)) {
        lang = 'en';
      }

      let settings: Record<string, any> = {};
      try {
        const settingsRes = await axios.get(`${backendUrl}/api/settings/${botId}`);
        settings = settingsRes.data || {};
      } catch {}

      const { t } = getBotI18n();

      const welcomeText = settings.welcome_message ||
        `🎉 ${t(lang, 'welcome_title')}\n\n` +
        `🆔 ${t(lang, 'your_unique_id')}: <b>${user.unique_id || user.robot_user_id || 'N/A'}</b>\n` +
        `💰 ${t(lang, 'your_balance')}: <b>${(user.balance || 0).toFixed(2)}</b>\n\n` +
        t(lang, 'welcome_description');

      const webAppUrl = settings.webapp_url || process.env.WEBAPP_URL || 'https://example.com';

      await ctx.replyWithHTML(welcomeText, Markup.keyboard([
        [Markup.button.text(t(lang, 'btn_my_wallet')), Markup.button.text(t(lang, 'btn_invite'))],
        [Markup.button.webApp(t(lang, 'btn_open_app'), webAppUrl)],
      ]).resize());
    } catch (error) {
      console.error(`[bot ${botId}] Start handler error:`, error);
      try { await ctx.reply('An error occurred. Please try again.'); } catch {}
    }
  });

  // Text message handler (menu navigation)
  bot.on(message('text'), async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx, botId);
      const { isSupportedLang, t, SUPPORTED_LANGUAGE_CODES } = getBotI18n();
      let lang = user.language_code;
      if (!lang || !isSupportedLang(lang)) lang = defaultLanguage;
      if (!lang || !isSupportedLang(lang)) lang = 'en';

      const text = ctx.message.text;
      const ALL_LANGS = Array.from(SUPPORTED_LANGUAGE_CODES);

      const walletButtons = ALL_LANGS.map(l => t(l, 'btn_my_wallet'));
      const inviteButtons = ALL_LANGS.map(l => t(l, 'btn_invite'));

      if (walletButtons.includes(text)) {
        await handleWallet(ctx, botId, user, lang);
        return;
      }

      if (inviteButtons.includes(text)) {
        await handleInvite(ctx, botId, user, lang);
        return;
      }
    } catch (error) {
      console.error(`[bot ${botId}] Text message error:`, error);
    }
  });

  // Callback query handler
  bot.on('callback_query', async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx, botId);
      const { isSupportedLang, t } = getBotI18n();
      let lang = user.language_code;
      if (!lang || !isSupportedLang(lang)) lang = defaultLanguage;
      if (!lang || !isSupportedLang(lang)) lang = 'en';

      const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';

      // Language selection
      if (data.startsWith('lang_')) {
        const newLang = data.split('_')[1];
        try {
          await axios.put(`${backendUrl}/api/users/${user.id}`, { language_code: newLang });
          await ctx.answerCbQuery(t(newLang, 'language_changed') || 'Language updated!');
        } catch {
          await ctx.answerCbQuery('Language updated!');
        }
        return;
      }

      if (data === 'wallet_deposit' || data === 'wallet_withdraw' ||
          data === 'wallet_transfer' || data === 'wallet_support' ||
          data === 'wallet_language' || data === 'wallet_back' ||
          data === 'wallet_back_to_wallet' || data === 'deposit_back' ||
          data === 'withdraw_back' || data === 'transfer_back' ||
          data === 'language_back' || data === 'support_back') {
        await ctx.answerCbQuery();
        if (data === 'wallet_back') {
          // Show start menu
          const { isSupportedLang: isl, t: tr } = getBotI18n();
          let l = user.language_code;
          if (!l || !isl(l)) l = defaultLanguage;
          if (!l || !isl(l)) l = 'en';
          let settings: Record<string, any> = {};
          try {
            const sr = await axios.get(`${backendUrl}/api/settings/${botId}`);
            settings = sr.data || {};
          } catch {}
          const welcomeText = settings.welcome_message ||
            `🎉 ${tr(l, 'welcome_title')}\n\n` +
            `🆔 ${tr(l, 'your_unique_id')}: <b>${user.unique_id || user.robot_user_id || 'N/A'}</b>\n` +
            `💰 ${tr(l, 'your_balance')}: <b>${(user.balance || 0).toFixed(2)}</b>\n\n` +
            tr(l, 'welcome_description');
          const webAppUrl = settings.webapp_url || process.env.WEBAPP_URL || 'https://example.com';
          await ctx.replyWithHTML(welcomeText, Markup.keyboard([
            [Markup.button.text(tr(l, 'btn_my_wallet')), Markup.button.text(tr(l, 'btn_invite'))],
            [Markup.button.webApp(tr(l, 'btn_open_app'), webAppUrl)],
          ]).resize());
        } else {
          await handleWallet(ctx, botId, user, lang);
        }
        return;
      }

      await ctx.answerCbQuery();
    } catch (error) {
      console.error(`[bot ${botId}] Callback query error:`, error);
      try { await ctx.answerCbQuery('An error occurred'); } catch {}
    }
  });

  bot.catch((err, ctx) => {
    console.error(`[bot ${botId}] Unhandled error:`, err);
  });
}

async function handleWallet(ctx: Context, botId: string, user: User, lang: string) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  const { t } = getBotI18n();

  let settings: Record<string, any> = {};
  try {
    const settingsRes = await axios.get(`${backendUrl}/api/settings/${botId}`);
    settings = settingsRes.data || {};
  } catch {}

  const supportButton = settings.support_telegram
    ? [Markup.button.url(t(lang, 'btn_support'), `https://t.me/${settings.support_telegram}`)]
    : [Markup.button.callback(t(lang, 'btn_support'), 'wallet_support')];

  await ctx.reply(
    t(lang, 'wallet_title') || '💼 My Wallet',
    Markup.inlineKeyboard([
      [
        Markup.button.callback(t(lang, 'btn_deposit'), 'wallet_deposit'),
        Markup.button.callback(t(lang, 'btn_withdraw'), 'wallet_withdraw'),
      ],
      [Markup.button.callback(t(lang, 'btn_transfer'), 'wallet_transfer')],
      supportButton,
      [Markup.button.callback(t(lang, 'btn_language'), 'wallet_language')],
      [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back')],
    ])
  );
}

async function handleInvite(ctx: Context, botId: string, user: User, lang: string) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  const { t } = getBotI18n();

  let settings: Record<string, any> = {};
  try {
    const settingsRes = await axios.get(`${backendUrl}/api/settings/${botId}`);
    settings = settingsRes.data || {};
  } catch {}

  const botUsername = settings.bot_username || process.env.BOT_USERNAME || 'your_bot';
  const uniqueId = user.unique_id || user.robot_user_id || user.invite_code;
  const inviteLink = `https://t.me/${botUsername}?start=REF_${uniqueId}`;
  const shareText = `${t(lang, 'invite_title')}\n\n${t(lang, 'invite_description')}\n\n${inviteLink}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

  await ctx.replyWithHTML(
    `${t(lang, 'invite_title')}\n\n🔗 ${t(lang, 'invite_link')}: <code>${inviteLink}</code>`,
    Markup.inlineKeyboard([
      [Markup.button.url(t(lang, 'btn_share'), shareUrl)],
    ])
  );
}

class BotManager {
  private bots = new Map<string, BotInstance>();

  async loadAllBots(): Promise<void> {
    try {
      const result = await query(
        'SELECT id, token, default_language FROM bots WHERE is_active = true'
      );

      for (const row of result.rows) {
        await this.addBot(row.id, row.token, row.default_language || 'en');
      }

      console.log(`✓ BotManager: loaded ${this.bots.size} active bot(s)`);
    } catch (error) {
      console.error('BotManager loadAllBots error:', error);
    }
  }

  async registerWebhooksIfNeeded(): Promise<void> {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      console.log('BotManager: BACKEND_URL not set, skipping auto webhook registration');
      return;
    }

    let registered = 0;
    for (const [botId, instance] of this.bots) {
      try {
        // Check if webhook_url is already set in DB
        const result = await query(
          'SELECT webhook_url, token FROM bots WHERE id = $1',
          [botId]
        );
        if (result.rows.length === 0) continue;

        const { webhook_url, token } = result.rows[0];
        if (webhook_url) {
          // Already has a webhook registered
          continue;
        }

        // Register webhook with Telegram
        const webhookUrl = `${backendUrl}/webhook/${botId}`;
        const telegramApiUrl = `https://api.telegram.org/bot${token}/setWebhook`;

        const response = await axios.post(telegramApiUrl, {
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query', 'chat_member'],
        });

        if (response.data?.ok) {
          // Update webhook_url in database
          await query(
            'UPDATE bots SET webhook_url = $1 WHERE id = $2',
            [webhookUrl, botId]
          );
          console.log(`BotManager: auto-registered webhook for bot ${botId} → ${webhookUrl}`);
          registered++;
        } else {
          console.warn(`BotManager: failed to register webhook for bot ${botId}:`, response.data);
        }
      } catch (err: any) {
        const detail = err.response
          ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
          : err.message;
        console.error(`BotManager: error registering webhook for bot ${botId}:`, detail);
      }
    }

    if (registered > 0) {
      console.log(`✓ BotManager: auto-registered webhooks for ${registered} bot(s)`);
    } else {
      console.log('BotManager: all bots already have webhooks configured');
    }
  }

  async addBot(botId: string, token?: string, defaultLanguage?: string): Promise<void> {
    if (this.bots.has(botId)) {
      return;
    }

    try {
      let resolvedToken = token;
      let resolvedLang = defaultLanguage || 'en';

      if (!resolvedToken) {
        const result = await query(
          'SELECT token, default_language FROM bots WHERE id = $1 AND is_active = true',
          [botId]
        );
        if (result.rows.length === 0) {
          console.warn(`BotManager: bot ${botId} not found or not active`);
          return;
        }
        resolvedToken = result.rows[0].token;
        resolvedLang = result.rows[0].default_language || 'en';
      }

      const telegraf = new Telegraf(resolvedToken as string);
      setupBotHandlers(telegraf, botId, resolvedLang);

      this.bots.set(botId, {
        botId,
        token: resolvedToken as string,
        defaultLanguage: resolvedLang,
        telegraf,
      });

      console.log(`BotManager: added bot ${botId}`);

      // Auto-register webhook if BACKEND_URL is set and webhook is not already registered
      const backendUrl = process.env.BACKEND_URL;
      if (backendUrl) {
        try {
          const webhookResult = await query(
            'SELECT webhook_url FROM bots WHERE id = $1',
            [botId]
          );
          const existingWebhook = webhookResult.rows[0]?.webhook_url;
          if (!existingWebhook || existingWebhook.trim() === '') {
            const webhookTarget = `${backendUrl}/webhook/${botId}`;
            const telegramRes = await axios.post(
              `https://api.telegram.org/bot${resolvedToken}/setWebhook`,
              { url: webhookTarget }
            );
            if (telegramRes.data?.ok) {
              await query(
                'UPDATE bots SET webhook_url = $1 WHERE id = $2',
                [webhookTarget, botId]
              );
              console.log(`BotManager: auto-registered webhook for bot ${botId}: ${webhookTarget}`);
            } else {
              console.warn(`BotManager: Telegram setWebhook failed for bot ${botId}:`, telegramRes.data);
            }
          }
        } catch (webhookError) {
          console.error(`BotManager: failed to auto-register webhook for bot ${botId}:`, webhookError);
        }
      }
    } catch (error) {
      console.error(`BotManager: failed to add bot ${botId}:`, error);
    }
  }

  async removeBot(botId: string): Promise<void> {
    const instance = this.bots.get(botId);
    if (!instance) return;

    try {
      instance.telegraf.stop();
    } catch {}

    this.bots.delete(botId);
    console.log(`BotManager: removed bot ${botId}`);
  }

  async handleUpdate(botId: string, update: any): Promise<void> {
    let instance = this.bots.get(botId);

    if (!instance) {
      // Bot not loaded yet - try to load on demand
      console.log(`[BotManager] handleUpdate: bot ${botId} not in memory, loading on demand...`);
      await this.addBot(botId);
      instance = this.bots.get(botId);
    }

    if (!instance) {
      console.error(`[BotManager] handleUpdate: bot ${botId} could not be loaded (not found or inactive)`);
      throw new Error(`Bot ${botId} not found or not active`);
    }

    try {
      await instance.telegraf.handleUpdate(update);
    } catch (err: any) {
      console.error(`[BotManager] handleUpdate error for bot ${botId}:`, err?.message || err);
      throw err;
    }
  }

  getDefaultLanguage(botId: string): string {
    return this.bots.get(botId)?.defaultLanguage || 'en';
  }

  getBotCount(): number {
    return this.bots.size;
  }
}

export const botManager = new BotManager();
