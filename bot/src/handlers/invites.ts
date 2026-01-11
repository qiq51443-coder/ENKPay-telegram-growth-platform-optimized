import { Context } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getInviteStats } from '../services/api';
import { getSettings } from '../services/settings';
import { t } from '../i18n';

export const handleInvites = async (ctx: Context, user: User) => {
  try {
    const lang = getUserLanguage(user);
    const botId = process.env.BOT_ID || 'default';
    const settings = await getSettings(botId);

    // Get bot username
    const botInfo = await ctx.telegram.getMe();
    const inviteLink = `https://t.me/${botInfo.username}?start=${user.invite_code}`;

    // Get invite stats
    const stats = await getInviteStats(user.id);

    let message = `${t(lang, 'invites_title')}\n\n`;
    message += `📋 ${t(lang, 'invites_your_code')}: <code>${user.invite_code}</code>\n\n`;
    message += `🔗 ${t(lang, 'invites_link')}:\n<code>${inviteLink}</code>\n\n`;
    message += `👥 ${t(lang, 'invites_total')}: ${stats?.total || 0}\n`;
    message += `💰 ${t(lang, 'invites_reward_per_invite')}: ${settings.invite_reward || 25}\n\n`;
    message += `📤 ${t(lang, 'invites_share_message')}`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Invites handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
