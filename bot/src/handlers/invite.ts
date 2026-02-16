import { Context } from 'telegraf';
import { getUserLanguage } from '../services/user';
import { t } from '../i18n';
import { api } from '../services/api';

export const handleInvite = async (ctx: Context, user: any) => {
  try {
    const lang = getUserLanguage(user);
    const botUsername = process.env.BOT_USERNAME || 'YourBot';

    // Generate invite link
    const inviteCode = user.robot_user_id || user.id;
    const inviteLink = `https://t.me/${botUsername}?start=${inviteCode}`;

    let message = `🎁 ${t(lang, 'invite_title')}\n\n`;
    message += `${t(lang, 'invite_description')}\n\n`;
    
    message += `💰 ${t(lang, 'invite_rewards')}:\n`;
    message += `• ${t(lang, 'invite_reward_follow')}: 5 USDT\n`;
    message += `• ${t(lang, 'invite_reward_trade')}: 5 USDT\n\n`;

    message += `👥 ${t(lang, 'invite_stats')}:\n`;
    message += `📊 ${t(lang, 'invite_level1')}: ${user.invite_level1_count || 0}\n`;
    message += `📊 ${t(lang, 'invite_level2')}: ${user.invite_level2_count || 0}\n\n`;

    message += `🔗 ${t(lang, 'your_invite_link')}:\n`;
    message += `${inviteLink}\n\n`;
    
    message += `${t(lang, 'invite_share_hint')}`;

    await ctx.reply(message);
  } catch (error) {
    console.error('Invite handler error:', error);
    await ctx.reply(t(lang, 'error'));
  }
};
