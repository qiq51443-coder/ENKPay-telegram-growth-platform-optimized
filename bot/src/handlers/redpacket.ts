import { Context } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getRedPacket, claimRedPacket } from '../services/api';
import { t, tClaimConditionNotMet } from '../i18n';

export const handleRedPacketClaim = async (ctx: Context, user: User, redPacketId: string, botId?: string, options?: { isNew?: boolean; defaultLanguage?: string }) => {
  const lang = getUserLanguage(user);
  const resolvedBotId = botId || (ctx as any).botId || '';

  try {
    const result = await claimRedPacket(resolvedBotId, redPacketId, user.id);

    // Answer the callback query first (must be done within 30s)
    const amountStr = result?.amount != null ? Number(result.amount).toFixed(2) : '0.00';
    await ctx.answerCbQuery(
      t(lang, 'redpacket_claimed', { amount: amountStr }),
      { show_alert: true }
    );

    // Send private notification to the claimer
    try {
      const wagMultiplier = result.wagering_multiplier;
      const expiryHours = result.balance_expiry_hours;
      let notifText: string;
      if (!expiryHours) {
        notifText = t(lang, 'redpacket_received_notification_permanent', {
          amount: amountStr,
          multiplier: String(wagMultiplier ?? 2),
        });
      } else {
        notifText = t(lang, 'redpacket_received_notification', {
          amount: amountStr,
          multiplier: String(wagMultiplier ?? 2),
          days: String(Math.ceil(expiryHours / 24)),
        });
      }
      await ctx.telegram.sendMessage(ctx.from!.id, notifText, { parse_mode: 'HTML' }).catch(() => {});

      // Send extra notification for newly auto-registered users
      if (options?.isNew) {
        try {
          const notifLang = options.defaultLanguage || lang;
          const newUserText = t(notifLang, 'redpacket_auto_registered_and_claimed', {
            amount: amountStr,
            multiplier: String(wagMultiplier ?? 2),
          });
          await ctx.telegram.sendMessage(ctx.from!.id, newUserText, { parse_mode: 'HTML' }).catch(() => {});
        } catch (_) {}
      }
    } catch (_) {}

    // Try to update the message with progress info — optional, must not block claim
    try {
      const rpData = await getRedPacket(redPacketId);
      // getRedPacket returns { redPacket: {...} }
      const rp = rpData?.redPacket ?? rpData;
      const claimedCount = result.claimed_count ?? rp?.claimed_count ?? '?';
      const totalCount = result.total_count ?? rp?.total_count ?? '?';
      const claimedAmount = rp?.claimed_amount != null ? Number(rp.claimed_amount).toFixed(2) : '?';
      const totalAmount = rp?.total_amount != null ? Number(rp.total_amount).toFixed(2) : '?';

      const cbMessage = ctx.callbackQuery?.message;
      if (cbMessage && ('text' in cbMessage || 'caption' in cbMessage)) {
        const isFinished = rp?.status !== 'active';

        // Use the red packet's configured language for group message text, falling back to claimer language
        const rpLang = rp?.language || lang;
        const progressLine = isFinished
          ? `\n\n${t(rpLang, 'redpacket_all_claimed', { claimed: String(claimedCount), total: String(totalCount), claimed_amount: claimedAmount })}`
          : `\n\n${t(rpLang, 'redpacket_progress', { claimed: String(claimedCount), total: String(totalCount), claimed_amount: claimedAmount, total_amount: totalAmount })}`;

        if ('caption' in cbMessage && cbMessage.caption != null) {
          // Photo message: update caption
          const baseCaption = cbMessage.caption.split('\n\n📊')[0].split('\n\n🎉')[0];
          await ctx.editMessageCaption(baseCaption + progressLine, {
            reply_markup: isFinished
              ? { inline_keyboard: [] }
              : { inline_keyboard: [[{ text: `🧧 ${t(rpLang, 'redpacket_claim')}`, callback_data: `claim_redpacket:${redPacketId}` }]] },
          }).catch(() => {});
        } else if ('text' in cbMessage) {
          // Text message: update text
          const baseText = cbMessage.text.split('\n\n📊')[0].split('\n\n🎉')[0];
          await ctx.editMessageText(baseText + progressLine, {
            reply_markup: isFinished
              ? { inline_keyboard: [] }
              : { inline_keyboard: [[{ text: `🧧 ${t(rpLang, 'redpacket_claim')}`, callback_data: `claim_redpacket:${redPacketId}` }]] },
          }).catch(() => {});
        }
      }
    } catch (updateErr) {
      console.warn('[redpacket] Could not update red packet message:', updateErr);
    }

  } catch (error: any) {
    const errData = error.response?.data;
    const errMsg = errData?.error || error.message || '';
    if (errMsg === 'Already claimed') {
      await ctx.answerCbQuery(t(lang, 'redpacket_already_claimed'), { show_alert: true }).catch(() => {});
    } else if (errMsg === 'Red packet finished') {
      await ctx.answerCbQuery(t(lang, 'redpacket_finished'), { show_alert: true }).catch(() => {});
    } else if (errMsg === 'Red packet is not active' || errMsg === 'Red packet has expired') {
      await ctx.answerCbQuery(t(lang, 'redpacket_finished'), { show_alert: true }).catch(() => {});
    } else if (errMsg === 'CLAIM_CONDITION_NOT_MET') {
      const condition = errData?.condition || '';
      await ctx.answerCbQuery(tClaimConditionNotMet(lang, condition), { show_alert: true }).catch(() => {});
    } else {
      console.error('[redpacket] Claim API error:', error.response?.data || error.message);
      await ctx.answerCbQuery(t(lang, 'error'), { show_alert: true }).catch(() => {});
    }
  }
};
