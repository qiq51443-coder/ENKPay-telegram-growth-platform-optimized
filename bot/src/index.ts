import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import dotenv from 'dotenv';
import axios from 'axios';
import { connectRedis as connectStateRedis } from './utils/state';
import { connectRedis as connectSettingsRedis, subscribeToSettingsUpdates } from './services/settings';
import { getOrCreateUser, getUserLanguage } from './services/user';
import { getUser as getUserAPI } from './services/api';
import { getUserState, clearUserState } from './utils/state';

// Import handlers
import { handleStart } from './handlers/start';
import { handleMenu } from './handlers/menu';
import { handleWallet } from './handlers/wallet';
import { handleInlineQuery, handleInvite } from './handlers/invite';
import { handleLanguage, handleLanguageChange } from './handlers/language';
import { handleRedPacketClaim } from './handlers/redpacket';
import { handleDepositSelectNetwork, handleDepositShowAddress } from './handlers/deposit';
import {
  handleWithdrawSelectNetwork,
  handleWithdrawSelectNetworkCallback,
  handleWithdrawEnterAddress,
  handleWithdrawEnterAmount,
  handleWithdrawConfirm,
  handleWithdrawCancel,
  handleNumpadInput,
  handleNumpadDelete,
  handleNumpadConfirm,
} from './handlers/withdraw';
import {
  handleTransferStart,
  handleTransferEnterId,
  handleTransferConfirmRecipient,
  handleTransferEnterAmount,
  handleTransferConfirm,
  handleTransferCancel,
} from './handlers/transfer';
import { getSettings } from './services/settings';
import { t } from './i18n';

dotenv.config();

interface BotEntry {
  id: string;
  token: string;
  default_language: string;
  username?: string;
}

const GROUP_MEMBER_COUNT_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const groupMemberCountSyncCache = new Map<string, number>();

function shouldSyncGroupMemberCount(botId: string, chatId: number | string, force = false): boolean {
  if (force) return true;
  const key = `${botId}:${chatId}`;
  const lastSyncedAt = groupMemberCountSyncCache.get(key) || 0;
  return (Date.now() - lastSyncedAt) >= GROUP_MEMBER_COUNT_SYNC_INTERVAL_MS;
}

function markGroupMemberCountSynced(botId: string, chatId: number | string): void {
  groupMemberCountSyncCache.set(`${botId}:${chatId}`, Date.now());
}

function createBotInstance(entry: BotEntry): Telegraf {
  const BOT_ID = entry.id;
  const BOT_USERNAME = entry.username || '';
  const bot = new Telegraf(entry.token);

  // Middleware to attach bot ID to context
  bot.use((ctx, next) => {
    (ctx as any).botId = BOT_ID;
    return next();
  });

  // Start command
  bot.command('start', handleStart);

  // Text message handler
  bot.on(message('text'), async (ctx) => {
    try {
      const chat = ctx.chat;
      if (chat && (chat.type === 'group' || chat.type === 'supergroup') && shouldSyncGroupMemberCount(BOT_ID, chat.id)) {
        markGroupMemberCountSynced(BOT_ID, chat.id);
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
        try {
          const memberCount = await ctx.telegram.callApi('getChatMemberCount', { chat_id: chat.id });
          await axios.post(`${backendUrl}/api/bot-auth/groups/register`, {
            bot_id: BOT_ID,
            bot_username: BOT_USERNAME,
            group_id: chat.id,
            group_name: (chat as any).title || '',
            group_type: chat.type,
            member_count: memberCount,
          }, {
            headers: { 'X-Bot-Id': BOT_ID },
            timeout: 8000,
          });
        } catch (e) {
          console.warn(`[bot ${BOT_ID}] Failed to sync member count for ${chat.id}:`, (e as any)?.message || e);
        }
      }

      const user = await getOrCreateUser(ctx, BOT_ID);
      const state = await getUserState(user.id.toString());

      if (state?.step) {
        const text = ctx.message.text;

        switch (state.step) {
          case 'withdraw_enter_address':
            await handleWithdrawEnterAddress(ctx, user, text);
            return;

          case 'withdraw_enter_amount':
            await handleWithdrawEnterAmount(ctx, user, text);
            return;

          case 'transfer_enter_id':
            await handleTransferEnterId(ctx, user, text);
            return;

          case 'transfer_enter_amount':
            await handleTransferEnterAmount(ctx, user, text);
            return;
        }
      }

      await handleMenu(ctx);
    } catch (error) {
      console.error(`[bot ${BOT_ID}] Text message error:`, error);
    }
  });

  // Photo handler
  bot.on(message('photo'), async (ctx) => {
    try {
      await getOrCreateUser(ctx, BOT_ID);
    } catch (error) {
      console.error(`[bot ${BOT_ID}] Photo message error:`, error);
    }
  });

  // Callback query handlers
  bot.on('callback_query', async (ctx) => {
    try {
      // Pre-check: detect if user is new before auto-registration (for claim_redpacket notification)
      const cbData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
      let isNewUserRegistration = false;
      if (cbData.startsWith('claim_redpacket:') && ctx.from) {
        const existingUser = await getUserAPI(BOT_ID, ctx.from.id).catch(() => null);
        isNewUserRegistration = !existingUser;
      }

      const user = await getOrCreateUser(ctx, BOT_ID);
      const lang = getUserLanguage(user);
      const data = cbData;

      if (data.startsWith('lang_')) {
        const langCode = data.split('_')[1];
        await handleLanguageChange(ctx, user, langCode);
        return;
      }

      if (data === 'check_channel' || data === 'check_group') {
        await ctx.answerCbQuery('Verifying...');
        return;
      }

      if (data.startsWith('claim_redpacket:')) {
        const redPacketId = data.split(':')[1];
        await handleRedPacketClaim(ctx, user, redPacketId, BOT_ID, { isNew: isNewUserRegistration, defaultLanguage: entry.default_language });
        return;
      }

      if (data === 'wallet_deposit') {
        await handleDepositSelectNetwork(ctx);
        return;
      }

      if (data === 'wallet_withdraw') {
        await handleWithdrawSelectNetwork(ctx);
        return;
      }

      if (data === 'wallet_transfer') {
        await handleTransferStart(ctx);
        return;
      }

      if (data === 'wallet_support') {
        await ctx.answerCbQuery();
        const settings = await getSettings(BOT_ID).catch(() => ({})) as Record<string, any>;
        const supportUsername = settings.support_telegram;
        if (supportUsername) {
          await ctx.reply(`Contact support: https://t.me/${supportUsername}`);
        } else {
          await ctx.reply(t(lang, 'help_contact'));
        }
        return;
      }

      if (data === 'wallet_language') {
        await ctx.answerCbQuery();
        await handleLanguage(ctx, user);
        return;
      }

      if (data === 'wallet_back' || data === 'wallet_back_to_wallet' ||
          data === 'deposit_back' || data === 'withdraw_back' ||
          data === 'transfer_back' || data === 'language_back' ||
          data === 'support_back') {
        await clearUserState(user.id.toString());
        await ctx.answerCbQuery();
        if (data === 'wallet_back') {
          await handleStart(ctx);
        } else {
          await handleWallet(ctx, user);
        }
        return;
      }

      if (data.startsWith('deposit_net_')) {
        const networkId = data.replace('deposit_net_', '');
        await handleDepositShowAddress(ctx, networkId);
        return;
      }

      if (data.startsWith('withdraw_network:')) {
        const networkId = data.split(':')[1];
        await handleWithdrawSelectNetworkCallback(ctx, networkId);
        return;
      }

      if (data === 'withdraw_confirm') {
        await handleWithdrawConfirm(ctx);
        return;
      }

      if (data === 'withdraw_cancel') {
        await handleWithdrawCancel(ctx);
        return;
      }

      if (data === 'transfer_confirm_recipient') {
        await handleTransferConfirmRecipient(ctx);
        return;
      }

      if (data === 'transfer_confirm') {
        await handleTransferConfirm(ctx);
        return;
      }

      if (data === 'transfer_cancel') {
        await handleTransferCancel(ctx);
        return;
      }

      if (data.startsWith('numpad:')) {
        const digit = data.split(':')[1];
        await handleNumpadInput(ctx, digit);
        return;
      }

      if (data === 'numpad_delete') {
        await handleNumpadDelete(ctx);
        return;
      }

      if (data === 'numpad_confirm') {
        await handleNumpadConfirm(ctx);
        return;
      }

      if (data === 'copy_noop') {
        await ctx.answerCbQuery();
        return;
      }

      await ctx.answerCbQuery();
    } catch (error) {
      console.error(`[bot ${BOT_ID}] Callback query error:`, error);
      await ctx.answerCbQuery('An error occurred');
    }
  });

  bot.on('inline_query', async (ctx) => {
    try {
      await handleInlineQuery(ctx, BOT_ID);
    } catch (error) {
      console.error(`[bot ${BOT_ID}] Inline query error:`, error);
      await ctx.answerInlineQuery([], { cache_time: 0 });
    }
  });

  // Error handling
  bot.catch((err, ctx) => {
    console.error(`[bot ${BOT_ID}] Bot error:`, err);
  });

  // Group membership tracking
  bot.on('my_chat_member', async (ctx) => {
    try {
      const chat = ctx.myChatMember.chat;
      if (chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel') {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
        const newStatus = ctx.myChatMember.new_chat_member.status;

        if (newStatus === 'member' || newStatus === 'administrator') {
          // Fetch member count before registering (best-effort)
          let memberCount: number | null = null;
          markGroupMemberCountSynced(BOT_ID, chat.id);
          try {
            memberCount = await ctx.telegram.callApi('getChatMemberCount', { chat_id: chat.id });
          } catch (e) {
            console.warn(`[bot ${BOT_ID}] Failed to get member count for ${chat.id}:`, e);
          }

          // Register group with retry (up to 3 attempts, 2-second delay between each)
          const registerWithRetry = async (attempt = 1): Promise<void> => {
            try {
              await axios.post(`${backendUrl}/api/bot-auth/groups/register`, {
                bot_id: BOT_ID,
                bot_username: BOT_USERNAME,
                group_id: chat.id,
                group_name: (chat as any).title || '',
                group_type: chat.type,
                member_count: memberCount,
              }, {
                headers: { 'X-Bot-Id': BOT_ID },
                timeout: 8000,
              });
              console.log(`[bot ${BOT_ID}] ✓ Group ${chat.id} (${(chat as any).title}) registered`);

              // Send welcome message (best-effort, fire-and-forget)
              ctx.telegram.sendMessage(
                chat.id,
                '🤖 机器人已加入群组！发送 /start 查看功能。'
              ).catch(() => {});
            } catch (err: any) {
              if (attempt < 3) {
                console.warn(`[bot ${BOT_ID}] Group registration attempt ${attempt} failed, retrying in 2s...`);
                await new Promise(r => setTimeout(r, 2000));
                return registerWithRetry(attempt + 1);
              }
              console.error(`[bot ${BOT_ID}] Group registration failed after 3 attempts:`, err?.message);
            }
          };

          await registerWithRetry();

        } else if (newStatus === 'kicked' || newStatus === 'left') {
          // Bot was removed — mark the group as inactive
          axios.post(`${backendUrl}/api/bot-auth/groups/register`, {
            bot_id: BOT_ID,
            group_id: chat.id,
            group_name: (chat as any).title || '',
            group_type: chat.type,
            is_leaving: true,
          }, {
            headers: { 'X-Bot-Id': BOT_ID },
            timeout: 8000,
          }).then(() => {
            console.log(`[bot ${BOT_ID}] ✓ Group ${chat.id} marked as inactive (status: ${newStatus})`);
          }).catch((err) => {
            console.error(`[bot ${BOT_ID}] Failed to deactivate group ${chat.id}:`, err?.message);
          });
        }
      }
    } catch (error) {
      console.error(`[bot ${BOT_ID}] my_chat_member error:`, error);
    }
  });

  return bot;
}

async function fetchActiveBots(retries = 5, delayMs = 5000): Promise<BotEntry[]> {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  const serviceToken = process.env.SERVICE_TOKEN;

  if (serviceToken) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(`${backendUrl}/api/admin/bots`, {
          headers: { Authorization: `Bearer ${serviceToken}` },
          timeout: 10000,
        });
        return (response.data.bots || [])
          .filter((b: any) => b.is_active && b.token)
          .map((b: any) => ({ id: b.id, token: b.token, default_language: b.default_language || 'en', username: b.username }));
      } catch (error: any) {
        const isLastAttempt = attempt === retries;
        if (isLastAttempt) {
          console.warn(`[fetchActiveBots] All ${retries} attempts failed. Falling back to BOT_TOKEN env.`, error?.message);
        } else {
          console.warn(`[fetchActiveBots] Attempt ${attempt}/${retries} failed, retrying in ${delayMs}ms...`, error?.message);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  // Fallback: use BOT_TOKEN and BOT_ID env vars (single-bot legacy mode)
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const BOT_ID = process.env.BOT_ID || 'default';
  if (BOT_TOKEN) {
    return [{ id: BOT_ID, token: BOT_TOKEN, default_language: process.env.BOT_DEFAULT_LANGUAGE || 'en' }];
  }

  return [];
}

// Start all bots
const startBots = async () => {
  try {
    // Connect to Redis
    await connectStateRedis();
    await connectSettingsRedis();
    console.log('✓ Redis connections established');

    // Subscribe to settings updates
    subscribeToSettingsUpdates((botId) => {
      console.log(`Settings updated for bot: ${botId}`);
    });

    // Fetch active bots
    const botEntries = await fetchActiveBots();

    if (botEntries.length === 0) {
      console.error('No active bots found. Set BOT_TOKEN env or ensure backend API is accessible.');
      process.exit(1);
    }

    const botMode = process.env.BOT_MODE || (process.env.USE_WEBHOOK === 'true' ? 'webhook' : 'polling');
    const webhookDomain = process.env.WEBHOOK_DOMAIN;

    const bots: Telegraf[] = [];

    for (const entry of botEntries) {
      console.log(`Starting bot ${entry.id}...`);
      const bot = createBotInstance(entry);

      if (botMode === 'webhook' && webhookDomain) {
        await bot.telegram.setWebhook(`${webhookDomain}/webhook/${entry.id}`, {
          allowed_updates: ['message', 'callback_query', 'inline_query', 'chat_member', 'my_chat_member'],
        });
        console.log(`✓ Bot ${entry.id} webhook set to ${webhookDomain}/webhook/${entry.id}`);
      } else {
        await bot.launch({
          allowedUpdates: ['message', 'callback_query', 'inline_query', 'chat_member', 'my_chat_member'],
        });
        console.log(`✓ Bot ${entry.id} started in polling mode`);
        bots.push(bot);
      }
    }

    // Enable graceful stop for polling bots
    process.once('SIGINT', () => bots.forEach(b => b.stop('SIGINT')));
    process.once('SIGTERM', () => bots.forEach(b => b.stop('SIGTERM')));
  } catch (error) {
    console.error('Failed to start bots:', error);
    process.exit(1);
  }
};

startBots();
