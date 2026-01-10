import { Context, Markup } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getUserState, setUserState } from '../utils/state';
import { createScreenshot } from '../services/api';
import { getSettings } from '../services/settings';
import { t } from '../i18n';

export const handleScreenshotShare = async (ctx: Context, user: User) => {
  try {
    const lang = getUserLanguage(user);
    const botId = process.env.BOT_ID || 'default';
    const settings = await getSettings(botId);

    let message = `${t(lang, 'screenshot_guide')}\n\n`;
    message += `${t(lang, 'screenshot_instructions')}\n`;

    const buttons = [];
    
    if (settings.screenshot_group_id) {
      // Create group link
      const groupLink = settings.screenshot_group_id.startsWith('-100')
        ? `https://t.me/c/${settings.screenshot_group_id.slice(4)}`
        : `https://t.me/${settings.screenshot_group_id.replace('@', '')}`;
      
      buttons.push([
        Markup.button.url(t(lang, 'screenshot_join_group'), groupLink)
      ]);
    }

    await ctx.reply(message, Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Screenshot share handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};

export const handleScreenshotSubmit = async (
  ctx: Context,
  user: User,
  fileId: string,
  groupId: number,
  messageId: number
) => {
  try {
    const lang = getUserLanguage(user);
    const botId = process.env.BOT_ID || 'default';

    // Create screenshot record
    await createScreenshot(botId, user.id, groupId, messageId, fileId);

    // Note: We don't delete the message from the group
    // The bot just records it for admin review

    // Optionally send a confirmation to the user in private
    await ctx.telegram.sendMessage(
      user.telegram_id,
      t(lang, 'screenshot_submitted')
    );
  } catch (error) {
    console.error('Screenshot submit handler error:', error);
  }
};
