import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { getSettings } from '../services/settings';
import { getMainKeyboard } from '../keyboards/main';
import { t } from '../i18n';

export const handleStart = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
    
    // Extract invite code from start parameter
    const startPayload = ctx.message && 'text' in ctx.message 
      ? ctx.message.text.split(' ')[1] 
      : undefined;

    // Get or create user
    const user = await getOrCreateUser(ctx, botId, startPayload);
    const lang = getUserLanguage(user);
    const settings = await getSettings(botId);

    // Build welcome message
    let message = `${t(lang, 'welcome_title')}\n\n`;
    message += `${t(lang, 'welcome_description')}\n\n`;

    // Show platform registration link if not bound
    if (!user.platform_bound) {
      message += `${t(lang, 'welcome_register_prompt')}\n`;
      message += `🔗 ${settings.platform_register_url || 'https://platform.example.com'}\n\n`;
      message += `${t(lang, 'welcome_after_register')}\n`;
      message += `✓ ${t(lang, 'welcome_task_follow')}\n`;
      message += `✓ ${t(lang, 'welcome_task_join')}\n`;
      message += `✓ ${t(lang, 'welcome_task_bind')}\n\n`;
    }

    // Show rewards status
    if (!user.follow_reward_unlocked || !user.bind_reward_unlocked) {
      message += `${t(lang, 'welcome_rewards_locked')}\n`;
      message += `${t(lang, 'welcome_unlock_rewards')}\n`;
    }

    // Send welcome message with main keyboard
    await ctx.reply(message, getMainKeyboard(lang));
  } catch (error) {
    console.error('Start handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
