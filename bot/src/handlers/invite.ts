import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { getSettings } from '../services/settings';
import { t } from '../i18n';

export const handleInvite = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    const botUsername = process.env.BOT_USERNAME || 'your_bot';
    const uniqueId = user.unique_id || user.robot_user_id || user.invite_code;
    const inviteLink = `https://t.me/${botUsername}?start=REF_${uniqueId}`;

    // Fetch configurable invite text/button from settings
    let settings: Record<string, any> = {};
    try {
      settings = await getSettings(botId) || {};
    } catch {}

    const shareText = settings.invite_share_text ||
      `${t(lang, 'invite_title')}\n\n` +
      `${t(lang, 'invite_description')}\n\n` +
      `🔗 ${t(lang, 'your_invite_link')}:\n` +
      `${inviteLink}\n\n` +
      t(lang, 'invite_share_hint');

    const buttonText = settings.invite_button_text || t(lang, 'btn_invite');

    await ctx.replyWithHTML(shareText, Markup.inlineKeyboard([
      [Markup.button.url(buttonText, inviteLink)],
    ]));
  } catch (error) {
    console.error('Invite handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
