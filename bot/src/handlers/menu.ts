import { Context } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { handleTasks } from './tasks';
import { handleInvite } from './invite';
import { handleWallet } from './wallet';
import { handleAccount } from './account';
import { handleLanguage } from './language';
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
      wallet: [t('en', 'btn_my_wallet'), t('zh', 'btn_my_wallet')],
      invite: [t('en', 'btn_invite'), t('zh', 'btn_invite')],
      help: [t('en', 'btn_help'), t('zh', 'btn_help')],
      tasks: [t('en', 'menu_tasks'), t('zh', 'menu_tasks')],
      account: [t('en', 'menu_account'), t('zh', 'menu_account')],
      language: [t('en', 'menu_language'), t('zh', 'menu_language')],
    };

    if (buttons.wallet.includes(text)) {
      await handleWallet(ctx, user);
    } else if (buttons.invite.includes(text)) {
      await handleInvite(ctx, user);
    } else if (buttons.help.includes(text)) {
      await handleHelp(ctx, user);
    } else if (buttons.tasks.includes(text)) {
      await handleTasks(ctx, user);
    } else if (buttons.account.includes(text)) {
      await handleAccount(ctx, user);
    } else if (buttons.language.includes(text)) {
      await handleLanguage(ctx, user);
    }
  } catch (error) {
    console.error('Menu handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
