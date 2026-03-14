import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db';
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

  // ── 1. Look up by telegram_id only (single account per user) ──────────
  const existing = await query(
    `SELECT * FROM users WHERE telegram_id = $1`,
    [tgUser.id]
  );

  if (existing.rows.length > 0) {
    // Update profile fields and last_active_at
    const updated = await query(
      `UPDATE users 
       SET username = $1, first_name = $2, last_name = $3, last_active_at = NOW()
       WHERE id = $4 RETURNING *`,
      [tgUser.username || null, tgUser.first_name || null, tgUser.last_name || null, existing.rows[0].id]
    );
    const user = updated.rows[0];

    // Record bot membership (upsert)
    await query(
      `INSERT INTO user_bot_memberships (user_id, bot_id, last_active_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, bot_id) DO UPDATE SET last_active_at = NOW()`,
      [user.id, botId]
    ).catch((err: any) => { console.warn(`[bot ${botId}] Failed to upsert membership:`, err?.message); });

    // Backfill unique_id if missing
    if (!user.unique_id) {
      try {
        const newUniqueId = await generateUserUniqueId();
        await query('UPDATE users SET unique_id = $1 WHERE id = $2 AND unique_id IS NULL', [newUniqueId, user.id]);
        const refreshed = await query('SELECT unique_id FROM users WHERE id = $1', [user.id]);
        user.unique_id = refreshed.rows[0]?.unique_id ?? null;
      } catch (err: any) {
        console.warn(`[bot ${botId}] Failed to backfill unique_id:`, err?.message);
      }
    }
    return user;
  }

  // ── 2. Brand new user ─────────────────────────────────────────────────
  // Resolve inviter
  let invitedBy = null;
  if (inviteCodeUsed) {
    const inviterResult = await query(
      'SELECT id FROM users WHERE unique_id = $1 OR invite_code = $1 LIMIT 1',
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

  // Generate unique_id
  let newUniqueId: string;
  try {
    newUniqueId = await generateUserUniqueId();
  } catch {
    newUniqueId = `U${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }

  // Insert single record — no bot_id dependency for identity
  const createResult = await query(
    `INSERT INTO users 
       (bot_id, telegram_id, username, first_name, last_name, language_code,
        invited_by, red_packet_credits, wallet_balance, reward_balance, frozen_balance, unique_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 0, $9)
     ON CONFLICT (telegram_id) DO UPDATE SET last_active_at = NOW()
     RETURNING *`,
    [
      botId, // records first-touch bot
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

  const newUser = createResult.rows[0];

  // Record bot membership
  await query(
    `INSERT INTO user_bot_memberships (user_id, bot_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, bot_id) DO NOTHING`,
    [newUser.id, botId]
  ).catch((err: any) => { console.warn(`[bot ${botId}] Failed to insert membership:`, err?.message); });

  return newUser;
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

/**
 * Return the UUID of the canonical (earliest-created) user record for a given
 * Telegram ID.  All balance reads/writes must go through this record so that a
 * user's balance is consistent regardless of which bot they interact with.
 */
async function getCanonicalUserId(telegramId: number): Promise<string | null> {
  const result = await query(
    'SELECT id FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1',
    [telegramId]
  );
  return result.rows[0]?.id || null;
}

/**
 * Resolve a network identifier (either a numeric string or a chain/network
 * name such as "TRC" / "TRON") to the integer primary key in deposit_networks.
 * Returns null if no matching network is found.
 */
async function resolveNetworkId(networkId: string): Promise<number | null> {
  // Fast path: already an integer string
  const asInt = parseInt(networkId, 10);
  if (!isNaN(asInt) && String(asInt) === networkId.trim()) return asInt;
  // Slow path: look up by network_name or chain_name (case-insensitive)
  try {
    const result = await query(
      `SELECT id FROM deposit_networks
       WHERE UPPER(network_name) = UPPER($1) OR UPPER(chain_name) = UPPER($1)
       LIMIT 1`,
      [networkId]
    );
    if (result.rows.length > 0) return result.rows[0].id;
  } catch (err: any) {
    console.warn('[resolveNetworkId] DB lookup failed for networkId:', networkId, err?.message);
  }
  return null;
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

/** Submit a withdrawal record to the database and atomically freeze the balance */
async function processWithdrawal(ctx: Context, user: User, lang: string, data: any): Promise<void> {
  try {
    await ctx.reply(t(lang, 'withdraw_processing'));

    // Resolve numeric network_id (supports both integer strings and names like "TRC")
    const networkIdInt = await resolveNetworkId(String(data.networkId || ''));
    if (!networkIdInt) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    // Use the canonical user record so that balance is consistent across bots
    const canonicalId = await getCanonicalUserId(user.telegram_id);
    if (!canonicalId) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    // Read withdrawal fee rate from platform config (default 2%)
    let feeRate = 0.02;
    try {
      const cfgRow = await query(`SELECT value FROM platform_config WHERE key = 'withdraw_fee_rate'`);
      if (cfgRow.rows.length > 0) {
        const parsed = parseFloat(cfgRow.rows[0].value);
        if (!isNaN(parsed)) feeRate = parsed;
      }
    } catch {}

    const fee = data.amount * feeRate;
    const actualAmount = data.amount - fee;

    const orderId = generateOrderId();

    // Atomically verify balance, freeze it, and create the withdrawal record
    await transaction(async (client) => {
      const balCheck = await client.query(
        'SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE',
        [canonicalId]
      );
      if (balCheck.rows.length === 0) {
        console.error(`[processWithdrawal] Canonical user not found for id=${canonicalId} (telegram_id=${user.telegram_id})`);
        throw new Error('USER_NOT_FOUND');
      }

      const balance = parseFloat(String(balCheck.rows[0].wallet_balance ?? 0));
      if (balance < data.amount) {
        throw new Error('INSUFFICIENT_BALANCE:' + balance.toFixed(2));
      }

      // Freeze balance: deduct from wallet_balance and add to frozen_balance
      await client.query(
        `UPDATE users
         SET wallet_balance = wallet_balance - $1,
             frozen_balance = COALESCE(frozen_balance, 0) + $1
         WHERE id = $2`,
        [data.amount, canonicalId]
      );

      await client.query(
        `INSERT INTO withdrawal_records
          (user_id, network_id, amount, fee, actual_amount, to_address, status, order_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
        [canonicalId, networkIdInt, data.amount, fee, actualAmount, data.address, orderId]
      );
    });

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

    const submitTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    await ctx.replyWithHTML(
      `⏳ <b>${t(lang, 'withdraw_submitted')}</b>\n\n` +
      `┌─────────────────────────\n` +
      `│ 📋 ${t(lang, 'withdraw_success_order')}: <code>${orderId}</code>\n` +
      `│ 💰 ${t(lang, 'withdraw_success_amount')}: <b>${Number(data.amount).toFixed(2)} USDT</b>\n` +
      `│ 🌐 ${t(lang, 'withdraw_success_network')}: <b>${networkName}</b>\n` +
      `│ 📤 ${t(lang, 'withdraw_success_address')}: <code>${data.address}</code>\n` +
      `│ 🕐 ${t(lang, 'withdraw_submitted_time')}: ${submitTime}\n` +
      `└─────────────────────────\n\n` +
      `ℹ️ ${t(lang, 'withdraw_pending_info')}`
    );
  } catch (err: any) {
    console.error('processWithdrawal error:', err);
    if (err.message?.startsWith('INSUFFICIENT_BALANCE:')) {
      const bal = err.message.replace('INSUFFICIENT_BALANCE:', '');
      await ctx.reply(
        t(lang, 'insufficient_balance').replace('{balance}', bal)
      );
    } else {
      await ctx.reply(t(lang, 'error'));
    }
  }
}

/** Execute a transfer between two users */
async function processTransfer(ctx: Context, user: User, lang: string, data: any): Promise<void> {
  try {
    await ctx.reply(t(lang, 'transfer_processing'));

    // Use the canonical user record so that balance is consistent across bots
    const canonicalSenderId = await getCanonicalUserId(user.telegram_id);
    if (!canonicalSenderId) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    // Resolve canonical receiver id (data.recipientId from unique_id lookup is
    // already canonical; use data.recipientTelegramId as a secondary source)
    let canonicalRecipientId: string | null = data.recipientId || null;
    if (data.recipientTelegramId) {
      const resolved = await getCanonicalUserId(Number(data.recipientTelegramId));
      if (resolved) canonicalRecipientId = resolved;
    }
    if (!canonicalRecipientId) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    const orderId = generateOrderId();

    // Execute in a transaction (uses a dedicated client to ensure atomicity)
    await transaction(async (client) => {
      // Lock the sender row and verify balance
      const balCheck = await client.query(
        'SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE',
        [canonicalSenderId]
      );
      if (balCheck.rows.length === 0) {
        throw new Error('USER_NOT_FOUND');
      }
      const currentBalance = parseFloat(String(balCheck.rows[0].wallet_balance ?? 0));
      if (currentBalance < data.amount) {
        throw new Error('INSUFFICIENT_BALANCE:' + currentBalance.toFixed(2));
      }

      await client.query(
        `UPDATE users
         SET wallet_balance = wallet_balance - $1,
             total_transferred_out = COALESCE(total_transferred_out, 0) + $1
         WHERE id = $2`,
        [data.amount, canonicalSenderId]
      );
      await client.query(
        `UPDATE users
         SET wallet_balance = COALESCE(wallet_balance, 0) + $1,
             total_transferred_in = COALESCE(total_transferred_in, 0) + $1
         WHERE id = $2`,
        [data.amount, canonicalRecipientId]
      );
      await client.query(
        `INSERT INTO transfer_records
          (from_user_id, to_user_id, amount, fee, actual_received, status, order_id)
         VALUES ($1, $2, $3, 0, $3, 'completed', $4)`,
        [canonicalSenderId, canonicalRecipientId, data.amount, orderId]
      );
    });

    const transferTime = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

    await ctx.replyWithHTML(
      `✅ <b>${t(lang, 'transfer_success')}</b>\n\n` +
      `📋 ${t(lang, 'transfer_order_id')}: <code>${orderId}</code>\n` +
      `👤 ${t(lang, 'transfer_to')}: <b>${data.recipientName || data.recipientUniqueId || '-'}</b>\n` +
      `💵 ${t(lang, 'transfer_amount')}: <b>${Number(data.amount).toFixed(2)} USDT</b>\n` +
      `🕐 ${t(lang, 'transfer_time')}: ${transferTime}`
    );

    // Notify recipient
    if (data.recipientTelegramId) {
      try {
        const rLang = data.recipientLanguage || 'en';
        const notifyMsg =
          `💰 <b>${t(rLang, 'transfer_received')}</b>\n\n` +
          `📋 ${t(rLang, 'transfer_order_id')}: <code>${orderId}</code>\n` +
          `👤 ${t(rLang, 'transfer_from')}: <b>${user.first_name || user.username || '-'}</b>\n` +
          `✅ ${t(rLang, 'transfer_delivered')}: <b>${Number(data.amount).toFixed(2)} USDT</b>\n` +
          `🕐 ${t(rLang, 'transfer_time')}: ${transferTime}`;
        await ctx.telegram.sendMessage(data.recipientTelegramId, notifyMsg, { parse_mode: 'HTML' });
      } catch {}
    }
  } catch (err: any) {
    console.error('processTransfer error:', err);
    if (err.message?.startsWith('INSUFFICIENT_BALANCE:')) {
      const bal = err.message.replace('INSUFFICIENT_BALANCE:', '');
      await ctx.reply(
        t(lang, 'transfer_insufficient_balance').replace('{balance}', bal)
      );
    } else {
      await ctx.reply(t(lang, 'error'));
    }
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
            // Validate address format based on chain_name stored in state
            const chainName: string = state.data?.chainName || state.data?.networkId || '';
            const chain = chainName.toUpperCase();
            let addressValid = true;
            if (chain === 'TRON' || chain.includes('TRC')) {
              addressValid = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
            } else if (chain === 'ETH' || chain === 'ETHEREUM' || chain === 'BSC' || chain === 'BNB' || chain.includes('ERC') || chain.includes('BEP')) {
              addressValid = /^0x[0-9a-fA-F]{40}$/.test(address);
            }
            if (!addressValid) {
              const networkName: string = state.data?.networkName || state.data?.networkId || '';
              await ctx.reply(
                t(lang, 'invalid_address').replace('{network}', networkName),
                Markup.inlineKeyboard([
                  [Markup.button.callback(t(lang, 'btn_cancel'), 'wallet_back_to_wallet')],
                ])
              );
              return;
            }
            setUserState(userId, { step: 'withdraw_enter_amount', data: { ...state.data, address } });
            await ctx.reply(t(lang, 'withdraw_enter_amount'), Markup.inlineKeyboard([
              [Markup.button.callback(t(lang, 'btn_cancel'), 'wallet_back_to_wallet')],
            ]));
            return;
          }

          // ── Withdraw: amount input ──
          case 'withdraw_enter_amount': {
            const amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0) {
              await ctx.reply(t(lang, 'error'));
              return;
            }

            // Check balance before showing confirmation
            let availableBalance = 0;
            try {
              const balRow = await query('SELECT wallet_balance FROM users WHERE id = $1', [user.id]);
              availableBalance = parseFloat(String(balRow.rows[0]?.wallet_balance ?? 0));
            } catch {}

            if (amount > availableBalance) {
              await ctx.reply(
                t(lang, 'insufficient_balance').replace('{balance}', availableBalance.toFixed(2)),
                Markup.inlineKeyboard([
                  [Markup.button.callback(t(lang, 'btn_cancel'), 'wallet_back_to_wallet')],
                ])
              );
              return;
            }

            // Read fee rate from platform config (default 2%)
            let feeRate = 0.02;
            try {
              const cfgRow = await query(`SELECT value FROM platform_config WHERE key = 'withdraw_fee_rate'`);
              if (cfgRow.rows.length > 0) {
                const parsed = parseFloat(cfgRow.rows[0].value);
                if (!isNaN(parsed)) feeRate = parsed;
              }
            } catch {}
            const fee = amount * feeRate;
            const actualAmount = amount - fee;

            const d: Record<string, any> = { ...state.data, amount };
            setUserState(userId, { step: 'withdraw_need_password', data: d });

            const confirmMsg =
              `📤 <b>${t(lang, 'withdraw_confirm_info')}</b>\n\n` +
              `🌐 ${t(lang, 'withdraw_success_network')}: <b>${d.networkName || d.networkId}</b>\n` +
              `📍 ${t(lang, 'withdraw_success_address')}: <code>${d.address}</code>\n` +
              `💵 ${t(lang, 'withdraw_success_amount')}: <b>${amount.toFixed(2)} USDT</b>\n` +
              `💸 ${t(lang, 'withdraw_fee_hint').replace('{fee}', fee.toFixed(2)).replace('{fee_rate}', (feeRate * 100).toFixed(0)).replace('{actual}', actualAmount.toFixed(2))}`;

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
            if (recipient.telegram_id === user.telegram_id) {
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
        await ctx.answerCbQuery().catch(() => {});

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
          try { await ctx.deleteMessage(); } catch {}
          await ctx.replyWithHTML(
            `📥 <b>${t(lang, 'btn_deposit')}</b>\n\n⚠️ ${t(lang, 'no_networks_configured')}`,
            Markup.inlineKeyboard([
              [Markup.button.callback(t(lang, 'deposit_back_to_wallet'), 'wallet_back_to_wallet')],
            ])
          );
          return;
        }

        networkButtons.push([Markup.button.callback(t(lang, 'deposit_back_to_wallet'), 'wallet_back_to_wallet')]);
        try { await ctx.deleteMessage(); } catch {}
        await ctx.replyWithHTML(
          `📥 <b>${t(lang, 'btn_deposit')}</b>\n\n${t(lang, 'deposit_select_network_title')}`,
          Markup.inlineKeyboard(networkButtons)
        );
        return;
      }

      // ── Deposit: show address for selected network ──────────────────────────
      if (data.startsWith('deposit_net_')) {
        await ctx.answerCbQuery().catch(() => {});
        const rawNetworkId = data.replace('deposit_net_', '');

        // Show loading state immediately
        const loadingText =
          `📥 <b>${t(lang, 'deposit_address')}</b>\n\n` +
          `⏳ ${t(lang, 'deposit_generating_address')}`;
        try { await ctx.deleteMessage(); } catch {}
        const loadingMsg = await ctx.replyWithHTML(loadingText).catch(() => null);

        const editOrReply = async (html: string, keyboard: any) => {
          if (loadingMsg) {
            try {
              await ctx.telegram.editMessageText(
                loadingMsg.chat.id, loadingMsg.message_id, undefined, html,
                { parse_mode: 'HTML', ...keyboard }
              );
              return;
            } catch {}
          }
          await ctx.replyWithHTML(html, keyboard);
        };

        try {
          // resolveNetworkId supports both integer ids and name-based ids (e.g. "TRC")
          const numericId = await resolveNetworkId(rawNetworkId);
          if (!numericId) {
            await editOrReply(
              `📥 <b>${t(lang, 'deposit_address')}</b>\n\n⚠️ ${t(lang, 'deposit_address_not_available')}`,
              Markup.inlineKeyboard([
                [
                  Markup.button.callback(t(lang, 'deposit_retry'), data),
                  Markup.button.callback(t(lang, 'deposit_change_network'), 'wallet_deposit'),
                ],
                [Markup.button.callback(t(lang, 'deposit_back_to_wallet'), 'wallet_back_to_wallet')],
              ])
            );
            return;
          }
          const netResult = await query(
            'SELECT id, network_name, network_display, min_deposit_amount FROM deposit_networks WHERE id = $1',
            [numericId]
          );
          if (netResult.rows.length === 0) {
            await editOrReply(
              `📥 <b>${t(lang, 'deposit_address')}</b>\n\n⚠️ ${t(lang, 'deposit_address_not_available')}`,
              Markup.inlineKeyboard([
                [
                  Markup.button.callback(t(lang, 'deposit_retry'), data),
                  Markup.button.callback(t(lang, 'deposit_change_network'), 'wallet_deposit'),
                ],
                [Markup.button.callback(t(lang, 'deposit_back_to_wallet'), 'wallet_back_to_wallet')],
              ])
            );
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

          if (!address) {
            await editOrReply(
              `📥 <b>${t(lang, 'deposit_address')}</b>\n\n` +
              `🌐 ${networkLabel}${minDeposit}\n\n` +
              `⚠️ ${t(lang, 'deposit_address_not_available')}`,
              Markup.inlineKeyboard([
                [
                  Markup.button.callback(t(lang, 'deposit_retry'), data),
                  Markup.button.callback(t(lang, 'deposit_change_network'), 'wallet_deposit'),
                ],
                [Markup.button.callback(t(lang, 'deposit_back_to_wallet'), 'wallet_back_to_wallet')],
              ])
            );
          } else {
            await editOrReply(
              `📥 <b>${t(lang, 'deposit_address')}</b>\n\n` +
              `🌐 ${networkLabel}${minDeposit}\n\n` +
              `📋 ${t(lang, 'deposit_address_hint')}\n\n` +
              `<code>${address}</code>\n\n` +
              `${t(lang, 'deposit_copy_hint')}`,
              Markup.inlineKeyboard([
                [Markup.button.callback(t(lang, 'deposit_change_network'), 'wallet_deposit')],
                [Markup.button.callback(t(lang, 'deposit_back_to_wallet'), 'wallet_back_to_wallet')],
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
          try { await ctx.deleteMessage(); } catch {}
          await ctx.replyWithHTML(
            `📤 <b>${t(lang, 'btn_withdraw')}</b>\n\n⚠️ ${t(lang, 'no_networks_configured')}`,
            Markup.inlineKeyboard([
              [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
            ])
          );
          return;
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
        const rawNetworkId = data.replace('withdraw_net_', '');
        let networkName = rawNetworkId.toUpperCase();
        let resolvedNetworkId: string | number = rawNetworkId;
        let chainName = rawNetworkId.toUpperCase();
        try {
          const numericId = await resolveNetworkId(rawNetworkId);
          if (numericId) {
            resolvedNetworkId = numericId;
            const netResult = await query(
              'SELECT id, network_name, network_display, chain_name FROM deposit_networks WHERE id = $1',
              [numericId]
            );
            if (netResult.rows.length > 0) {
              networkName = netResult.rows[0].network_display || netResult.rows[0].network_name;
              chainName = netResult.rows[0].chain_name || networkName;
            }
          }
        } catch {}

        setUserState(user.id, {
          step: 'withdraw_enter_address',
          data: { networkId: resolvedNetworkId, networkName, chainName },
        });
        try { await ctx.deleteMessage(); } catch {}
        await ctx.reply(t(lang, 'withdraw_enter_address'), Markup.inlineKeyboard([
          [Markup.button.callback(t(lang, 'btn_cancel'), 'wallet_back_to_wallet')],
        ]));
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

      // ── Withdraw: cancel → clear state and return to wallet ────────────────
      if (data === 'withdraw_cancel') {
        clearUserState(user.id);
        await ctx.answerCbQuery();
        try { await ctx.deleteMessage(); } catch {}
        await handleWallet(ctx, botId, user, lang);
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

  // Always read balance from the canonical user record so it stays consistent
  // regardless of which bot the user is currently interacting with.
  const canonicalId = await getCanonicalUserId(user.telegram_id) || user.id;
  const freshResult = await query(
    'SELECT balance, wallet_balance, nft_balance, red_packet_credits, account_status FROM users WHERE id = $1',
    [canonicalId]
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
    `🧧 ${t(lang, 'redpacket_balance')}: <b>${redPacketBalance} USDT</b>\n` +
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
        [Markup.button.callback('🌐 Language', 'wallet_language')],
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
