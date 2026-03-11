import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { getSettings } from '../services/settings';
import { t } from '../i18n';
import axios from 'axios';

export const handleWallet = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';

    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    // Fetch latest balance details from backend
    let balance = Number(user.balance) || 0;
    let rewardBalance = Number(user.reward_balance) || 0;
    let frozenBalance = Number(user.frozen_balance) || 0;
    let nftHoldings = 0;
    let balanceFetchFailed = false;
    try {
      const res = await axios.get(`${backendUrl}/api/users/telegram/${ctx.from.id}`, {
        headers: { 'X-Bot-Token': botId },
      });
      if (res.data?.user) {
        const u = res.data.user;
        if (u.balance !== undefined) balance = parseFloat(u.balance);
        if (u.reward_balance !== undefined) rewardBalance = parseFloat(u.reward_balance);
        if (u.frozen_balance !== undefined) frozenBalance = parseFloat(u.frozen_balance);
        if (u.nft_holdings_value !== undefined) nftHoldings = parseFloat(u.nft_holdings_value);
      }
    } catch {
      balanceFetchFailed = true;
    }

    // Fetch settings to get support_telegram
    let supportUsername = '';
    try {
      const settings = await getSettings(botId);
      supportUsername = settings?.support_telegram || '';
    } catch {}

    const message =
      `💰 <b>${t(lang, 'wallet_title')}</b>\n\n` +
      `🆔 ${t(lang, 'your_unique_id')}: <b>${user.unique_id || user.robot_user_id || 'N/A'}</b>\n` +
      `💵 ${t(lang, 'wallet_balance')} (USDT): <b>${balance.toFixed(2)}</b>\n` +
      `🎁 ${t(lang, 'redpacket_balance')}: <b>${rewardBalance.toFixed(2)}</b>\n` +
      `🖼 ${t(lang, 'nft_holdings')} (USDT): <b>${nftHoldings.toFixed(2)}</b>\n` +
      (balanceFetchFailed ? `\n${t(lang, 'balance_stale_warning')}` : '');

    const supportButton = supportUsername
      ? Markup.button.url(t(lang, 'btn_contact_support'), `https://t.me/${supportUsername}`)
      : Markup.button.callback(t(lang, 'btn_contact_support'), 'wallet_support');

    await ctx.replyWithHTML(message, Markup.inlineKeyboard([
      [
        Markup.button.callback(t(lang, 'btn_deposit'), 'wallet_deposit'),
        Markup.button.callback(t(lang, 'btn_transfer'), 'wallet_transfer'),
      ],
      [
        Markup.button.callback(t(lang, 'btn_withdraw'), 'wallet_withdraw'),
      ],
      [
        supportButton,
        Markup.button.callback(t(lang, 'btn_language'), 'wallet_language'),
      ],
      [
        Markup.button.callback(t(lang, 'btn_back'), 'wallet_back'),
      ],
    ]));
  } catch (error) {
    console.error('Wallet handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
