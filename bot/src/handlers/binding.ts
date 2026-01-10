import { Context, Markup } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getUserState, setUserState, clearUserState } from '../utils/state';
import { createBinding } from '../services/api';
import { getSettings } from '../services/settings';
import { t } from '../i18n';

export const handleBinding = async (ctx: Context, user: User) => {
  try {
    const lang = getUserLanguage(user);

    if (user.platform_bound) {
      await ctx.reply('You have already bound your platform account.');
      return;
    }

    let message = `${t(lang, 'binding_start')}\n\n`;
    message += `${t(lang, 'binding_step_1')}\n`;
    message += `${t(lang, 'binding_step_2')}\n`;
    message += `${t(lang, 'binding_step_3')}\n\n`;
    message += `${t(lang, 'binding_enter_username')}`;

    await setUserState(user.id.toString(), {
      step: 'binding_username',
    });

    await ctx.reply(message);
  } catch (error) {
    console.error('Binding handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};

export const handleBindingUsername = async (ctx: Context, user: User, username: string) => {
  try {
    const lang = getUserLanguage(user);

    // Store username in state
    await setUserState(user.id.toString(), {
      step: 'binding_screenshot',
      data: { username },
    });

    await ctx.reply(t(lang, 'binding_upload_screenshot'));
  } catch (error) {
    console.error('Binding username handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};

export const handleBindingScreenshot = async (ctx: Context, user: User, fileId: string) => {
  try {
    const lang = getUserLanguage(user);
    const botId = process.env.BOT_ID || 'default';

    // Get state
    const state = await getUserState(user.id.toString());
    if (!state || state.step !== 'binding_screenshot' || !state.data?.username) {
      await ctx.reply('Please start the binding process again.');
      return;
    }

    // Create binding request
    await createBinding(botId, user.id, state.data.username, fileId);

    // Clear state
    await clearUserState(user.id.toString());

    await ctx.reply(t(lang, 'binding_submitted'));
  } catch (error) {
    console.error('Binding screenshot handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
