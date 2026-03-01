import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import dotenv from 'dotenv';
import axios from 'axios';
import { connectRedis as connectStateRedis } from './utils/state';
import { connectRedis as connectSettingsRedis, subscribeToSettingsUpdates } from './services/settings';
import { getOrCreateUser, getUserLanguage } from './services/user';
import { getMainKeyboard } from './keyboards/main';
import { getUserState } from './utils/state';

// Import handlers
import { handleStart } from './handlers/start';
import { handleMenu } from './handlers/menu';
import { handleWallet } from './handlers/wallet';
import { handleInvite } from './handlers/invite';
import { handleLanguageChange } from './handlers/language';
import { handleRedPacketClaim } from './handlers/redpacket';

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

    // Handle menu navigation
    await handleMenu(ctx);
  } catch (error) {
    console.error('Text message error:', error);
  }
});

// Photo handler
bot.on(message('photo'), async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx, BOT_ID);
    // Photo uploads can be handled in future features
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

// Group membership tracking
bot.on('my_chat_member', async (ctx) => {
  try {
    const chat = ctx.myChatMember.chat;
    if (chat.type === 'group' || chat.type === 'supergroup') {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      const newStatus = ctx.myChatMember.new_chat_member.status;
      if (newStatus === 'member' || newStatus === 'administrator') {
        await axios.post(`${backendUrl}/api/bot-auth/groups/register`, {
          bot_id: BOT_ID,
          group_id: chat.id,
          group_name: chat.title,
        }).catch(() => {}); // Ignore errors
      }
    }
  } catch (error) {
    console.error('my_chat_member error:', error);
  }
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
    // BOT_MODE env var takes precedence; USE_WEBHOOK is kept for backward compatibility
    const botMode = process.env.BOT_MODE || (process.env.USE_WEBHOOK === 'true' ? 'webhook' : 'polling');
    if (botMode === 'webhook') {
      const webhookDomain = process.env.WEBHOOK_DOMAIN;
      const botId = BOT_ID;
      await bot.telegram.setWebhook(`${webhookDomain}/webhook/${botId}`);
      console.log(`✓ Bot webhook set to ${webhookDomain}/webhook/${botId}`);
    } else {
      await bot.launch();
      console.log('✓ Bot started in polling mode');
    }

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
