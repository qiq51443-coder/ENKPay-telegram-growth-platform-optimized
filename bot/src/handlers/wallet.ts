import { Context } from 'telegraf';
import { getUserLanguage } from '../services/user';
import { t } from '../i18n';
import { api } from '../services/api';

export const handleWallet = async (ctx: Context, user: any) => {
  try {
    const lang = getUserLanguage(user);

    // Fetch user balance from backend
    const response = await api.get(`/wallet/balance/${user.id}`);
    
    if (!response.data.success) {
      await ctx.reply(t(lang, 'error_fetch_balance'));
      return;
    }

    const balance = response.data.data;

    let message = `💰 ${t(lang, 'wallet_title')}\n\n`;
    message += `💵 ${t(lang, 'wallet_balance')}: ${balance.wallet_balance.toFixed(2)} USDT\n`;
    message += `🎁 ${t(lang, 'reward_balance')}: ${balance.reward_balance.toFixed(2)} USDT\n`;
    message += `🔒 ${t(lang, 'frozen_balance')}: ${balance.frozen_balance.toFixed(2)} USDT\n\n`;
    
    message += `📊 ${t(lang, 'wallet_stats')}:\n`;
    message += `💳 ${t(lang, 'total_recharged')}: ${balance.total_recharged.toFixed(2)} USDT\n`;
    message += `💸 ${t(lang, 'total_withdrawn')}: ${balance.total_withdrawn.toFixed(2)} USDT\n`;
    message += `📈 ${t(lang, 'total_traded')}: ${balance.total_traded.toFixed(2)} USDT\n\n`;

    if (balance.reward_balance > 0) {
      message += `🔓 ${t(lang, 'reward_unlock_progress')}: ${balance.reward_unlock_progress.toFixed(0)}%\n`;
      message += `📊 ${t(lang, 'reward_unlock_required')}: ${balance.reward_unlock_required.toFixed(2)} USDT\n\n`;
    }

    message += `✅ ${t(lang, 'available_for_transfer')}: ${balance.available_for_transfer.toFixed(2)} USDT\n`;
    message += `✅ ${t(lang, 'available_for_withdrawal')}: ${balance.available_for_withdrawal.toFixed(2)} USDT\n`;

    await ctx.reply(message);
  } catch (error) {
    console.error('Wallet handler error:', error);
    await ctx.reply(t(lang, 'error'));
  }
};
