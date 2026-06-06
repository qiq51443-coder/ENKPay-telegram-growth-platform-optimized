import { Context, Markup } from 'telegraf';
import { getOrCreateUser, getUserLanguage } from '../services/user';
import { setUserState, clearUserState, getUserState } from '../utils/state';
import { submitTransfer, getUserByUniqueId } from '../services/api';
import { t } from '../i18n';
import { handleWallet } from './wallet';
import { getBotMessageEmojiConfig, getEmoji, renderHeaderTitle } from '../utils/emoji-config';
import { animateEmojis } from '../utils/animate-emojis';

export const handleTransferStart = async (ctx: Context) => {
  try {
    if (!ctx.from) return;

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
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
    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';

    // Validate recipient ID format before making API calls
    const trimmedId = recipientId.trim();
    if (!trimmedId) {
      await ctx.reply(t(lang, 'transfer_invalid_recipient_id'));
      return;
    }

    // Look up recipient by unique_id
    let recipient: any = null;
    try {
      recipient = await getUserByUniqueId(botId, trimmedId);
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
        recipientName: recipient.first_name || recipient.username || trimmedId,
        recipientUniqueId: trimmedId,
      },
    });

    const emojiConfig = await getBotMessageEmojiConfig();
    const confirmMsg =
      `${renderHeaderTitle(emojiConfig, 'field_transfer_send', t(lang, 'transfer_confirm_recipient'))}\n\n` +
      `${getEmoji(emojiConfig, 'field_id')} ID: <b>${trimmedId}</b>\n` +
      `${getEmoji(emojiConfig, 'field_transfer_recv')} Name: <b>${recipient.first_name || recipient.username || '-'}</b>`;

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

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
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
    const emojiConfig = await getBotMessageEmojiConfig();
    const confirmMsg =
      `${renderHeaderTitle(emojiConfig, 'field_transfer_send', t(lang, 'transfer_confirm_recipient'))}\n\n` +
      `${getEmoji(emojiConfig, 'field_id')} ${t(lang, 'transfer_to')}: <b>${d.recipientName || d.recipientUniqueId || ''}</b>\n` +
      `${getEmoji(emojiConfig, 'field_amount')} ${t(lang, 'transfer_amount')}: <b>${numAmount.toFixed(2)} USDT</b>`;

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

    const botId = (ctx as any).botId || process.env.BOT_ID || 'default';
    const user = await getOrCreateUser(ctx, botId);
    const lang = getUserLanguage(user);
    const state = await getUserState(user.id.toString());

    await ctx.answerCbQuery();

    if (!state?.data) {
      await ctx.reply(t(lang, 'error'));
      return;
    }

    const { recipientId, recipientName, recipientUniqueId, recipientTelegramId, recipientLanguage, amount } = state.data;

    await clearUserState(user.id.toString());

    // Processing indicator
    await ctx.reply(t(lang, 'transfer_processing'));

    try {
      const result = await submitTransfer(botId, {
        from_user_id: user.id,
        to_identifier: recipientUniqueId || recipientId,
        amount,
      });

      const fee: number = result?.data?.fee ?? 0;
      const actualReceived: number = result?.data?.actual_received ?? amount;
      const orderId: string = result?.data?.order_id || '-';
      const emojiConfig = await getBotMessageEmojiConfig();

      const successMsg =
        `${renderHeaderTitle(emojiConfig, 'emoji_success', t(lang, 'transfer_success'))}\n\n` +
        `${getEmoji(emojiConfig, 'field_order_id')} ${t(lang, 'transfer_order_id')}: <code>${orderId}</code>\n` +
        `${getEmoji(emojiConfig, 'field_id')} ${t(lang, 'transfer_to')}: <b>${recipientName || recipientUniqueId || '-'}</b>\n` +
        `${getEmoji(emojiConfig, 'field_amount')} ${t(lang, 'transfer_amount')}: <b>${amount.toFixed(2)} USDT</b>\n` +
        `${getEmoji(emojiConfig, 'field_fee')} ${t(lang, 'transfer_fee')}: <b>${fee.toFixed(2)} USDT</b>\n` +
        `${getEmoji(emojiConfig, 'emoji_success')} ${t(lang, 'transfer_delivered')}: <b>${actualReceived.toFixed(2)} USDT</b>`;

      const animatedSuccessMsg = await animateEmojis(successMsg);
      await ctx.replyWithHTML(animatedSuccessMsg);

      // Notify recipient if we have their telegram_id
      if (recipientTelegramId) {
        try {
          const rLang = recipientLanguage || 'en';
          const notifyMsg =
            `${renderHeaderTitle(emojiConfig, 'field_transfer_recv', t(rLang, 'transfer_received'))}\n\n` +
            `${getEmoji(emojiConfig, 'field_order_id')} ${t(rLang, 'transfer_order_id')}: <code>${orderId}</code>\n` +
            `${getEmoji(emojiConfig, 'field_id')} ${t(rLang, 'transfer_from')}: <b>${(user as any).first_name || (user as any).username || '-'}</b>\n` +
            `${getEmoji(emojiConfig, 'emoji_success')} ${t(rLang, 'transfer_delivered')}: <b>${actualReceived.toFixed(2)} USDT</b>`;
          const animatedNotifyMsg = await animateEmojis(notifyMsg);
          await ctx.telegram.sendMessage(recipientTelegramId, animatedNotifyMsg, { parse_mode: 'HTML' });
        } catch (notifyErr) {
          console.error('Failed to notify recipient:', notifyErr);
        }
      }
    } catch (err: any) {
      console.error('Transfer API error:', err);
      const apiError: string = err.response?.data?.error || '';
      await ctx.reply(apiError || t(lang, 'error'));
    }
  } catch (error) {
    console.error('Transfer confirm error:', error);
  }
};

export const handleTransferCancel = async (ctx: Context) => {
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
    console.error('Transfer cancel error:', error);
  }
};
