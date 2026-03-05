import { Context } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getTransactions } from '../services/api';
import { t } from '../i18n';
import { Transaction } from '../types';

export const handleBalance = async (ctx: Context, user: User) => {
  try {
    const lang = getUserLanguage(user);

    // Get recent transactions
    const transactions = await getTransactions(user.id, 5);

    let message = `${t(lang, 'balance_title')}\n\n`;
    message += `💵 ${t(lang, 'balance_current')}: <b>${user.balance.toFixed(2)}</b>\n\n`;

    if (transactions && transactions.length > 0) {
      message += `📊 ${t(lang, 'balance_recent_transactions')}:\n`;
      transactions.forEach((tx: Transaction) => {
        const date = new Date(tx.created_at).toLocaleDateString();
        const sign = tx.amount >= 0 ? '+' : '';
        message += `  ${date}: ${sign}${tx.amount} - ${tx.description}\n`;
      });
    }

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Balance handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
