import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { getSettings } from '../services/settings';
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

    // Build welcome message for NFT platform
    const message = `🎨 ${t(lang, 'welcome_nft_title')}\n\n` +
      `${t(lang, 'welcome_nft_description')}\n\n` +
      `✨ ${t(lang, 'welcome_features')}:\n` +
      `🖼 ${t(lang, 'feature_nft_market')}\n` +
      `🎯 ${t(lang, 'feature_auctions')}\n` +
      `📈 ${t(lang, 'feature_trading')}\n` +
      `❤️ ${t(lang, 'feature_charity')}\n` +
      `💰 ${t(lang, 'feature_wallet')}\n\n` +
      `👥 ${t(lang, 'feature_invite')}\n`;

    // Create Mini App WebApp button
    const webAppUrl = settings.webapp_url || process.env.WEBAPP_URL || 'https://example.com';
    
    await ctx.reply(message, Markup.keyboard([
      [Markup.button.webApp(t(lang, 'btn_open_platform'), webAppUrl)],
      [
        Markup.button.text(t(lang, 'btn_my_wallet')),
        Markup.button.text(t(lang, 'btn_invite'))
      ],
      [Markup.button.text(t(lang, 'btn_help'))]
    ]).resize());
  } catch (error) {
    console.error('Start handler error:', error);
    await ctx.reply(t('en', 'error'));
  }
};
