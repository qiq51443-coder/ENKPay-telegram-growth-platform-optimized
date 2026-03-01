import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
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

    const message =
      `👥 <b>${t(lang, 'invite_title')}</b>\n\n` +
      `${t(lang, 'invite_description')}\n\n` +
      `🔗 ${t(lang, 'your_invite_link')}:\n` +
      `<code>${inviteLink}</code>\n\n` +
      `${t(lang, 'invite_share_hint')}`;

    await ctx.replyWithHTML(message, Markup.keyboard([
      [Markup.button.text(t(lang, 'btn_back'))],
    ]).resize());
  } catch (error) {
    console.error('Invite handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
