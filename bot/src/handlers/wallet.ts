import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { t } from '../i18n';
import axios from 'axios';

export const handleWallet = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';

    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    // Fetch latest balance from backend
    let balance = user.balance || 0;
    try {
      const res = await axios.get(`${backendUrl}/api/users/telegram/${ctx.from.id}`, {
        headers: { Authorization: `Bearer ${process.env.BOT_API_KEY}` },
      });
      if (res.data?.user?.balance !== undefined) {
        balance = parseFloat(res.data.user.balance);
      }
    } catch {}

    const message =
      `💰 <b>${t(lang, 'wallet_title')}</b>\n\n` +
      `🆔 ${t(lang, 'your_unique_id')}: <b>${user.robot_user_id || user.invite_code || 'N/A'}</b>\n` +
      `💵 ${t(lang, 'wallet_balance')}: <b>${balance.toFixed(2)}</b>\n`;

    await ctx.replyWithHTML(message, Markup.keyboard([
      [Markup.button.text(t(lang, 'btn_transfer')), Markup.button.text(t(lang, 'btn_deposit'))],
      [Markup.button.text(t(lang, 'btn_withdraw'))],
      [Markup.button.text(t(lang, 'btn_back'))],
    ]).resize());
  } catch (error) {
    console.error('Wallet handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
