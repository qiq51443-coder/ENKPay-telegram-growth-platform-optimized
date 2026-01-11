import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import dotenv from 'dotenv';
import { connectRedis as connectStateRedis } from './utils/state';
import { connectRedis as connectSettingsRedis, subscribeToSettingsUpdates } from './services/settings';
import { getOrCreateUser, getUserLanguage } from './services/user';
import { getMainKeyboard } from './keyboards/main';
import { getUserState } from './utils/state';

// Import handlers
import { handleStart } from './handlers/start';
import { handleMenu } from './handlers/menu';
import { handleLanguageChange } from './handlers/language';
import { handleBinding, handleBindingUsername, handleBindingScreenshot } from './handlers/binding';
import { handleScreenshotShare, handleScreenshotSubmit } from './handlers/screenshot';
import { handleRedPacketClaim } from './handlers/redpacket';
import { handleExchangeDetail } from './handlers/tutorials';
import { handleTutorials } from './handlers/tutorials';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_ID = process.env.BOT_ID || 'default';

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN environment variable is required');
}

const bot = new Telegraf(BOT_TOKEN);

// Middleware to attach bot ID
bot.use((ctx, next) => {
  (ctx as any).botId = BOT_ID;
  return next();
});

// Start command
bot.command('start', handleStart);

// Text message handler
bot.on(message('text'), async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx, BOT_ID);
    const state = await getUserState(user.id.toString());

    // Handle binding flow
    if (state?.step === 'binding_username') {
      await handleBindingUsername(ctx, user, ctx.message.text);
      return;
    }

    // Handle menu navigation
    await handleMenu(ctx);
  } catch (error) {
    console.error('Text message error:', error);
  }
});

// Photo handler for binding and screenshots
bot.on(message('photo'), async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx, BOT_ID);
    const state = await getUserState(user.id.toString());
    const photo = ctx.message.photo[ctx.message.photo.length - 1];

    // Handle binding screenshot
    if (state?.step === 'binding_screenshot') {
      await handleBindingScreenshot(ctx, user, photo.file_id);
      return;
    }

    // Handle earnings screenshot in group
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
      await handleScreenshotSubmit(
        ctx,
        user,
        photo.file_id,
        ctx.chat.id,
        ctx.message.message_id
      );
    }
  } catch (error) {
    console.error('Photo message error:', error);
  }
});

// Callback query handlers
bot.on('callback_query', async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx, BOT_ID);
    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';

    // Language selection
    if (data.startsWith('lang_')) {
      const lang = data.split('_')[1];
      await handleLanguageChange(ctx, user, lang);
      return;
    }

    // Task verification
    if (data === 'check_channel' || data === 'check_group') {
      // Implement channel/group verification
      await ctx.answerCbQuery('Verifying...');
      // This would check membership and unlock rewards
      return;
    }

    // Start binding
    if (data === 'start_binding') {
      await handleBinding(ctx, user);
      await ctx.answerCbQuery();
      return;
    }

    // Share screenshot
    if (data === 'share_screenshot') {
      await handleScreenshotShare(ctx, user);
      await ctx.answerCbQuery();
      return;
    }

    // Exchange details
    if (data.startsWith('exchange_')) {
      const exchangeId = data.split('_')[1];
      await handleExchangeDetail(ctx, user, exchangeId);
      return;
    }

    // Back to tutorials
    if (data === 'back_to_tutorials') {
      await handleTutorials(ctx, user);
      await ctx.answerCbQuery();
      return;
    }

    // Red packet claim
    if (data.startsWith('claim_redpacket:')) {
      const redPacketId = data.split(':')[1];
      await handleRedPacketClaim(ctx, user, redPacketId);
      return;
    }

    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Callback query error:', error);
    await ctx.answerCbQuery('An error occurred');
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
});

// Start bot
const startBot = async () => {
  try {
    // Connect to Redis
    await connectStateRedis();
    await connectSettingsRedis();
    console.log('✓ Redis connections established');

    // Subscribe to settings updates
    subscribeToSettingsUpdates((botId) => {
      console.log(`Settings updated for bot: ${botId}`);
    });

    // Start bot
    await bot.launch();
    console.log('✓ Bot started successfully');

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
};

startBot();

export default bot;
