import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { setUserState, clearUserState, getUserState } from '../utils/state';
import { submitTransfer, getUserByUniqueId } from '../services/api';
import { t } from '../i18n';

export const handleTransferStart = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    await setUserState(user.id.toString(), {
      step: 'transfer_enter_id',
      data: {},
    });

    await ctx.answerCbQuery();
    await ctx.reply(t(lang, 'transfer_enter_id'), Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn_cancel'), 'transfer_back')],
    ]));
  } catch (error) {
    console.error('Transfer start error:', error);
  }
};

export const handleTransferEnterId = async (ctx: Context, user: any, recipientId: string) => {
  try {
    const lang = getUserLanguage(user);
    const botId = process.env.BOT_ID || 'default';

    // Look up recipient by unique_id
    let recipient: any = null;
    try {
      recipient = await getUserByUniqueId(botId, recipientId);
    } catch {}

    if (!recipient) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    if (recipient.id === user.id) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    await setUserState(user.id.toString(), {
      step: 'transfer_confirm_recipient',
      data: {
        recipientId: recipient.id,
        recipientTelegramId: recipient.telegram_id,
        recipientLanguage: recipient.language_code || 'en',
        recipientName: recipient.first_name || recipient.username || recipientId,
        recipientUniqueId: recipientId,
      },
    });

    const confirmMsg =
      `👤 <b>${t(lang, 'transfer_confirm_recipient')}</b>\n\n` +
      `🆔 ID: <b>${recipientId}</b>\n` +
      `👤 Name: <b>${recipient.first_name || recipient.username || '-'}</b>`;

    await ctx.replyWithHTML(confirmMsg, Markup.inlineKeyboard([
      [
        Markup.button.callback(t(lang, 'btn_confirm'), 'transfer_confirm_recipient'),
        Markup.button.callback(t(lang, 'btn_cancel'), 'transfer_back'),
      ],
    ]));
  } catch (error) {
    console.error('Transfer enter ID error:', error);
  }
};

export const handleTransferConfirmRecipient = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    const state = await getUserState(user.id.toString());

    await ctx.answerCbQuery();

    await setUserState(user.id.toString(), {
      step: 'transfer_enter_amount',
      data: state?.data || {},
    });

    await ctx.reply(t(lang, 'transfer_enter_amount'));
  } catch (error) {
    console.error('Transfer confirm recipient error:', error);
  }
};

export const handleTransferEnterAmount = async (ctx: Context, user: any, amount: string) => {
  try {
    const lang = getUserLanguage(user);
    const state = await getUserState(user.id.toString());
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    await setUserState(user.id.toString(), {
      step: 'transfer_confirm',
      data: { ...state?.data, amount: numAmount },
    });

    const d = state?.data || {};
    const confirmMsg =
      `💸 <b>${t(lang, 'transfer_enter_amount')}</b>\n\n` +
      `👤 To: <b>${d.recipientName || d.recipientUniqueId || ''}</b>\n` +
      `💵 Amount: <b>${numAmount.toFixed(2)} USDT</b>`;

    await ctx.replyWithHTML(confirmMsg, Markup.inlineKeyboard([
      [
        Markup.button.callback(t(lang, 'btn_confirm'), 'transfer_confirm'),
        Markup.button.callback(t(lang, 'btn_cancel'), 'transfer_back'),
      ],
    ]));
  } catch (error) {
    console.error('Transfer enter amount error:', error);
  }
};

export const handleTransferConfirm = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    const state = await getUserState(user.id.toString());

    await ctx.answerCbQuery();
    await clearUserState(user.id.toString());

    if (!state?.data) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    const { recipientId, recipientName, recipientUniqueId, recipientTelegramId, recipientLanguage, amount } = state.data;

    // Processing indicator
    await ctx.reply(t(lang, 'withdraw_processing'));

    // Wait 3 seconds before showing result
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      await submitTransfer(botId, {
        from_user_id: user.id,
        to_identifier: recipientUniqueId || recipientId,
        amount,
      });

      const successMsg =
        `✅ <b>${t(lang, 'transfer_success')}</b>\n\n` +
        `👤 To: <b>${recipientName || recipientUniqueId || '-'}</b>\n` +
        `💵 Amount: <b>${amount.toFixed(2)} USDT</b>`;

      await ctx.replyWithHTML(successMsg);

      // Notify recipient if we have their telegram_id
      if (recipientTelegramId) {
        try {
          const rLang = recipientLanguage || 'en';
          const notifyMsg =
            `${t(rLang, 'transfer_received')}\n\n` +
            `👤 From: <b>${user.first_name || user.username || '-'}</b>\n` +
            `💵 Amount: <b>${amount.toFixed(2)} USDT</b>`;
          await ctx.telegram.sendMessage(recipientTelegramId, notifyMsg, { parse_mode: 'HTML' });
        } catch (notifyErr) {
          console.error('Failed to notify recipient:', notifyErr);
        }
      }
    } catch (err: any) {
      console.error('Transfer API error:', err);
      await ctx.reply(err.response?.data?.error || t(lang, 'error'));
    }
  } catch (error) {
    console.error('Transfer confirm error:', error);
  }
};

export const handleTransferCancel = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);

    await clearUserState(user.id.toString());
    await ctx.answerCbQuery();
    await ctx.reply(t(lang, 'cancel'));
  } catch (error) {
    console.error('Transfer cancel error:', error);
  }
};
