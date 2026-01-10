import { Context } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { t } from '../i18n';

export const handleAccount = async (ctx: Context, user: User) => {
  try {
    const lang = getUserLanguage(user);

    const registeredDate = new Date(user.registered_at).toLocaleDateString();
    const platformStatus = user.platform_bound 
      ? t(lang, 'account_bound') 
      : t(lang, 'account_unbound');
    const accountStatus = user.account_status === 'active'
      ? t(lang, 'account_active')
      : t(lang, 'account_pending');

    let message = `${t(lang, 'account_title')}\n\n`;
    message += `🤖 ${t(lang, 'account_bot_id')}: <code>${user.robot_user_id}</code>\n`;
    message += `🎫 ${t(lang, 'account_invite_code')}: <code>${user.invite_code}</code>\n`;
    message += `📅 ${t(lang, 'account_registered')}: ${registeredDate}\n`;
    message += `💰 ${t(lang, 'account_balance')}: ${user.balance.toFixed(2)}\n`;
    message += `🔗 ${t(lang, 'account_platform_status')}: ${platformStatus}\n`;
    message += `✅ ${t(lang, 'account_account_status')}: ${accountStatus}\n`;
    message += `🧧 ${t(lang, 'account_red_packet_credits')}: ${user.red_packet_credits}\n`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Account handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
