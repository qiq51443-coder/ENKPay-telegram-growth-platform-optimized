import { Context } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { t } from '../i18n';

// Exchange handler - redirects to tutorials
export const handleExchange = async (ctx: Context, user: User) => {
  const { handleTutorials } = await import('./tutorials');
  await handleTutorials(ctx, user);
};
