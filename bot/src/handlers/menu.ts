import { Context } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { getMainKeyboard } from '../keyboards/main';
import { handleTasks } from './tasks';
import { handleInvites } from './invites';
import { handleBalance } from './balance';
import { handleAccount } from './account';
import { handleLanguage } from './language';
import { handleTutorials } from './tutorials';
import { handleExchange } from './exchange';
import { handleHelp } from './help';
import { t } from '../i18n';

export const handleMenu = async (ctx: Context) => {
  try {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) return;

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    const text = ctx.message.text;

    // Match menu buttons in any language
    const buttons = {
      tasks: [t('en', 'menu_tasks'), t('zh', 'menu_tasks'), t('fr', 'menu_tasks'), t('es', 'menu_tasks'), t('ar', 'menu_tasks')],
      invites: [t('en', 'menu_invites'), t('zh', 'menu_invites'), t('fr', 'menu_invites'), t('es', 'menu_invites'), t('ar', 'menu_invites')],
      balance: [t('en', 'menu_balance'), t('zh', 'menu_balance'), t('fr', 'menu_balance'), t('es', 'menu_balance'), t('ar', 'menu_balance')],
      tutorials: [t('en', 'menu_tutorials'), t('zh', 'menu_tutorials'), t('fr', 'menu_tutorials'), t('es', 'menu_tutorials'), t('ar', 'menu_tutorials')],
      account: [t('en', 'menu_account'), t('zh', 'menu_account'), t('fr', 'menu_account'), t('es', 'menu_account'), t('ar', 'menu_account')],
      language: [t('en', 'menu_language'), t('zh', 'menu_language'), t('fr', 'menu_language'), t('es', 'menu_language'), t('ar', 'menu_language')],
      exchange: [t('en', 'menu_exchange'), t('zh', 'menu_exchange'), t('fr', 'menu_exchange'), t('es', 'menu_exchange'), t('ar', 'menu_exchange')],
      help: [t('en', 'menu_help'), t('zh', 'menu_help'), t('fr', 'menu_help'), t('es', 'menu_help'), t('ar', 'menu_help')],
    };

    if (buttons.tasks.includes(text)) {
      await handleTasks(ctx, user);
    } else if (buttons.invites.includes(text)) {
      await handleInvites(ctx, user);
    } else if (buttons.balance.includes(text)) {
      await handleBalance(ctx, user);
    } else if (buttons.tutorials.includes(text) || buttons.exchange.includes(text)) {
      await handleTutorials(ctx, user);
    } else if (buttons.account.includes(text)) {
      await handleAccount(ctx, user);
    } else if (buttons.language.includes(text)) {
      await handleLanguage(ctx, user);
    } else if (buttons.help.includes(text)) {
      await handleHelp(ctx, user);
    }
  } catch (error) {
    console.error('Menu handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
