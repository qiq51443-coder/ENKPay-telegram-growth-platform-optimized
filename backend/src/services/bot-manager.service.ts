import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';
import { query } from '../db';
import { t, isSupportedLang, SUPPORTED_LANGUAGE_CODES } from '../i18n';

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

async function getOrCreateUser(ctx: Context, botId: string, inviteCodeUsed?: string): Promise<User> {
  const tgUser = ctx.from!;

  // Try to find existing user for this specific bot
  const existing = await query(
    'SELECT * FROM users WHERE telegram_id = $1 AND bot_id = $2',
    [tgUser.id, botId]
  );
  if (existing.rows.length > 0) {
    // Update username/name if changed
    await query(
      'UPDATE users SET username = $1, first_name = $2, last_name = $3, last_active_at = NOW() WHERE id = $4',
      [tgUser.username || null, tgUser.first_name || null, tgUser.last_name || null, existing.rows[0].id]
    );
    return existing.rows[0];
  }

  // Check if user exists for ANY other bot (cross-bot unification)
  const existingAnyBot = await query(
    'SELECT * FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1',
    [tgUser.id]
  );

  // Resolve inviter
  let invitedBy = null;
  if (inviteCodeUsed) {
    const inviterResult = await query(
      'SELECT id FROM users WHERE invite_code = $1',
      [inviteCodeUsed]
    );
    if (inviterResult.rows.length > 0) {
      invitedBy = inviterResult.rows[0].id;
    }
  }

  // Get initial credits from bot settings
  let initialCredits = 3;
  try {
    const settingsResult = await query(
      'SELECT new_user_credits FROM bot_settings WHERE bot_id = $1',
      [botId]
    );
    if (settingsResult.rows.length > 0 && settingsResult.rows[0].new_user_credits != null) {
      initialCredits = settingsResult.rows[0].new_user_credits;
    }
  } catch (err) {
    // bot_settings table may not exist yet or no row for this bot — use default
    console.warn(`[bot ${botId}] Could not read bot_settings, using default credits:`, err);
  }

  if (existingAnyBot.rows.length > 0) {
    // User exists for another bot — create linked entry copying shared identity/balance fields
    const source = existingAnyBot.rows[0];
    const createResult = await query(
      `INSERT INTO users (bot_id, telegram_id, username, first_name, last_name, language_code,
       invited_by, red_packet_credits, balance, platform_username, platform_bound,
       platform_status, account_status, channel_followed, group_joined,
       follow_reward_unlocked, bind_reward_unlocked, last_active_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
       ON CONFLICT (bot_id, telegram_id) DO UPDATE SET last_active_at = NOW()
       RETURNING *`,
      [
        botId,
        tgUser.id,
        tgUser.username || null,
        tgUser.first_name || null,
        tgUser.last_name || null,
        source.language_code || tgUser.language_code || 'en',
        invitedBy || source.invited_by,
        source.red_packet_credits ?? initialCredits,
        source.balance ?? 0,
        source.platform_username,
        source.platform_bound,
        source.platform_status,
        source.account_status,
        source.channel_followed,
        source.group_joined,
        source.follow_reward_unlocked,
        source.bind_reward_unlocked,
      ]
    );
    return createResult.rows[0];
  }

  // Brand new user
  const createResult = await query(
    `INSERT INTO users (bot_id, telegram_id, username, first_name, last_name, language_code, invited_by, red_packet_credits)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      botId,
      tgUser.id,
      tgUser.username || null,
      tgUser.first_name || null,
      tgUser.last_name || null,
      tgUser.language_code || 'en',
      invitedBy,
      initialCredits,
    ]
  );
  return createResult.rows[0];
}

async function getPrimaryUniqueId(telegramId: number): Promise<string | null> {
  const result = await query(
    'SELECT unique_id FROM users WHERE telegram_id = $1 AND unique_id IS NOT NULL ORDER BY created_at ASC LIMIT 1',
    [telegramId]
  );
  return result.rows[0]?.unique_id || null;
}

async function getUnifiedBalance(telegramId: number): Promise<number> {
  const result = await query(
    'SELECT balance FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1',
    [telegramId]
  );
  return parseFloat(String(result.rows[0]?.balance ?? 0));
}

async function getBotSettings(botId: string): Promise<Record<string, any>> {
  try {
    const result = await query('SELECT * FROM bot_settings WHERE bot_id = $1', [botId]);
    return result.rows[0] || {};
  } catch {
    return {};
  }
}

function resolveUserLang(user: User, defaultLanguage: string): string {
  let lang = user.language_code;
  if (!lang || !isSupportedLang(lang)) lang = defaultLanguage;
  if (!lang || !isSupportedLang(lang)) lang = 'en';
  return lang;
}

async function buildWelcomeText(user: User, lang: string, settings: Record<string, any>): Promise<string> {
  if (settings.welcome_message) {
    if (typeof settings.welcome_message === 'object') {
      const msg = settings.welcome_message[lang]
        || settings.welcome_message['en']
        || settings.welcome_message[Object.keys(settings.welcome_message)[0]];
      if (msg) return msg;
    } else if (typeof settings.welcome_message === 'string' && settings.welcome_message.trim()) {
      return settings.welcome_message;
    }
  }
  const displayId = await getPrimaryUniqueId(user.telegram_id) || user.unique_id || user.robot_user_id || 'N/A';
  const balance = (await getUnifiedBalance(user.telegram_id)).toFixed(2);
  return `🎉 ${t(lang, 'welcome_title')}\n\n` +
    `🆔 ${t(lang, 'your_unique_id')}: <b>${displayId}</b>\n` +
    `💰 ${t(lang, 'your_balance')}: <b>${balance}</b>\n\n` +
    t(lang, 'welcome_description');
}

function setupBotHandlers(bot: Telegraf, botId: string, defaultLanguage: string) {
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
      const lang = resolveUserLang(user, defaultLanguage);
      const settings = await getBotSettings(botId);

      const welcomeText = await buildWelcomeText(user, lang, settings);
      const webAppUrl = settings.webapp_url || process.env.WEBAPP_URL;
      const keyboardRows: any[][] = [
        [Markup.button.text(t(lang, 'btn_my_wallet')), Markup.button.text(t(lang, 'btn_invite'))],
      ];
      if (webAppUrl) {
        keyboardRows.push([Markup.button.webApp(t(lang, 'btn_open_app'), webAppUrl)]);
      }

      await ctx.replyWithHTML(welcomeText, Markup.keyboard(keyboardRows).resize());
    } catch (error) {
      console.error(`[bot ${botId}] Start handler error:`, error);
      try { await ctx.reply('An error occurred. Please try again.'); } catch {}
    }
  });

  // Text message handler (menu navigation)
  bot.on(message('text'), async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx, botId);
      const lang = resolveUserLang(user, defaultLanguage);

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
      const lang = resolveUserLang(user, defaultLanguage);

      const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';

      // Language selection
      if (data.startsWith('lang_')) {
        const newLang = data.split('_')[1];
        try {
          await query('UPDATE users SET language_code = $1 WHERE id = $2', [newLang, user.id]);
          await ctx.answerCbQuery(t(newLang, 'language_changed') || 'Language updated!');
        } catch {
          await ctx.answerCbQuery('Language updated!');
        }
        return;
      }

      if (data === 'wallet_deposit') {
        await ctx.answerCbQuery();
        const balance = (await getUnifiedBalance(user.telegram_id)).toFixed(2);
        await ctx.replyWithHTML(
          `📥 <b>${t(lang, 'btn_deposit')}</b>\n\n` +
          `💰 ${t(lang, 'wallet_balance')}: <b>${balance} USDT</b>\n\n` +
          `${t(lang, 'select_network')}:`,
          Markup.inlineKeyboard([
            [Markup.button.callback('TRC20 (USDT)', 'deposit_trc20')],
            [Markup.button.callback('ERC20 (USDT)', 'deposit_erc20')],
            [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
          ])
        );
        return;
      }

      if (data === 'wallet_withdraw') {
        await ctx.answerCbQuery();
        const balance = (await getUnifiedBalance(user.telegram_id)).toFixed(2);
        await ctx.replyWithHTML(
          `📤 <b>${t(lang, 'btn_withdraw')}</b>\n\n` +
          `💰 ${t(lang, 'wallet_balance')}: <b>${balance} USDT</b>\n\n` +
          `${t(lang, 'withdraw_select_network')}:`,
          Markup.inlineKeyboard([
            [Markup.button.callback('TRC20 (USDT)', 'withdraw_trc20')],
            [Markup.button.callback('ERC20 (USDT)', 'withdraw_erc20')],
            [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
          ])
        );
        return;
      }

      if (data === 'wallet_transfer') {
        await ctx.answerCbQuery();
        const balance = (await getUnifiedBalance(user.telegram_id)).toFixed(2);
        await ctx.replyWithHTML(
          `💸 <b>${t(lang, 'btn_transfer')}</b>\n\n` +
          `💰 ${t(lang, 'wallet_balance')}: <b>${balance} USDT</b>\n\n` +
          t(lang, 'transfer_enter_id'),
          Markup.inlineKeyboard([
            [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
          ])
        );
        return;
      }

      if (data === 'wallet_language') {
        await ctx.answerCbQuery();
        const langButtons = [
          [Markup.button.callback('🇨🇳 中文', 'lang_zh'), Markup.button.callback('🇺🇸 English', 'lang_en')],
          [Markup.button.callback('🇫🇷 Français', 'lang_fr'), Markup.button.callback('🇩🇪 Deutsch', 'lang_de')],
          [Markup.button.callback('🇪🇸 Español', 'lang_es'), Markup.button.callback('🇸🇦 العربية', 'lang_ar')],
          [Markup.button.callback('🇯🇵 日本語', 'lang_ja')],
          [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
        ];
        await ctx.replyWithHTML(
          `🌐 <b>${t(lang, 'language_title')}</b>`,
          Markup.inlineKeyboard(langButtons)
        );
        return;
      }

      if (data === 'wallet_support') {
        await ctx.answerCbQuery();
        await ctx.replyWithHTML(
          `🎧 <b>${t(lang, 'help_title')}</b>\n\n${t(lang, 'help_description')}`,
          Markup.inlineKeyboard([
            [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
          ])
        );
        return;
      }

      if (data === 'wallet_back_to_wallet') {
        await ctx.answerCbQuery();
        await handleWallet(ctx, botId, user, lang);
        return;
      }

      if (data === 'wallet_back') {
        await ctx.answerCbQuery();
        // Show start menu
        const settings = await getBotSettings(botId);
        const welcomeText = await buildWelcomeText(user, lang, settings);
        const webAppUrl = settings.webapp_url || process.env.WEBAPP_URL;
        const keyboardRows: any[][] = [
          [Markup.button.text(t(lang, 'btn_my_wallet')), Markup.button.text(t(lang, 'btn_invite'))],
        ];
        if (webAppUrl) {
          keyboardRows.push([Markup.button.webApp(t(lang, 'btn_open_app'), webAppUrl)]);
        }
        await ctx.replyWithHTML(welcomeText, Markup.keyboard(keyboardRows).resize());
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
  const settings = await getBotSettings(botId);
  const displayId = await getPrimaryUniqueId(user.telegram_id) || user.unique_id || user.robot_user_id || 'N/A';
  const balance = (await getUnifiedBalance(user.telegram_id)).toFixed(2);

  const walletText =
    `💼 <b>${t(lang, 'wallet_title')}</b>\n\n` +
    `🆔 ${t(lang, 'your_unique_id')}: <code>${displayId}</code>\n` +
    `💰 ${t(lang, 'wallet_balance')}: <b>${balance} USDT</b>\n` +
    `🎁 ${t(lang, 'account_red_packet_credits')}: <b>${user.red_packet_credits ?? 0}</b>\n` +
    `📊 ${t(lang, 'account_account_status')}: ${t(lang, user.account_status === 'active' ? 'account_active' : 'account_pending')}\n`;

  const supportButton = settings.support_telegram
    ? [Markup.button.url(t(lang, 'btn_support'), `https://t.me/${settings.support_telegram}`)]
    : [Markup.button.callback(t(lang, 'btn_support'), 'wallet_support')];

  await ctx.replyWithHTML(
    walletText,
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
  const settings = await getBotSettings(botId);

  const botUsername = settings.bot_username || process.env.BOT_USERNAME || 'your_bot';
  const displayId = await getPrimaryUniqueId(user.telegram_id) || user.unique_id || user.robot_user_id || user.invite_code;
  const inviteLink = `https://t.me/${botUsername}?start=REF_${displayId}`;
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
      // Try with default_language first, fall back without it if column doesn't exist
      let result;
      try {
        result = await query(
          'SELECT id, token, default_language FROM bots WHERE is_active = true'
        );
      } catch (err) {
        console.warn('BotManager: default_language column not found, falling back:', err);
        result = await query(
          'SELECT id, token FROM bots WHERE is_active = true'
        );
      }

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
