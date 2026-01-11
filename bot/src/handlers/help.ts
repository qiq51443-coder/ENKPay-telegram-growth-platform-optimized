import { Context } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { t } from '../i18n';

export const handleHelp = async (ctx: Context, user: User) => {
  try {
    const lang = getUserLanguage(user);

    let message = `${t(lang, 'help_title')}\n\n`;
    message += `${t(lang, 'help_description')}\n\n`;
    message += `📧 ${t(lang, 'help_contact')}: @support\n`;

    await ctx.reply(message);
  } catch (error) {
    console.error('Help handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
