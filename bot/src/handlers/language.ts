import { Context, Markup } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { updateUser } from '../services/api';
import { getMainKeyboard } from '../keyboards/main';
import { t } from '../i18n';

export const handleLanguage = async (ctx: Context, user: User) => {
  try {
    const lang = getUserLanguage(user);

    const message = t(lang, 'language_title');

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🇬🇧 English', 'lang_en'),
        Markup.button.callback('🇨🇳 中文', 'lang_zh'),
      ],
      [
        Markup.button.callback('🇫🇷 Français', 'lang_fr'),
        Markup.button.callback('🇪🇸 Español', 'lang_es'),
      ],
      [
        Markup.button.callback('🇸🇦 العربية', 'lang_ar'),
      ],
    ]);

    await ctx.reply(message, keyboard);
  } catch (error) {
    console.error('Language handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};

export const handleLanguageChange = async (ctx: Context, user: User, newLang: string) => {
  try {
    const botId = process.env.BOT_ID || 'default';
    
    // Update user language
    await updateUser(botId, user.id, { language_code: newLang });

    // Send confirmation with new keyboard in the selected language
    await ctx.answerCbQuery();
    await ctx.reply(
      t(newLang, 'language_changed'),
      getMainKeyboard(newLang)
    );
  } catch (error) {
    console.error('Language change error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
