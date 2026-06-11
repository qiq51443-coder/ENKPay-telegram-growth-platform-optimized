import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { setUserState, clearUserState, getUserState } from '../utils/state';
import { getWithdrawPassword, setWithdrawPassword, submitWithdraw, verifyWithdrawPassword, getWalletNetworks, getUserBalance, getSettings } from '../services/api';
import { t } from '../i18n';
import { handleWallet } from './wallet';
import { getBotMessageEmojiConfig, getEmoji, renderHeaderTitle } from '../utils/emoji-config';
import { animateEmojis } from '../utils/animate-emojis';

interface NetworkInfo {
  id: number;
  network_name: string;
  network_display: string;
  chain_name: string;
}

// Cache of active networks: refreshed every 5 minutes
let networksCache: NetworkInfo[] | null = null;
let networksCacheExpiry = 0;

async function getActiveNetworks(botId: string): Promise<NetworkInfo[]> {
  const now = Date.now();
  if (networksCache && now < networksCacheExpiry) {
    return networksCache;
  }
  try {
    const networks = await getWalletNetworks(botId);
    if (networks && networks.length > 0) {
      networksCache = networks;
      networksCacheExpiry = now + 5 * 60 * 1000;
    }
    return networksCache || [];
  } catch {
    return networksCache || [];
  }
}

function getNetworkLabel(network: NetworkInfo): string {
  return network.network_display || network.network_name;
}

/** Validate withdrawal address format based on chain name */
function validateAddress(address: string, chainName: string): boolean {
  const trimmed = address.trim();
  const chain = chainName.toUpperCase();
  if (chain === 'TRON') {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
  }
  if (chain === 'ETH' || chain === 'ETHEREUM' || chain === 'BSC' || chain === 'BNB' || chain === 'POLYGON' || chain === 'MATIC') {
    return /^0x[0-9a-fA-F]{40}$/.test(trimmed);
  }
  return true; // unknown network – allow and let backend validate
}

function buildNumpad(lang: string, currentInput: string) {
  return Markup.inlineKeyboard([
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
  ]);
}

export const handleWithdrawSelectNetwork = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    const emojiConfig = await getBotMessageEmojiConfig();

    const networks = await getActiveNetworks(botId);
    if (!networks || networks.length === 0) {
      const noNetworkText = await animateEmojis(`${renderHeaderTitle(emojiConfig, 'field_withdraw', t(lang, 'btn_withdraw'))}\n\n${t(lang, 'error')}`);
      await ctx.editMessageText(
        noNetworkText,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')]]) }
      );
      return;
    }

    const networkButtons = networks.map(n => Markup.button.callback(getNetworkLabel(n), `withdraw_network:${n.id}`));
    const rows: any[][] = [];
    for (let i = 0; i < networkButtons.length; i += 2) {
      rows.push(networkButtons.slice(i, i + 2));
    }
    rows.push([Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')]);

    const selectNetworkText = await animateEmojis(`${renderHeaderTitle(emojiConfig, 'field_withdraw', t(lang, 'btn_withdraw'))}\n\n${t(lang, 'withdraw_select_network')}`);
    await ctx.editMessageText(
      selectNetworkText,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(rows),
      }
    );
  } catch (error) {
    console.error('Withdraw select network error:', error);
  }
};

export const handleWithdrawSelectNetworkCallback = async (ctx: Context, networkId: string) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    // Look up network info for label and chain name
    const networks = await getActiveNetworks(botId);
    const network = networks.find(n => String(n.id) === String(networkId));
    const networkLabel = network ? getNetworkLabel(network) : networkId;
    const chainName = network?.chain_name || networkId;

    // Save network in state and prompt for address
    await setUserState(user.id.toString(), {
      step: 'withdraw_enter_address',
      data: { networkId, networkLabel, chainName },
    });

    await ctx.answerCbQuery();
    await ctx.reply(t(lang, 'withdraw_enter_address'), Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn_cancel'), 'withdraw_cancel')],
    ]));
  } catch (error) {
    console.error('Withdraw network callback error:', error);
  }
};

export const handleWithdrawEnterAddress = async (ctx: Context, user: any, address: string) => {
  try {
    const lang = getUserLanguage(user);
    const state = await getUserState(user.id.toString());
    const networkId: string = state?.data?.networkId || '';
    const chainName: string = state?.data?.chainName || networkId;
    const networkLabel: string = state?.data?.networkLabel || networkId;

    if (!validateAddress(address.trim(), chainName)) {
      await ctx.reply(
        t(lang, 'invalid_address').replace('{network}', networkLabel),
        Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'btn_cancel'), 'withdraw_cancel')]])
      );
      return;
    }

    await setUserState(user.id.toString(), {
      step: 'withdraw_enter_amount',
      data: { ...state?.data, address: address.trim() },
    });

    await ctx.reply(t(lang, 'withdraw_enter_amount'), Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn_cancel'), 'withdraw_cancel')],
    ]));
  } catch (error) {
    console.error('Withdraw enter address error:', error);
  }
};

export const handleWithdrawEnterAmount = async (ctx: Context, user: any, amount: string) => {
  try {
    const lang = getUserLanguage(user);
    const state = await getUserState(user.id.toString());
    const numAmount = parseFloat(amount);
    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';

    if (isNaN(numAmount) || numAmount <= 0) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    // Check minimum withdrawal amount from bot settings
    try {
      const settings = await getSettings(botId);
      const minAmount = parseFloat(String(settings?.withdraw_min_amount ?? 0));
      if (minAmount > 0 && numAmount < minAmount) {
        await ctx.reply(
          t(lang, 'withdraw_below_min').replace('{min}', minAmount.toFixed(2))
        );
        return;
      }
    } catch {
      // If settings fetch fails, let the backend validate
    }

    // Check balance before proceeding
    try {
      const balData = await getUserBalance(botId, user.id.toString());
      const available = parseFloat(String(balData?.available_for_withdrawal ?? balData?.wallet_balance ?? 0));
      if (available < numAmount) {
        await ctx.reply(
          t(lang, 'insufficient_balance').replace('{balance}', available.toFixed(2))
        );
        return;
      }
    } catch {
      // If balance check fails, let the backend validate
    }

    await setUserState(user.id.toString(), {
      step: 'withdraw_confirm',
      data: { ...state?.data, amount: numAmount },
    });

    const d = state?.data || {};
    const networkLabel = d.networkLabel || d.networkId || '';
    const emojiConfig = await getBotMessageEmojiConfig();
    const confirmMsg =
      `${renderHeaderTitle(emojiConfig, 'field_withdraw', t(lang, 'withdraw_confirm_info'))}\n\n` +
      `${getEmoji(emojiConfig, 'field_network')} ${t(lang, 'withdraw_success_network')}: <b>${networkLabel}</b>\n` +
      `${getEmoji(emojiConfig, 'field_address')} ${t(lang, 'withdraw_success_address')}: <code>${d.address || ''}</code>\n` +
      `${getEmoji(emojiConfig, 'field_amount')} ${t(lang, 'withdraw_success_amount')}: <b>${numAmount.toFixed(2)} USDT</b>`;

    const animatedConfirmMsg = await animateEmojis(confirmMsg);
    await ctx.replyWithHTML(animatedConfirmMsg, Markup.inlineKeyboard([
      [
        Markup.button.callback(t(lang, 'btn_confirm'), 'withdraw_confirm'),
        Markup.button.callback(t(lang, 'btn_cancel'), 'withdraw_cancel'),
      ],
    ]));
  } catch (error) {
    console.error('Withdraw enter amount error:', error);
  }
};

export const handleWithdrawConfirm = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    await ctx.answerCbQuery();

    // Check if user has set withdraw password
    let hasPassword = false;
    try {
      const pwData = await getWithdrawPassword(botId, user.id.toString());
      hasPassword = !!pwData?.has_password;
    } catch {}

    if (!hasPassword) {
      // First time: ask to set password
      await setUserState(user.id.toString(), {
        step: 'withdraw_set_password',
        data: { ...(await getUserState(user.id.toString()))?.data, passwordInput: '' },
      });
      await ctx.reply(t(lang, 'withdraw_set_password'), buildNumpad(lang, ''));
    } else {
      // Ask to enter password
      await setUserState(user.id.toString(), {
        step: 'withdraw_enter_password',
        data: { ...(await getUserState(user.id.toString()))?.data, passwordInput: '' },
      });
      await ctx.reply(t(lang, 'withdraw_enter_password'), buildNumpad(lang, ''));
    }
  } catch (error) {
    console.error('Withdraw confirm error:', error);
  }
};

export const handleWithdrawCancel = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    await clearUserState(user.id.toString());
    await ctx.answerCbQuery();
    await ctx.reply(t(lang, 'cancel'));
    await handleWallet(ctx);
  } catch (error) {
    console.error('Withdraw cancel error:', error);
  }
};

export const handleNumpadInput = async (ctx: Context, digit: string) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    const state = await getUserState(user.id.toString());

    if (!state || !['withdraw_set_password', 'withdraw_enter_password'].includes(state.step || '')) {
      await ctx.answerCbQuery();
      return;
    }

    let current = state.data?.passwordInput || '';
    if (current.length < 4) {
      current += digit;
    }

    await setUserState(user.id.toString(), {
      ...state,
      data: { ...state.data, passwordInput: current },
    });

    await ctx.answerCbQuery('Input updated');
  } catch (error) {
    console.error('Numpad input error:', error);
  }
};

export const handleNumpadDelete = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const state = await getUserState(user.id.toString());

    if (!state || !['withdraw_set_password', 'withdraw_enter_password'].includes(state.step || '')) {
      await ctx.answerCbQuery();
      return;
    }

    let current = state.data?.passwordInput || '';
    current = current.slice(0, -1);

    await setUserState(user.id.toString(), {
      ...state,
      data: { ...state.data, passwordInput: current },
    });

    await ctx.answerCbQuery('Input updated');
  } catch (error) {
    console.error('Numpad delete error:', error);
  }
};

export const handleNumpadConfirm = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    const state = await getUserState(user.id.toString());

    await ctx.answerCbQuery();

    if (!state) return;

    const password = state.data?.passwordInput || '';

    if (!/^\d{4}$/.test(password)) {
      await ctx.reply(t(lang, 'password_digits_only'));
      return;
    }

    if (state.step === 'withdraw_set_password') {
      // Save new password
      try {
        await setWithdrawPassword(botId, user.id.toString(), password);
      } catch (err) {
        console.error('Set password error:', err);
        await ctx.reply(t(lang, 'error'));
        return;
      }

      await ctx.reply(t(lang, 'withdraw_password_set'));

      // Now submit the withdrawal
      await processWithdrawal(ctx, user, lang, botId, state.data);
    } else if (state.step === 'withdraw_enter_password') {
      // Verify password via backend (bcrypt compare)
      let valid = false;
      try {
        const pwData = await verifyWithdrawPassword(botId, user.id.toString(), password);
        valid = !!pwData?.valid;
      } catch {}

      if (!valid) {
        // Reset password input for retry
        await setUserState(user.id.toString(), {
          ...state,
          data: { ...state.data, passwordInput: '' },
        });
        await ctx.reply(t(lang, 'password_incorrect'), buildNumpad(lang, ''));
        return;
      }

      await processWithdrawal(ctx, user, lang, botId, state.data);
    }
  } catch (error) {
    console.error('Numpad confirm error:', error);
  }
};

async function processWithdrawal(ctx: Context, user: any, lang: string, botId: string, data: any) {
  try {
    await clearUserState(user.id.toString());

    await ctx.reply(t(lang, 'withdraw_processing'));

    const result = await submitWithdraw(botId, {
      user_id: user.id,
      network_id: data?.networkId,
      amount: data?.amount,
      to_address: data?.address,
    });

    const orderId: string = result?.data?.order_id || result?.order_id || '-';
    const networkLabel = data?.networkLabel || data?.networkId || '-';
    const submitTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const emojiConfig = await getBotMessageEmojiConfig();

    const successMessage =
      `${renderHeaderTitle(emojiConfig, 'emoji_pending', t(lang, 'withdraw_submitted'))}\n\n` +
      `┌─────────────────────────\n` +
      `│ ${getEmoji(emojiConfig, 'field_order_id')} ${t(lang, 'withdraw_success_order')}: <code>${orderId}</code>\n` +
      `│ ${getEmoji(emojiConfig, 'field_amount')} ${t(lang, 'withdraw_success_amount')}: <b>${Number(data?.amount).toFixed(2)} USDT</b>\n` +
      `│ ${getEmoji(emojiConfig, 'field_network')} ${t(lang, 'withdraw_success_network')}: <b>${networkLabel}</b>\n` +
      `│ ${getEmoji(emojiConfig, 'field_address')} ${t(lang, 'withdraw_success_address')}: <code>${data?.address}</code>\n` +
      `│ ${getEmoji(emojiConfig, 'field_time')} ${t(lang, 'withdraw_submitted_time')}: ${submitTime}\n` +
      `└─────────────────────────\n\n` +
      `ℹ️ ${t(lang, 'withdraw_pending_info')}`;

    const animatedSuccessMessage = await animateEmojis(successMessage);
    await ctx.replyWithHTML(animatedSuccessMessage);
  } catch (err: any) {
    console.error('Submit withdrawal error:', err);
    const apiError: string = err.response?.data?.error || '';
    await ctx.reply(apiError || t(lang, 'error'));
  }
}
