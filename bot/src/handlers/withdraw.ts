import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { setUserState, clearUserState, getUserState } from '../utils/state';
import { getWithdrawPassword, setWithdrawPassword, submitWithdraw, verifyWithdrawPassword } from '../services/api';
import { t } from '../i18n';

const NETWORKS = [
  { label: 'BSC (BEP20)', id: 'BSC' },
  { label: 'ETH (ERC20)', id: 'ETH' },
  { label: 'TRC (TRC20)', id: 'TRC' },
];

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

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    await ctx.editMessageText(
      `📤 <b>${t(lang, 'btn_withdraw')}</b>\n\n${t(lang, 'withdraw_select_network')}`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          NETWORKS.map(n => Markup.button.callback(n.label, `withdraw_network:${n.id}`)),
          [Markup.button.callback(t(lang, 'btn_back'), 'wallet_back_to_wallet')],
        ]),
      }
    );
  } catch (error) {
    console.error('Withdraw select network error:', error);
  }
};

export const handleWithdrawSelectNetworkCallback = async (ctx: Context, networkId: string) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    // Save network in state and prompt for address
    await setUserState(user.id.toString(), {
      step: 'withdraw_enter_address',
      data: { networkId },
    });

    await ctx.answerCbQuery();
    await ctx.reply(t(lang, 'withdraw_enter_address'));
  } catch (error) {
    console.error('Withdraw network callback error:', error);
  }
};

export const handleWithdrawEnterAddress = async (ctx: Context, user: any, address: string) => {
  try {
    const lang = getUserLanguage(user);
    const state = await getUserState(user.id.toString());

    await setUserState(user.id.toString(), {
      step: 'withdraw_enter_amount',
      data: { ...state?.data, address },
    });

    await ctx.reply(t(lang, 'withdraw_enter_amount'));
  } catch (error) {
    console.error('Withdraw enter address error:', error);
  }
};

export const handleWithdrawEnterAmount = async (ctx: Context, user: any, amount: string) => {
  try {
    const lang = getUserLanguage(user);
    const state = await getUserState(user.id.toString());
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    await setUserState(user.id.toString(), {
      step: 'withdraw_confirm',
      data: { ...state?.data, amount: numAmount },
    });

    const d = state?.data || {};
    const confirmMsg =
      `📤 <b>${t(lang, 'withdraw_confirm_info')}</b>\n\n` +
      `🌐 Network: <b>${d.networkId || ''}</b>\n` +
      `📍 Address: <code>${d.address || ''}</code>\n` +
      `💵 Amount: <b>${numAmount.toFixed(2)} USDT</b>`;

    await ctx.replyWithHTML(confirmMsg, Markup.inlineKeyboard([
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

    const botId = process.env.BOT_ID || 'default';
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

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    await clearUserState(user.id.toString());
    await ctx.answerCbQuery();
    await ctx.reply(t(lang, 'cancel'));
  } catch (error) {
    console.error('Withdraw cancel error:', error);
  }
};

export const handleNumpadInput = async (ctx: Context, digit: string) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
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

    const botId = process.env.BOT_ID || 'default';
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

    const botId = process.env.BOT_ID || 'default';
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

    await submitWithdraw(botId, {
      user_id: user.id,
      network_id: data?.networkId,
      amount: data?.amount,
      to_address: data?.address,
    });
  } catch (err: any) {
    console.error('Submit withdrawal error:', err);
    await ctx.reply(err.response?.data?.error || t(lang, 'error'));
  }
}
