import { Context } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { handleTasks } from './tasks';
import { handleInvite } from './invite';
import { handleWallet } from './wallet';
import { handleAccount } from './account';
import { handleLanguage } from './language';
import { handleHelp } from './help';
import { handleStart } from './start';
import { t } from '../i18n';

const ALL_LANGS = ['en', 'zh', 'fr', 'de', 'es', 'ar', 'ja'];

function collectButtons(key: string): string[] {
  return ALL_LANGS.map(l => t(l, key));
}

export const handleMenu = async (ctx: Context) => {
  try {
    if (!ctx.from || !ctx.message || !('text' in ctx.message)) return;

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    const text = ctx.message.text;

    // Match menu buttons in any language
    const buttons = {
      wallet: collectButtons('btn_my_wallet'),
      invite: collectButtons('btn_invite'),
      help: collectButtons('btn_help'),
      tasks: collectButtons('menu_tasks'),
      account: collectButtons('menu_account'),
      language: collectButtons('menu_language'),
      back: collectButtons('btn_back'),
    };

    if (buttons.wallet.includes(text)) {
      await handleWallet(ctx);
    } else if (buttons.invite.includes(text)) {
      await handleInvite(ctx);
    } else if (buttons.help.includes(text)) {
      await handleHelp(ctx, user);
    } else if (buttons.tasks.includes(text)) {
      await handleTasks(ctx, user);
    } else if (buttons.account.includes(text)) {
      await handleAccount(ctx, user);
    } else if (buttons.language.includes(text)) {
      await handleLanguage(ctx, user);
    } else if (buttons.back.includes(text)) {
      await handleStart(ctx);
    }
  } catch (error) {
    console.error('Menu handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
