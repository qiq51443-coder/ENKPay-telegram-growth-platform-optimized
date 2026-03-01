import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { getSettings } from '../services/settings';
import { t } from '../i18n';
import axios from 'axios';

export const handleStart = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
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
    const lang = getUserLanguage(user);

    // Get bot settings (welcome message + webapp url)
    const settings = await getSettings(botId);

    // Get bot info for language
    let botLang = lang;
    try {
      const botRes = await axios.get(`${backendUrl}/api/bots/${botId}`);
      if (botRes.data?.bot?.default_language) {
        botLang = botRes.data.bot.default_language;
      }
    } catch {}

    // Build welcome message
    const welcomeText = settings.welcome_message ||
      `🎉 ${t(botLang, 'welcome_title')}\n\n` +
      `🆔 ${t(botLang, 'your_unique_id')}: <b>${user.unique_id || user.robot_user_id || 'N/A'}</b>\n` +
      `💰 ${t(botLang, 'your_balance')}: <b>${(user.balance || 0).toFixed(2)}</b>\n\n` +
      t(botLang, 'welcome_description');

    const webAppUrl = settings.webapp_url || process.env.WEBAPP_URL || 'https://example.com';

    await ctx.replyWithHTML(welcomeText, Markup.keyboard([
      [Markup.button.text(t(botLang, 'btn_my_wallet')), Markup.button.text(t(botLang, 'btn_invite'))],
      [Markup.button.webApp(t(botLang, 'btn_open_app'), webAppUrl)],
    ]).resize());
  } catch (error) {
    console.error('Start handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
