import { Context, Markup } from 'telegraf';
import { getOrCreateUser } from '../services/user';
import { getSettings } from '../services/settings';
import { t, isSupportedLang } from '../i18n';
import axios from 'axios';

export const handleStart = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';

    // Extract invite code from start parameter (REF_XXXXXXX format)
    const startPayload = ctx.message && 'text' in ctx.message
      ? ctx.message.text.split(' ')[1]
      : undefined;

    let inviteCodeUsed: string | undefined;
    if (startPayload && startPayload.startsWith('REF_')) {
      inviteCodeUsed = startPayload.substring(4); // Extract invite code after REF_
    }

    // Get or create user
    const user = await getOrCreateUser(ctx, botId, inviteCodeUsed);

    // Language priority: Telegram user language (if supported) > Bot default_language > 'en'
    let lang = 'en';
    const telegramLang = ctx.from.language_code;
    if (telegramLang && isSupportedLang(telegramLang)) {
      lang = telegramLang;
    } else {
      try {
        const botRes = await axios.get(`${backendUrl}/api/bots/${botId}`);
        if (botRes.data?.bot?.default_language) {
          lang = botRes.data.bot.default_language;
        }
      } catch {}
    }

    // Get bot settings (welcome message + webapp url)
    const settings = await getSettings(botId);

    // Build welcome message
    const welcomeText = settings.welcome_message ||
      `🎉 ${t(lang, 'welcome_title')}\n\n` +
      `🆔 ${t(lang, 'your_unique_id')}: <b>${user.unique_id || user.robot_user_id || 'N/A'}</b>\n` +
      `💰 ${t(lang, 'your_balance')}: <b>${((user as any).wallet_balance ?? user.balance ?? 0).toFixed(2)}</b>\n\n` +
      t(lang, 'welcome_description');

    const webAppUrl = settings.webapp_url || process.env.WEBAPP_URL || 'https://example.com';

    await ctx.replyWithHTML(welcomeText, Markup.keyboard([
      [Markup.button.text(t(lang, 'btn_my_wallet')), Markup.button.text(t(lang, 'btn_invite'))],
      [Markup.button.webApp(t(lang, 'btn_open_app'), webAppUrl)],
    ]).resize());
  } catch (error) {
    console.error('Start handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
