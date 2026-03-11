import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { query } from '../db';
import { t, isSupportedLang, SUPPORTED_LANGUAGE_CODES } from '../i18n';
import { generateUserDepositAddress } from './deposit.service';

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

interface BotInstance {
  botId: string;
  token: string;
  defaultLanguage: string;
  telegraf: Telegraf;
}

interface User {
  id: string;
  bot_id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code: string;
  robot_user_id: string;
  unique_id?: string;
  invite_code: string;
  balance: number;
  wallet_balance?: number;
  red_packet_credits?: number;
  account_status?: string;
  [key: string]: any;
}

interface UserState {
  step: string;
  data: Record<string, any>;
  updatedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory user state (avoids Redis dependency)
// ─────────────────────────────────────────────────────────────────────────────

const userStates = new Map<string, UserState>();

function setUserState(userId: string, state: Omit<UserState, 'updatedAt'>): void {
  userStates.set(userId, { ...state, updatedAt: Date.now() });
}

function getUserState(userId: string): UserState | undefined {
  const state = userStates.get(userId);
  if (!state) return undefined;
  // Auto-expire states older than 30 minutes
  if (Date.now() - state.updatedAt > 30 * 60 * 1000) {
    userStates.delete(userId);
    return undefined;
  }
  return state;
}

function clearUserState(userId: string): void {
  userStates.delete(userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

/** Generate an 11-character order ID (letters + digits) */
function generateOrderId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 11; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Generate a unique 7-character user ID (avoids ambiguous chars O/0/I/l/1) */
async function generateUserUniqueId(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    let id = '';
    for (let i = 0; i < 7; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await query('SELECT id FROM users WHERE unique_id = $1', [id]);
    if (existing.rows.length === 0) return id;
  }
  // Fallback: timestamp-based unique ID
  return `U${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getOrCreateUser(ctx: Context, botId: string, inviteCodeUsed?: string): Promise<User> {
  const tgUser = ctx.from!;

  // Try to find existing user for this specific bot
  const existing = await query(
    'SELECT * FROM users WHERE telegram_id = $1 AND bot_id = $2',
    [tgUser.id, botId]
  );
  if (existing.rows.length > 0) {
    // Update username/name if changed and return fresh data (including latest balance)
    const updated = await query(
      'UPDATE users SET username = $1, first_name = $2, last_name = $3, last_active_at = NOW() WHERE id = $4 RETURNING *',
      [tgUser.username || null, tgUser.first_name || null, tgUser.last_name || null, existing.rows[0].id]
    );
    return updated.rows[0];
  }

  // Check if user exists for ANY other bot (cross-bot unification)
  const existingAnyBot = await query(
    'SELECT * FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1',
    [tgUser.id]
  );

  // Resolve inviter
  let invitedBy = null;
  if (inviteCodeUsed) {
    const inviterResult = await query(
      'SELECT id FROM users WHERE unique_id = $1 OR invite_code = $1',
      [inviteCodeUsed]
    );
    if (inviterResult.rows.length > 0) {
      invitedBy = inviterResult.rows[0].id;
    }
  }

  // Get initial credits from bot settings
  let initialCredits = 3;
  try {
    const settingsResult = await query(
      'SELECT new_user_credits FROM bot_settings WHERE bot_id = $1',
      [botId]
    );
    if (settingsResult.rows.length > 0 && settingsResult.rows[0].new_user_credits != null) {
      initialCredits = settingsResult.rows[0].new_user_credits;
    }
  } catch (err: any) {
    // bot_settings table may not exist yet — use default. Log non-table-missing errors.
    if (!String(err?.message).includes('does not exist')) {
      console.warn(`[bot ${botId}] Could not read bot_settings:`, err?.message);
    }
  }

  if (existingAnyBot.rows.length > 0) {
    // User exists for another bot — create linked entry copying shared identity/balance fields
    const source = existingAnyBot.rows[0];
    const createResult = await query(
      `INSERT INTO users (bot_id, telegram_id, username, first_name, last_name, language_code,
       invited_by, red_packet_credits, wallet_balance, reward_balance, frozen_balance,
       platform_username, platform_bound, platform_status, account_status,
       channel_followed, group_joined, follow_reward_unlocked, bind_reward_unlocked, last_active_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
       ON CONFLICT (bot_id, telegram_id) DO UPDATE SET last_active_at = NOW()
       RETURNING *`,
      [
        botId,
        tgUser.id,
        tgUser.username || null,
        tgUser.first_name || null,
        tgUser.last_name || null,
        source.language_code || tgUser.language_code || 'en',
        invitedBy || source.invited_by,
        source.red_packet_credits ?? initialCredits,
        source.wallet_balance ?? 0,
        source.reward_balance ?? 0,
        source.frozen_balance ?? 0,
        source.platform_username,
        source.platform_bound,
        source.platform_status,
        source.account_status,
        source.channel_followed,
        source.group_joined,
        source.follow_reward_unlocked,
        source.bind_reward_unlocked,
      ]
    );
    return createResult.rows[0];
  }

  // Brand new user — generate unique_id
  let newUniqueId: string;
  try {
    newUniqueId = await generateUserUniqueId();
  } catch {
    newUniqueId = `U${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }

  const createResult = await query(
    `INSERT INTO users (bot_id, telegram_id, username, first_name, last_name, language_code,
     invited_by, red_packet_credits, wallet_balance, reward_balance, frozen_balance, unique_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0, $9)
     ON CONFLICT (bot_id, telegram_id) DO UPDATE SET last_active_at = NOW()
     RETURNING *`,
    [
      botId,
      tgUser.id,
      tgUser.username || null,
      tgUser.first_name || null,
      tgUser.last_name || null,
      tgUser.language_code || 'en',
      invitedBy,
      initialCredits,
      newUniqueId,
    ]
  );
  return createResult.rows[0];
}

async function getPrimaryUniqueId(telegramId: number): Promise<string | null> {
  const result = await query(
    'SELECT unique_id FROM users WHERE telegram_id = $1 AND unique_id IS NOT NULL ORDER BY created_at ASC LIMIT 1',
    [telegramId]
  );
  return result.rows[0]?.unique_id || null;
}

async function getUnifiedBalance(telegramId: number): Promise<number> {
  const result = await query(
    'SELECT wallet_balance FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1',
    [telegramId]
  );
  return parseFloat(String(result.rows[0]?.wallet_balance ?? 0));
}

async function getBotSettings(botId: string): Promise<Record<string, any>> {
  const settings: Record<string, any> = {};
  try {
    const result = await query('SELECT * FROM bot_settings WHERE bot_id = $1', [botId]);
    Object.assign(settings, result.rows[0] || {});
  } catch {
    // bot_settings table may not exist yet
  }

  // Augment with system_settings if webapp_url not in bot_settings
  if (!settings.webapp_url) {
    try {
      const sysResult = await query(
        "SELECT value FROM system_settings WHERE key = 'mini_app_url' LIMIT 1"
      );
      if (sysResult.rows.length > 0) {
        const raw = sysResult.rows[0].value;
        const url = typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : '';
        if (url && url.startsWith('http')) settings.webapp_url = url;
      }
    } catch {}
  }

  return settings;
}

function resolveUserLang(user: User, defaultLanguage: string): string {
  let lang = user.language_code;
  if (!lang || !isSupportedLang(lang)) lang = defaultLanguage;
  if (!lang || !isSupportedLang(lang)) lang = 'en';
  return lang;
}

async function buildWelcomeText(user: User, lang: string, settings: Record<string, any>): Promise<string> {
  if (settings.welcome_message) {
    if (typeof settings.welcome_message === 'object') {
      const msg = settings.welcome_message[lang]
        || settings.welcome_message['en']
        || settings.welcome_message[Object.keys(settings.welcome_message)[0]];
      if (msg) return msg;
    } else if (typeof settings.welcome_message === 'string' && settings.welcome_message.trim()) {
      return settings.welcome_message;
    }
  }
  const displayId = await getPrimaryUniqueId(user.telegram_id) || user.unique_id || user.robot_user_id || 'N/A';
  const balance = (await getUnifiedBalance(user.telegram_id)).toFixed(2);
  return `${t(lang, 'welcome_title')}\n\n` +
    `🆔 ${t(lang, 'your_unique_id')}: <b>${displayId}</b>\n` +
    `💰 ${t(lang, 'your_balance')}: <b>${balance} USDT</b>\n\n` +
    t(lang, 'welcome_description');
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildNumpad(lang: string, currentInput: string) {
  const filled = currentInput.length;
  const display = '●'.repeat(filled) + '○'.repeat(Math.max(0, 4 - filled));
  return Markup.inlineKeyboard([
    [{ text: display, callback_data: 'numpad_noop' }],
    [
      Markup.button.callback('1', 'numpad:1'),
      Markup.button.callback('2', 'numpad:2'),
      Markup.button.callback('3', 'numpad:3'),
    ],
    [
      Markup.button.callback('4', 'numpad:4'),
      Markup.button.callback('5', 'numpad:5'),
      Markup.button.callback('6', 'numpad:6'),
    ],
    [
      Markup.button.callback('7', 'numpad:7'),
      Markup.button.callback('8', 'numpad:8'),
      Markup.button.callback('9', 'numpad:9'),
    ],
    [
      Markup.button.callback(t(lang, 'numpad_delete'), 'numpad_delete'),
      Markup.button.callback('0', 'numpad:0'),
      Markup.button.callback(t(lang, 'numpad_confirm'), 'numpad_confirm'),
    ],
    [Markup.button.callback(t(lang, 'btn_cancel'), 'wallet_back_to_wallet')],
  ]);
}

function resolveWebAppUrl(settings: Record<string, any>): string | null {
  if (settings.webapp_url) return settings.webapp_url;
  if (process.env.WEBAPP_URL) return process.env.WEBAPP_URL;
  if (process.env.BACKEND_URL) return `${process.env.BACKEND_URL}/app`;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core business logic
// ─────────────────────────────────────────────────────────────────────────────

/** Submit a withdrawal record to the database */
async function processWithdrawal(ctx: Context, user: User, lang: string, data: any): Promise<void> {
  try {
    await ctx.reply(t(lang, 'withdraw_processing'));

    // Resolve numeric network_id
    let networkIdInt: number | null = null;
    if (data.networkId && !isNaN(parseInt(String(data.networkId)))) {
      networkIdInt = parseInt(String(data.networkId));
    } else if (data.networkId) {
      try {
        const netResult = await query(
          'SELECT id FROM deposit_networks WHERE network_name = $1 LIMIT 1',
          [data.networkId]
        );
        if (netResult.rows.length > 0) networkIdInt = netResult.rows[0].id;
      } catch {}
    }

    if (!networkIdInt) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    // Verify sufficient balance
    const balRes = await query('SELECT wallet_balance FROM users WHERE id = $1', [user.id]);
    const balance = parseFloat(String(balRes.rows[0]?.wallet_balance ?? 0));
    if (balance < data.amount) {
      await ctx.reply(
        t(lang, 'insufficient_balance').replace('{balance}', balance.toFixed(2))
      );
      return;
    }

    const orderId = generateOrderId();
    await query(
      `INSERT INTO withdrawal_records
        (user_id, network_id, amount, fee, actual_amount, to_address, status, order_id)
       VALUES ($1, $2, $3, 0, $3, $4, 'pending', $5)`,
      [user.id, networkIdInt, data.amount, data.address, orderId]
    );

    // Resolve network display name
    let networkName: string = data.networkName || '';
    if (!networkName && networkIdInt) {
      try {
        const netRes = await query('SELECT network_display, network_name FROM deposit_networks WHERE id = $1 LIMIT 1', [networkIdInt]);
        if (netRes.rows.length > 0) {
          networkName = netRes.rows[0].network_display || netRes.rows[0].network_name;
        }
      } catch {}
    }
    if (!networkName) networkName = String(data.networkId || '-');

    await ctx.replyWithHTML(
      `✅ <b>${t(lang, 'withdraw_success_title')}</b>\n\n` +
      `┌─────────────────────────\n` +
      `│ 📋 ${t(lang, 'withdraw_success_order')}: <code>${orderId}</code>\n` +
      `│ 💰 ${t(lang, 'withdraw_success_amount')}: <b>${Number(data.amount).toFixed(2)} USDT</b>\n` +
      `│ 🌐 ${t(lang, 'withdraw_success_network')}: <b>${networkName}</b>\n` +
      `│ 📤 ${t(lang, 'withdraw_success_address')}: <code>${data.address}</code>\n` +
      `└─────────────────────────`
    );
  } catch (err: any) {
    console.error('processWithdrawal error:', err);
    await ctx.reply(t(lang, 'error'));
  }
}

/** Execute a transfer between two users */
async function processTransfer(ctx: Context, user: User, lang: string, data: any): Promise<void> {
  try {
    await ctx.reply(t(lang, 'transfer_processing'));

    // Verify sufficient balance
    const balRes = await query('SELECT wallet_balance FROM users WHERE id = $1', [user.id]);
    const balance = parseFloat(String(balRes.rows[0]?.wallet_balance ?? 0));
    if (balance < data.amount) {
      await ctx.reply(
        t(lang, 'transfer_insufficient_balance').replace('{balance}', balance.toFixed(2))
      );
      return;
    }

    const orderId = generateOrderId();

    // Execute in a transaction
    await query('BEGIN');
    try {
      await query(
        `UPDATE users
         SET wallet_balance = wallet_balance - $1,
             total_transferred_out = COALESCE(total_transferred_out, 0) + $1
         WHERE id = $2`,
        [data.amount, user.id]
      );
      await query(
        `UPDATE users
         SET wallet_balance = COALESCE(wallet_balance, 0) + $1,
             total_transferred_in = COALESCE(total_transferred_in, 0) + $1
         WHERE id = $2`,
        [data.amount, data.recipientId]
      );
      await query(
        `INSERT INTO transfer_records
          (from_user_id, to_user_id, amount, fee, actual_received, status, order_id)
         VALUES ($1, $2, $3, 0, $3, 'completed', $4)`,
        [user.id, data.recipientId, data.amount, orderId]
      );
      await query('COMMIT');
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

    await ctx.replyWithHTML(
      `✅ ${t(lang, 'transfer_success')}\n\n📋 Order: <code>${orderId}</code>`
    );

    // Notify recipient
    if (data.recipientTelegramId) {
      try {
        const rLang = data.recipientLanguage || 'en';
        const notifyMsg =
          `${t(rLang, 'transfer_received')}\n\n` +
          `👤 From: <b>${user.first_name || user.username || '-'}</b>\n` +
          `💵 Amount: <b>${Number(data.amount).toFixed(2)} USDT</b>`;
        await ctx.telegram.sendMessage(data.recipientTelegramId, notifyMsg, { parse_mode: 'HTML' });
      } catch {}
    }
  } catch (err: any) {
    console.error('processTransfer error:', err);
    await ctx.reply(t(lang, 'error'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bot handler setup
// ─────────────────────────────────────────────────────────────────────────────

function setupBotHandlers(bot: Telegraf, botId: string, defaultLanguage: string) {
  // Inject botId into every context
  bot.use((ctx, next) => {
    (ctx as any).botId = botId;
    return next();
  });

  // ── /start command ─────────────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    try {
      if (!ctx.from) return;

      const startPayload = ctx.message && 'text' in ctx.message
        ? ctx.message.text.split(' ')[1]
        : undefined;

      let inviteCodeUsed: string | undefined;
      if (startPayload && startPayload.startsWith('REF_')) {
        inviteCodeUsed = startPayload.substring(4);
      }

      const user = await getOrCreateUser(ctx, botId, inviteCodeUsed);
      const lang = resolveUserLang(user, defaultLanguage);
      const settings = await getBotSettings(botId);
      const webAppUrl = resolveWebAppUrl(settings);

      const welcomeText = await buildWelcomeText(user, lang, settings);
      const keyboardRows: any[][] = [
        [Markup.button.text(t(lang, 'btn_my_wallet')), Markup.button.text(t(lang, 'btn_invite'))],
      ];
      if (webAppUrl) {
        keyboardRows.push([Markup.button.webApp(t(lang, 'btn_open_app'), webAppUrl)]);
      }

      await ctx.replyWithHTML(welcomeText, Markup.keyboard(keyboardRows).resize());
    } catch (error) {
      console.error(`[bot ${botId}] Start handler error:`, error);
      try { await ctx.reply('An error occurred. Please try again.'); } catch {}
    }
  });

  // ── ENK group command (in group/supergroup chats) ─────────────────────────
  bot.on(message('text'), async (ctx, next) => {
    try {
      const chatType = ctx.chat?.type;
      if (chatType !== 'group' && chatType !== 'supergroup') return next();
      const text = (ctx.message as any).text?.trim() || '';
      if (!/^(ENK|\/enk(@\S+)?)$/i.test(text)) return next();

      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const userResult = await query(
        'SELECT * FROM users WHERE telegram_id = $1 AND bot_id = $2 LIMIT 1',
        [telegramId, botId]
      );

      if (userResult.rows.length === 0) {
        await ctx.reply('您还没有注册，请私信机器人开始使用。');
        return;
      }

      const groupUser: User = userResult.rows[0];
      const lang = resolveUserLang(groupUser, defaultLanguage);
      const walletCard = await buildWalletCardText(groupUser, lang);
      await ctx.replyWithHTML(walletCard);
    } catch (error) {
      console.error(`[bot ${botId}] ENK group command error:`, error);
      return next(); // IMPORTANT: call next() on error so private chat handlers still run
    }
  });

  // ── Text message handler (menu navigation + multi-step state flows) ─────────
  bot.on(message('text'), async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx, botId);
      const lang = resolveUserLang(user, defaultLanguage);
      const text = ctx.message.text;
      const userId = user.id;

      // Check for active user state (multi-step flows)
      const state = getUserState(userId);
      if (state) {
        switch (state.step) {
          // ── Withdraw: address input ──
          case 'withdraw_enter_address': {
            const address = text.trim();
            if (!address) {
              await ctx.reply(t(lang, 'error'));
              return;
            }
            // Validate address format based on selected network
            const networkId: string = state.data?.networkId || '';
            const net = networkId.toUpperCase();
            let addressValid = true;
            if (net === 'TRC' || net.includes('TRC')) {
              addressValid = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
            } else if (net === 'BSC' || net === 'ETH' || net.includes('BSC') || net.includes('ETH') || net.includes('ERC')) {
              addressValid = /^0x[0-9a-fA-F]{40}$/.test(address);
            }
            if (!addressValid) {
              const networkName: string = state.data?.networkName || networkId;
              await ctx.reply(
                t(lang, 'invalid_address').replace('{network}', networkName)
              );
              return;
            }
            setUserState(userId, { step: 'withdraw_enter_amount', data: { ...state.data, address } });
            await ctx.reply(t(lang, 'withdraw_enter_amount'));
            return;
          }

          // ── Withdraw: amount input ──
          case 'withdraw_enter_amount': {
            const amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0) {
              await ctx.reply(t(lang, 'error'));
              return;
            }
            const d: Record<string, any> = { ...state.data, amount };
            setUserState(userId, { step: 'withdraw_need_password', data: d });

            const confirmMsg =
              `📤 <b>${t(lang, 'withdraw_confirm_info')}</b>\n\n` +
              `🌐 Network: <b>${d.networkName || d.networkId}</b>\n` +
              `📍 Address: <code>${d.address}</code>\n` +
              `💵 Amount: <b>${amount.toFixed(2)} USDT</b>`;

            await ctx.replyWithHTML(confirmMsg, Markup.inlineKeyboard([
              [
                Markup.button.callback(t(lang, 'btn_confirm'), 'withdraw_confirm'),
                Markup.button.callback(t(lang, 'btn_cancel'), 'wallet_back_to_wallet'),
              ],
            ]));
            return;
          }

          // ── Transfer: recipient ID input ──
          case 'transfer_enter_id': {
            const recipientUniqueId = text.trim();
            if (!recipientUniqueId) {
              await ctx.reply(t(lang, 'transfer_invalid_recipient_id'));
              return;
            }
            let recipient: any = null;
            try {
              const result = await query(
                'SELECT * FROM users WHERE unique_id = $1 LIMIT 1',
                [recipientUniqueId]
              );
              if (result.rows.length > 0) recipient = result.rows[0];
            } catch {}

            if (!recipient) {
              await ctx.reply(t(lang, 'transfer_invalid_recipient_id'));
              return;
            }
            if (recipient.id === user.id) {
              await ctx.reply(t(lang, 'error'));
              return;
            }

            setUserState(userId, {
              step: 'transfer_confirm_recipient',
              data: {
                recipientId: recipient.id,
                recipientTelegramId: recipient.telegram_id,
                recipientLanguage: recipient.language_code || 'en',
                recipientName: recipient.first_name || recipient.username || recipientUniqueId,
                recipientUniqueId,
              },
            });

            const confirmMsg =
              `👤 <b>${t(lang, 'transfer_confirm_recipient')}</b>\n\n` +
              `🆔 ID: <b>${recipientUniqueId}</b>\n` +
              `👤 Name: <b>${recipient.first_name || recipient.username || '-'}</b>`;

            await ctx.replyWithHTML(confirmMsg, Markup.inlineKeyboard([
              [
                Markup.button.callback(t(lang, 'btn_confirm'), 'transfer_confirm_recipient'),
                Markup.button.callback(t(lang, 'btn_cancel'), 'wallet_back_to_wallet'),
              ],
            ]));
            return;
          }

          // ── Transfer: amount input ──
          case 'transfer_enter_amount': {
            const amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0) {
              await ctx.reply(t(lang, 'error'));
              return;
            }
            const d: Record<string, any> = { ...state.data, amount };
            setUserState(userId, { step: 'transfer_need_password', data: d });

            const confirmMsg =
              `💸 <b>${t(lang, 'transfer_confirm_recipient')}</b>\n\n` +
              `👤 To: <b>${d.recipientName || d.recipientUniqueId}</b>\n` +
              `💵 Amount: <b>${amount.toFixed(2)} USDT</b>`;

            await ctx.replyWithHTML(confirmMsg, Markup.inlineKeyboard([
              [
                Markup.button.callback(t(lang, 'btn_confirm'), 'transfer_confirm'),
                Markup.button.callback(t(lang, 'btn_cancel'), 'wallet_back_to_wallet'),
              ],
            ]));
            return;
          }

          default:
            break;
        }
      }

      // Standard menu navigation
      const ALL_LANGS = Array.from(SUPPORTED_LANGUAGE_CODES);
      const walletButtons = ALL_LANGS.map(l => t(l, 'btn_my_wallet'));
      const inviteButtons = ALL_LANGS.map(l => t(l, 'btn_invite'));

      if (walletButtons.includes(text)) {
        await handleWallet(ctx, botId, user, lang);
        return;
      }
      if (inviteButtons.includes(text)) {
        await handleInvite(ctx, botId, user, lang);
        return;
      }
    } catch (error) {
      console.error(`[bot ${botId}] Text message error:`, error);
      try { await ctx.reply(t(defaultLanguage, 'error')); } catch (replyErr) {
        console.error(`[bot ${botId}] Failed to send error reply:`, replyErr);
      }
    }
  });

  // ── Callback query handler ─────────────────────────────────────────────────
  bot.on('callback_query', async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx, botId);
      const lang = resolveUserLang(user, defaultLanguage);
      const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';

      // ── Language selection ──────────────────────────────────────────────────
      if (data.startsWith('lang_')) {
        const newLang = data.split('_')[1];
        try {
          await query('UPDATE users SET language_code = $1 WHERE id = $2', [newLang, user.id]);
        } catch (err) {
          console.warn(`[bot ${botId}] Failed to update user language:`, err);
        }
        await ctx.answerCbQuery(t(newLang, 'language_changed') || 'Language updated!');
        try { await ctx.deleteMessage(); } catch {}
        const updatedUser = { ...user, language_code: newLang };
        const settings = await getBotSettings(botId);
        const welcomeText = await buildWelcomeText(updatedUser, newLang, settings);
        const webAppUrl = resolveWebAppUrl(settings);
        const keyboardRows: any[][] = [
          [Markup.button.text(t(newLang, 'btn_my_wallet')), Markup.button.text(t(newLang, 'btn_invite'))],
        ];
        if (webAppUrl) {
          keyboardRows.push([Markup.button.webApp(t(newLang, 'btn_open_app'), webAppUrl)]);
        }
        await ctx.replyWithHTML(welcomeText, Markup.keyboard(keyboardRows).resize());
        return;
      }

      // ── Deposit: show network list ──────────────────────────────────────────
      if (data === 'wallet_deposit') {
        await ctx.answerCbQuery();
        const balance = (await getUnifiedBalance(user.telegram_id)).toFixed(2);

        let networkButtons: any[] = [];
        try {
          const networksResult = await query(
            'SELECT DISTINCT ON (network_name) id, network_name, network_display FROM deposit_networks WHERE is_active = true ORDER BY network_name, sort_order'
          );
          if (networksResult.rows.length > 0) {
            networkButtons = networksResult.rows.map((n: any) =>
              [Markup.button.callback(n.network_display || n.network_name, `deposit_net_${n.id}`)]
            );
          }
        } catch (err) {
          console.warn(`[bot ${botId}] Could not load deposit networks:`, err);
        }

        if (networkButtons.length === 0) {
          networkButtons = [
            [Markup.button.callback('TRC20 (USDT)', 'deposit_net_TRC')],
            [Markup.button.callback('BSC (BEP20)', 'deposit_net_BSC')],
            [Markup.button.callback('ETH (ERC20)', 'deposit_net_ETH')],
          ];
        }

        networkButtons.push([Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')]);
        try { await ctx.deleteMessage(); } catch {}
        await ctx.replyWithHTML(
          `📥 <b>${t(lang, 'btn_deposit')}</b>\n\n` +
          `💰 ${t(lang, 'wallet_balance')}: <b>${balance} USDT</b>\n\n` +
          `${t(lang, 'select_network')}:`,
          Markup.inlineKeyboard(networkButtons)
        );
        return;
      }

      // ── Deposit: show address for selected network ──────────────────────────
      if (data.startsWith('deposit_net_')) {
        await ctx.answerCbQuery();
        const networkId = data.replace('deposit_net_', '');
        try {
          const netResult = await query(
            'SELECT id, network_name, network_display, min_deposit_amount FROM deposit_networks WHERE id = $1',
            [networkId]
          );
          if (netResult.rows.length === 0) {
            await ctx.reply(t(lang, 'error'));
            return;
          }
          const network = netResult.rows[0];
          const networkLabel = network.network_display || network.network_name;

          // Look up existing deposit address, or auto-generate one if missing
          const addrResult = await query(
            'SELECT address FROM user_deposit_addresses WHERE user_id = $1 AND network_id = $2 LIMIT 1',
            [user.id, network.id]
          );

          let address = addrResult.rows[0]?.address || '';
          if (!address) {
            try {
              address = await generateUserDepositAddress(user.id, network.id);
            } catch (genErr) {
              console.error(`[bot ${botId}] Failed to generate deposit address for user ${user.id} on network ${network.id} (${networkLabel}):`, genErr);
            }
          }
          const minDeposit = network.min_deposit_amount
            ? `\n💡 Min: <b>${parseFloat(String(network.min_deposit_amount)).toFixed(2)} USDT</b>`
            : '';

          try { await ctx.deleteMessage(); } catch {}
          if (!address) {
            await ctx.replyWithHTML(
              `📥 <b>${t(lang, 'deposit_address')}</b>\n\n` +
              `🌐 ${networkLabel}${minDeposit}\n\n` +
              `⏳ ${t(lang, 'deposit_address_hint')}`,
              Markup.inlineKeyboard([
                [Markup.button.callback('« ' + t(lang, 'btn_deposit'), 'wallet_deposit')],
                [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
              ])
            );
          } else {
            await ctx.replyWithHTML(
              `📥 <b>${t(lang, 'deposit_address')}</b>\n\n` +
              `🌐 ${networkLabel}${minDeposit}\n\n` +
              `<code>${address}</code>`,
              Markup.inlineKeyboard([
                [Markup.button.callback(t(lang, 'copy_address'), 'copy_noop')],
                [Markup.button.callback('« ' + t(lang, 'btn_deposit'), 'wallet_deposit')],
                [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
              ])
            );
          }
        } catch (err) {
          console.error('deposit_net_ error:', err);
          await ctx.reply(t(lang, 'error'));
        }
        return;
      }

      // ── Withdraw: show network list ─────────────────────────────────────────
      if (data === 'wallet_withdraw') {
        await ctx.answerCbQuery();
        const balance = (await getUnifiedBalance(user.telegram_id)).toFixed(2);

        let networkButtons: any[] = [];
        try {
          const networksResult = await query(
            'SELECT id, network_name, network_display FROM deposit_networks WHERE is_active = true ORDER BY sort_order, network_name'
          );
          if (networksResult.rows.length > 0) {
            networkButtons = networksResult.rows.map((n: any) =>
              [Markup.button.callback(n.network_display || n.network_name, `withdraw_net_${n.id}`)]
            );
          }
        } catch {}

        if (networkButtons.length === 0) {
          networkButtons = [
            [Markup.button.callback('TRC20 (USDT)', 'withdraw_net_TRC')],
            [Markup.button.callback('BSC (BEP20)', 'withdraw_net_BSC')],
            [Markup.button.callback('ETH (ERC20)', 'withdraw_net_ETH')],
          ];
        }

        networkButtons.push([Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')]);
        try { await ctx.deleteMessage(); } catch {}
        await ctx.replyWithHTML(
          `📤 <b>${t(lang, 'btn_withdraw')}</b>\n\n` +
          `💰 ${t(lang, 'wallet_balance')}: <b>${balance} USDT</b>\n\n` +
          `${t(lang, 'withdraw_select_network')}:`,
          Markup.inlineKeyboard(networkButtons)
        );
        return;
      }

      // ── Withdraw: network selected → prompt for address ─────────────────────
      if (data.startsWith('withdraw_net_')) {
        await ctx.answerCbQuery();
        const networkId = data.replace('withdraw_net_', '');
        let networkName = networkId.toUpperCase();
        try {
          const netResult = await query(
            'SELECT id, network_name, network_display FROM deposit_networks WHERE id = $1',
            [networkId]
          );
          if (netResult.rows.length > 0) {
            networkName = netResult.rows[0].network_display || netResult.rows[0].network_name;
          }
        } catch {}

        setUserState(user.id, {
          step: 'withdraw_enter_address',
          data: { networkId, networkName },
        });
        try { await ctx.deleteMessage(); } catch {}
        await ctx.reply(t(lang, 'withdraw_enter_address'));
        return;
      }

      // ── Withdraw: show password prompt after user confirms details ──────────
      if (data === 'withdraw_confirm') {
        await ctx.answerCbQuery();
        const state = getUserState(user.id);
        if (!state) { await ctx.reply(t(lang, 'error')); return; }

        let hasPassword = false;
        try {
          const pwRes = await query('SELECT withdraw_password FROM users WHERE id = $1', [user.id]);
          hasPassword = !!(pwRes.rows[0]?.withdraw_password);
        } catch {}

        const passwordStep = hasPassword ? 'withdraw_enter_password' : 'withdraw_set_password';
        setUserState(user.id, { step: passwordStep, data: { ...state.data, passwordInput: '' } });

        const promptText = hasPassword ? t(lang, 'withdraw_enter_password') : t(lang, 'withdraw_set_password');
        try { await ctx.deleteMessage(); } catch {}
        await ctx.replyWithHTML(`🔐 ${promptText}`, buildNumpad(lang, ''));
        return;
      }

      // ── Transfer: show ID input prompt ──────────────────────────────────────
      if (data === 'wallet_transfer') {
        await ctx.answerCbQuery();
        const balance = (await getUnifiedBalance(user.telegram_id)).toFixed(2);
        setUserState(user.id, { step: 'transfer_enter_id', data: {} });
        try { await ctx.deleteMessage(); } catch {}
        await ctx.replyWithHTML(
          `💸 <b>${t(lang, 'btn_transfer')}</b>\n\n` +
          `💰 ${t(lang, 'wallet_balance')}: <b>${balance} USDT</b>\n\n` +
          t(lang, 'transfer_enter_id'),
          Markup.inlineKeyboard([
            [Markup.button.callback(t(lang, 'btn_cancel'), 'wallet_back_to_wallet')],
          ])
        );
        return;
      }

      // ── Transfer: recipient confirmed → prompt for amount ───────────────────
      if (data === 'transfer_confirm_recipient') {
        await ctx.answerCbQuery();
        const state = getUserState(user.id);
        if (!state) { await ctx.reply(t(lang, 'error')); return; }
        setUserState(user.id, { step: 'transfer_enter_amount', data: state.data });
        try { await ctx.deleteMessage(); } catch {}
        await ctx.reply(t(lang, 'transfer_enter_amount'));
        return;
      }

      // ── Transfer: amount confirmed → show password prompt ───────────────────
      if (data === 'transfer_confirm') {
        await ctx.answerCbQuery();
        const state = getUserState(user.id);
        if (!state) { await ctx.reply(t(lang, 'error')); return; }

        let hasPassword = false;
        try {
          const pwRes = await query('SELECT withdraw_password FROM users WHERE id = $1', [user.id]);
          hasPassword = !!(pwRes.rows[0]?.withdraw_password);
        } catch {}

        const passwordStep = hasPassword ? 'transfer_enter_password' : 'transfer_set_password';
        setUserState(user.id, { step: passwordStep, data: { ...state.data, passwordInput: '' } });

        const promptText = hasPassword ? t(lang, 'withdraw_enter_password') : t(lang, 'withdraw_set_password');
        try { await ctx.deleteMessage(); } catch {}
        await ctx.replyWithHTML(`🔐 ${promptText}`, buildNumpad(lang, ''));
        return;
      }

      // ── Numpad: noop (display cell) ─────────────────────────────────────────
      if (data === 'numpad_noop') {
        await ctx.answerCbQuery();
        return;
      }

      // ── Numpad: digit input ─────────────────────────────────────────────────
      if (data.startsWith('numpad:')) {
        const digit = data.split(':')[1];
        const state = getUserState(user.id);
        const numpadSteps = ['withdraw_set_password', 'withdraw_enter_password', 'transfer_set_password', 'transfer_enter_password'];
        if (!state || !numpadSteps.includes(state.step)) {
          await ctx.answerCbQuery();
          return;
        }
        let current = state.data.passwordInput || '';
        if (current.length < 4) current += digit;
        setUserState(user.id, { ...state, data: { ...state.data, passwordInput: current } });
        await ctx.answerCbQuery();
        try {
          const promptKey = 'withdraw_enter_password'; // same key for both withdraw and transfer flows
          const promptText = (state.step === 'withdraw_set_password' || state.step === 'transfer_set_password')
            ? t(lang, 'withdraw_set_password')
            : t(lang, promptKey);
          await ctx.editMessageText(`🔐 ${promptText}`, {
            parse_mode: 'HTML',
            ...buildNumpad(lang, current),
          });
        } catch {}
        return;
      }

      // ── Numpad: delete ──────────────────────────────────────────────────────
      if (data === 'numpad_delete') {
        const state = getUserState(user.id);
        const numpadSteps = ['withdraw_set_password', 'withdraw_enter_password', 'transfer_set_password', 'transfer_enter_password'];
        if (!state || !numpadSteps.includes(state.step)) {
          await ctx.answerCbQuery();
          return;
        }
        let current = state.data.passwordInput || '';
        current = current.slice(0, -1);
        setUserState(user.id, { ...state, data: { ...state.data, passwordInput: current } });
        await ctx.answerCbQuery();
        try {
          const promptText = (state.step === 'withdraw_set_password' || state.step === 'transfer_set_password')
            ? t(lang, 'withdraw_set_password')
            : t(lang, 'withdraw_enter_password');
          await ctx.editMessageText(`🔐 ${promptText}`, {
            parse_mode: 'HTML',
            ...buildNumpad(lang, current),
          });
        } catch {}
        return;
      }

      // ── Numpad: confirm ─────────────────────────────────────────────────────
      if (data === 'numpad_confirm') {
        await ctx.answerCbQuery();
        const state = getUserState(user.id);
        const numpadSteps = ['withdraw_set_password', 'withdraw_enter_password', 'transfer_set_password', 'transfer_enter_password'];
        if (!state || !numpadSteps.includes(state.step)) return;

        const password = state.data.passwordInput || '';
        if (!/^\d{4}$/.test(password)) {
          await ctx.reply(t(lang, 'password_digits_only'));
          return;
        }

        if (state.step === 'withdraw_set_password' || state.step === 'transfer_set_password') {
          // Save new password
          try {
            const hashedPassword = await bcrypt.hash(password, 10);
            await query('UPDATE users SET withdraw_password = $1 WHERE id = $2', [hashedPassword, user.id]);
            try { await ctx.deleteMessage(); } catch {}
            await ctx.reply(t(lang, 'withdraw_password_set'));
          } catch (err) {
            console.error('Set password error:', err);
            clearUserState(user.id);
            await ctx.reply(t(lang, 'error'));
            return;
          }
        } else {
          // Verify existing password
          let valid = false;
          try {
            const pwRes = await query('SELECT withdraw_password FROM users WHERE id = $1', [user.id]);
            const storedHash = pwRes.rows[0]?.withdraw_password;
            if (storedHash) valid = await bcrypt.compare(password, storedHash);
          } catch {}

          if (!valid) {
            setUserState(user.id, { ...state, data: { ...state.data, passwordInput: '' } });
            try { await ctx.deleteMessage(); } catch {}
            await ctx.replyWithHTML(`❌ ${t(lang, 'password_incorrect')}`, buildNumpad(lang, ''));
            return;
          }
          try { await ctx.deleteMessage(); } catch {}
        }

        // Password OK — execute the operation
        const opData = state.data;
        clearUserState(user.id);
        if (state.step.startsWith('withdraw')) {
          await processWithdrawal(ctx, user, lang, opData);
        } else {
          await processTransfer(ctx, user, lang, opData);
        }
        return;
      }

      // ── Copy noop (address copy is client-side) ─────────────────────────────
      if (data === 'copy_noop') {
        await ctx.answerCbQuery(t(lang, 'copy_address'));
        return;
      }

      // ── Language selection button ───────────────────────────────────────────
      if (data === 'wallet_language') {
        await ctx.answerCbQuery();
        const langButtons = [
          [Markup.button.callback('🇨🇳 中文', 'lang_zh'), Markup.button.callback('🇺🇸 English', 'lang_en')],
          [Markup.button.callback('🇫🇷 Français', 'lang_fr'), Markup.button.callback('🇩🇪 Deutsch', 'lang_de')],
          [Markup.button.callback('🇪🇸 Español', 'lang_es'), Markup.button.callback('🇸🇦 العربية', 'lang_ar')],
          [Markup.button.callback('🇯🇵 日本語', 'lang_ja')],
          [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
        ];
        try { await ctx.deleteMessage(); } catch {}
        await ctx.replyWithHTML(
          `🌐 <b>${t(lang, 'language_title')}</b>`,
          Markup.inlineKeyboard(langButtons)
        );
        return;
      }

      // ── Support button ──────────────────────────────────────────────────────
      if (data === 'wallet_support') {
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch {}
        await ctx.replyWithHTML(
          `🎧 <b>${t(lang, 'help_title')}</b>\n\n${t(lang, 'help_description')}`,
          Markup.inlineKeyboard([
            [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
          ])
        );
        return;
      }

      // ── Back to wallet ──────────────────────────────────────────────────────
      if (data === 'wallet_back_to_wallet') {
        clearUserState(user.id);
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch {}
        await handleWallet(ctx, botId, user, lang);
        return;
      }

      // ── Back to start menu ──────────────────────────────────────────────────
      if (data === 'wallet_back') {
        clearUserState(user.id);
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch {}
        const settings = await getBotSettings(botId);
        const welcomeText = await buildWelcomeText(user, lang, settings);
        const webAppUrl = resolveWebAppUrl(settings);
        const keyboardRows: any[][] = [
          [Markup.button.text(t(lang, 'btn_my_wallet')), Markup.button.text(t(lang, 'btn_invite'))],
        ];
        if (webAppUrl) {
          keyboardRows.push([Markup.button.webApp(t(lang, 'btn_open_app'), webAppUrl)]);
        }
        await ctx.replyWithHTML(welcomeText, Markup.keyboard(keyboardRows).resize());
        return;
      }

      await ctx.answerCbQuery();
    } catch (error) {
      console.error(`[bot ${botId}] Callback query error:`, error);
      try { await ctx.answerCbQuery('An error occurred'); } catch {}
    }
  });

  bot.catch((err, ctx) => {
    console.error(`[bot ${botId}] Unhandled error:`, err);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet and invite handlers
// ─────────────────────────────────────────────────────────────────────────────

/** Build the unified wallet card text for a user */
async function buildWalletCardText(user: User, lang: string): Promise<string> {
  const displayId = await getPrimaryUniqueId(user.telegram_id) || user.unique_id || user.robot_user_id || 'N/A';

  // Fetch fresh data from DB
  const freshResult = await query(
    'SELECT balance, wallet_balance, nft_balance, red_packet_credits, account_status FROM users WHERE id = $1',
    [user.id]
  );
  const fresh = freshResult.rows[0] || user;
  // wallet_balance is the operational balance used for transfers/withdrawals
  const balance = parseFloat(String(fresh.wallet_balance ?? fresh.balance ?? 0)).toFixed(2);
  const nftBalance = parseFloat(String(fresh.nft_balance ?? 0)).toFixed(2);
  const redPacketBalance = parseFloat(String(fresh.red_packet_credits ?? 0)).toFixed(2);
  const accountStatusKey = (fresh.account_status || user.account_status) === 'active' ? 'account_active' : 'account_pending';

  // Fetch wallet_tip_message from system settings
  let tipMessage = '';
  try {
    const tipResult = await query(
      `SELECT value FROM system_settings WHERE key = 'wallet_tip_message' LIMIT 1`
    );
    tipMessage = tipResult.rows[0]?.value || '';
    if (typeof tipMessage === 'string') tipMessage = tipMessage.replace(/^"|"$/g, '');
  } catch {/* non-critical */}

  let text =
    `💼 <b>${t(lang, 'wallet_title')}</b>\n\n` +
    `🆔 ID: <code>${displayId}</code>\n` +
    `💰 ${t(lang, 'wallet_balance')}: <b>${balance} USDT</b>\n` +
    `💎 NFT: <b>${nftBalance} USDT</b>\n` +
    `🧧 ${t(lang, 'account_red_packet_credits')}: <b>${redPacketBalance}</b>\n` +
    `📊 ${t(lang, 'account_account_status')}: ${t(lang, accountStatusKey)}\n`;

  if (tipMessage) {
    text += `\n💡 ${tipMessage}`;
  }

  return text;
}

async function handleWallet(ctx: Context, botId: string, user: User, lang: string) {
  try {
    const settings = await getBotSettings(botId);
    const walletText = await buildWalletCardText(user, lang);

    const supportButton = settings.support_telegram
      ? [Markup.button.url(t(lang, 'btn_support'), `https://t.me/${settings.support_telegram}`)]
      : [Markup.button.callback(t(lang, 'btn_support'), 'wallet_support')];

    await ctx.replyWithHTML(
      walletText,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(t(lang, 'btn_deposit'), 'wallet_deposit'),
          Markup.button.callback(t(lang, 'btn_withdraw'), 'wallet_withdraw'),
        ],
        [Markup.button.callback(t(lang, 'btn_transfer'), 'wallet_transfer')],
        supportButton,
        [Markup.button.callback(t(lang, 'btn_language'), 'wallet_language')],
        [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back')],
      ])
    );
  } catch (error) {
    console.error(`[handleWallet bot=${botId}] Error building wallet card:`, error);
    try { await ctx.reply(t(lang, 'error')); } catch (replyErr) {
      console.error(`[handleWallet bot=${botId}] Failed to send error reply:`, replyErr);
    }
  }
}

async function handleInvite(ctx: Context, botId: string, user: User, lang: string) {
  const settings = await getBotSettings(botId);

  // Get bot username: prefer bot_settings, then bots table, then env
  let botUsername = settings.bot_username || process.env.BOT_USERNAME;
  if (!botUsername) {
    try {
      const botResult = await query('SELECT username FROM bots WHERE id = $1', [botId]);
      botUsername = botResult.rows[0]?.username;
    } catch {}
  }
  botUsername = botUsername || 'your_bot';

  let displayId: string | undefined;
  try {
    const primaryId = await getPrimaryUniqueId(user.telegram_id);
    displayId = primaryId || undefined;
  } catch (err) {
    console.error(`[bot ${botId}] getPrimaryUniqueId error:`, err);
  }
  displayId = displayId || user.unique_id || user.robot_user_id || user.invite_code;

  if (!displayId) {
    await ctx.reply(t(lang, 'error'));
    return;
  }

  const inviteLink = `https://t.me/${botUsername}?start=REF_${displayId}`;
  const shareText = `${t(lang, 'invite_title')}\n\n${t(lang, 'invite_description')}\n\n${inviteLink}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

  await ctx.replyWithHTML(
    `${t(lang, 'invite_title')}\n\n🔗 ${t(lang, 'invite_link')}: <code>${inviteLink}</code>`,
    Markup.inlineKeyboard([
      [Markup.button.url(t(lang, 'btn_share'), shareUrl)],
    ])
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BotManager class
// ─────────────────────────────────────────────────────────────────────────────

class BotManager {
  private bots = new Map<string, BotInstance>();

  async loadAllBots(): Promise<void> {
    try {
      let result;
      try {
        result = await query(
          'SELECT id, token, default_language FROM bots WHERE is_active = true'
        );
      } catch {
        result = await query(
          'SELECT id, token FROM bots WHERE is_active = true'
        );
      }

      for (const row of result.rows) {
        await this.addBot(row.id, row.token, row.default_language || 'en');
      }

      console.log(`✓ BotManager: loaded ${this.bots.size} active bot(s)`);
    } catch (error) {
      console.error('BotManager loadAllBots error:', error);
    }
  }

  async registerWebhooksIfNeeded(): Promise<void> {
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      console.log('BotManager: BACKEND_URL not set, skipping auto webhook registration');
      return;
    }

    let registered = 0;
    for (const [botId, instance] of this.bots) {
      try {
        const result = await query(
          'SELECT webhook_url, token FROM bots WHERE id = $1',
          [botId]
        );
        if (result.rows.length === 0) continue;

        const { webhook_url, token } = result.rows[0];
        if (webhook_url) continue;

        const webhookUrl = `${backendUrl}/webhook/${botId}`;
        const response = await axios.post(
          `https://api.telegram.org/bot${token}/setWebhook`,
          { url: webhookUrl, allowed_updates: ['message', 'callback_query', 'chat_member'] }
        );

        if (response.data?.ok) {
          await query('UPDATE bots SET webhook_url = $1 WHERE id = $2', [webhookUrl, botId]);
          console.log(`BotManager: auto-registered webhook for bot ${botId} → ${webhookUrl}`);
          registered++;
        } else {
          console.warn(`BotManager: failed to register webhook for bot ${botId}:`, response.data);
        }
      } catch (err: any) {
        const detail = err.response
          ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`
          : err.message;
        console.error(`BotManager: error registering webhook for bot ${botId}:`, detail);
      }
    }

    if (registered > 0) {
      console.log(`✓ BotManager: auto-registered webhooks for ${registered} bot(s)`);
    } else {
      console.log('BotManager: all bots already have webhooks configured');
    }
  }

  async addBot(botId: string, token?: string, defaultLanguage?: string): Promise<void> {
    if (this.bots.has(botId)) return;

    try {
      let resolvedToken = token;
      let resolvedLang = defaultLanguage || 'en';

      if (!resolvedToken) {
        const result = await query(
          'SELECT token, default_language FROM bots WHERE id = $1 AND is_active = true',
          [botId]
        );
        if (result.rows.length === 0) {
          console.warn(`BotManager: bot ${botId} not found or not active`);
          return;
        }
        resolvedToken = result.rows[0].token;
        resolvedLang = result.rows[0].default_language || 'en';
      }

      const telegraf = new Telegraf(resolvedToken as string);
      setupBotHandlers(telegraf, botId, resolvedLang);

      this.bots.set(botId, {
        botId,
        token: resolvedToken as string,
        defaultLanguage: resolvedLang,
        telegraf,
      });

      console.log(`BotManager: added bot ${botId}`);

      // Auto-register webhook if BACKEND_URL is set
      const backendUrl = process.env.BACKEND_URL;
      if (backendUrl) {
        try {
          const webhookResult = await query(
            'SELECT webhook_url FROM bots WHERE id = $1',
            [botId]
          );
          const existingWebhook = webhookResult.rows[0]?.webhook_url;
          if (!existingWebhook || existingWebhook.trim() === '') {
            const webhookTarget = `${backendUrl}/webhook/${botId}`;
            const telegramRes = await axios.post(
              `https://api.telegram.org/bot${resolvedToken}/setWebhook`,
              { url: webhookTarget }
            );
            if (telegramRes.data?.ok) {
              await query('UPDATE bots SET webhook_url = $1 WHERE id = $2', [webhookTarget, botId]);
              console.log(`BotManager: auto-registered webhook for bot ${botId}: ${webhookTarget}`);
            }
          }
        } catch (webhookError) {
          console.error(`BotManager: failed to auto-register webhook for bot ${botId}:`, webhookError);
        }
      }
    } catch (error) {
      console.error(`BotManager: failed to add bot ${botId}:`, error);
    }
  }

  async removeBot(botId: string): Promise<void> {
    const instance = this.bots.get(botId);
    if (!instance) return;
    try { instance.telegraf.stop(); } catch {}
    this.bots.delete(botId);
    console.log(`BotManager: removed bot ${botId}`);
  }

  async handleUpdate(botId: string, update: any): Promise<void> {
    let instance = this.bots.get(botId);

    if (!instance) {
      console.log(`[BotManager] handleUpdate: bot ${botId} not in memory, loading on demand...`);
      await this.addBot(botId);
      instance = this.bots.get(botId);
    }

    if (!instance) {
      console.error(`[BotManager] handleUpdate: bot ${botId} could not be loaded`);
      throw new Error(`Bot ${botId} not found or not active`);
    }

    try {
      await instance.telegraf.handleUpdate(update);
    } catch (err: any) {
      console.error(`[BotManager] handleUpdate error for bot ${botId}:`, err?.message || err);
      throw err;
    }
  }

  getDefaultLanguage(botId: string): string {
    return this.bots.get(botId)?.defaultLanguage || 'en';
  }

  getBotCount(): number {
    return this.bots.size;
  }
}

export const botManager = new BotManager();
