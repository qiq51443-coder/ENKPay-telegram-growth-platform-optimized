import { Context, Markup } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getExchanges, getExchange } from '../services/api';
import { t } from '../i18n';

export const handleTutorials = async (ctx: Context, user: User) => {
  try {
    const lang = getUserLanguage(user);

    // Get all exchanges
    const exchanges = await getExchanges();

    let message = `${t(lang, 'tutorials_title')}\n\n`;
    message += `${t(lang, 'tutorials_select_exchange')}\n`;

    const buttons = exchanges.map((exchange: any) => [
      Markup.button.callback(
        exchange.name_zh && lang === 'zh' ? exchange.name_zh : exchange.name,
        `exchange_${exchange.id}`
      )
    ]);

    await ctx.reply(message, Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Tutorials handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};

export const handleExchangeDetail = async (ctx: Context, user: User, exchangeId: string) => {
  try {
    const lang = getUserLanguage(user);

    // Get exchange details
    const exchange = await getExchange(exchangeId);

    if (!exchange) {
      await ctx.answerCbQuery('Exchange not found');
      return;
    }

    const name = exchange.name_zh && lang === 'zh' ? exchange.name_zh : exchange.name;
    let message = `🏦 ${name}\n\n`;

    // Get tutorial content in user's language
    const tutorialContent = exchange.tutorial_content?.[lang] || exchange.tutorial_content?.en;
    if (tutorialContent) {
      message += tutorialContent;
    } else {
      message += 'Tutorial coming soon...';
    }

    const buttons = [];
    
    if (exchange.register_url) {
      buttons.push([
        Markup.button.url(t(lang, 'exchange_register'), exchange.register_url)
      ]);
    }

    buttons.push([
      Markup.button.callback(t(lang, 'tutorials_back_button'), 'back_to_tutorials')
    ]);

    await ctx.answerCbQuery();
    await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Exchange detail handler error:', error);
    await ctx.answerCbQuery('Error loading exchange details');
  }
};
