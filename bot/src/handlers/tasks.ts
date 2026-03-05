import { Context, Markup } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getSettings } from '../services/settings';
import { t } from '../i18n';
import { Settings } from '../types';

export const handleTasks = async (ctx: Context, user: User) => {
  try {
    const lang = getUserLanguage(user);
    const botId = process.env.BOT_ID || 'default';
    const settings: Settings = await getSettings(botId);

    let message = `${t(lang, 'tasks_title')}\n\n`;

    // Task 1: Follow Channel
    const channelTask = user.channel_followed ? '✅' : '🔲';
    message += `${channelTask} ${t(lang, 'tasks_follow_channel')}\n`;
    message += `   ${t(lang, 'tasks_reward')}: ${settings.follow_reward || 50}\n`;
    if (!user.channel_followed) {
      message += `   `;
    }
    message += `\n`;

    // Task 2: Join Group
    const groupTask = user.group_joined ? '✅' : '🔲';
    message += `${groupTask} ${t(lang, 'tasks_join_group')}\n`;
    message += `   ${t(lang, 'tasks_reward')}: ${settings.follow_reward || 50}\n`;
    if (!user.group_joined) {
      message += `   `;
    }
    message += `\n`;

    // Task 3: Bind Platform
    const bindTask = user.platform_bound ? '✅' : '🔲';
    message += `${bindTask} ${t(lang, 'tasks_bind_platform')}\n`;
    message += `   ${t(lang, 'tasks_reward')}: ${settings.bind_reward || 100}\n\n`;

    // Task 4: Share Screenshot
    message += `🔲 ${t(lang, 'tasks_share_screenshot')}\n`;
    message += `   ${t(lang, 'tasks_share_screenshot_desc')}\n\n`;

    const buttons = [];

    // Add task buttons based on completion status
    if (!user.channel_followed && settings.required_channel_id) {
      buttons.push([
        Markup.button.url(
          t(lang, 'tasks_follow_button'),
          `https://t.me/${settings.required_channel_id.replace('@', '')}`
        ),
        Markup.button.callback(t(lang, 'tasks_check_button'), 'check_channel')
      ]);
    }

    if (!user.group_joined && settings.required_group_id) {
      const groupLink = settings.required_group_id.startsWith('-100')
        ? `https://t.me/c/${settings.required_group_id.slice(4)}`
        : `https://t.me/${settings.required_group_id}`;
      buttons.push([
        Markup.button.url(t(lang, 'tasks_join_button'), groupLink),
        Markup.button.callback(t(lang, 'tasks_check_button'), 'check_group')
      ]);
    }

    if (!user.platform_bound) {
      buttons.push([
        Markup.button.callback(t(lang, 'tasks_bind_button'), 'start_binding')
      ]);
    }

    buttons.push([
      Markup.button.callback(t(lang, 'tasks_share_screenshot'), 'share_screenshot')
    ]);

    await ctx.reply(message, Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Tasks handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
