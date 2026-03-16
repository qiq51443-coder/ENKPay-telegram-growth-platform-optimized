import { Context } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getRedPacket, claimRedPacket } from '../services/api';
import { t } from '../i18n';

export const handleRedPacketClaim = async (ctx: Context, user: User, redPacketId: string, botId?: string) => {
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

    // Send private notification to user
    try {
      const multiplier = result?.wagering_multiplier ?? 2;
      const balanceExpiryHours = result?.balance_expiry_hours ?? null;

      const chatId = ctx.from?.id;
      if (chatId) {
        if (balanceExpiryHours != null) {
          const days = Math.ceil(Number(balanceExpiryHours) / 24);
          const notificationText = t(lang, 'redpacket_received_notification', {
            amount: amountStr,
            multiplier: String(multiplier),
            days: String(days),
          });
          await ctx.telegram.sendMessage(chatId, notificationText).catch(() => {});
        } else {
          const notificationText = t(lang, 'redpacket_received_notification_no_expiry', {
            amount: amountStr,
            multiplier: String(multiplier),
          });
          await ctx.telegram.sendMessage(chatId, notificationText).catch(() => {});
        }
      }
    } catch (notifErr) {
      console.warn('[redpacket] Could not send claim notification:', notifErr);
    }

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
      if (cbMessage && 'text' in cbMessage) {
        // Only hide button when truly finished — don't rely on rp?.status which may be stale
        const isFinished =
          result.status === 'finished' ||
          (typeof claimedCount === 'number' && typeof totalCount === 'number' && claimedCount >= totalCount);

        // Use the red packet's configured language for group message text, falling back to claimer language
        const rpLang = rp?.language || lang;
        const progressLine = isFinished
          ? `\n\n${t(rpLang, 'redpacket_all_claimed', { claimed: String(claimedCount), total: String(totalCount), claimed_amount: claimedAmount })}`
          : `\n\n${t(rpLang, 'redpacket_progress', { claimed: String(claimedCount), total: String(totalCount), claimed_amount: claimedAmount, total_amount: totalAmount })}`;

        // Strip any previous progress lines before appending the updated one
        const baseText = cbMessage.text.split('\n\n📊')[0].split('\n\n🎉')[0];
        await ctx.editMessageText(baseText + progressLine, {
          reply_markup: isFinished
            ? { inline_keyboard: [] }
            : { inline_keyboard: [[{ text: `🧧 ${t(rpLang, 'redpacket_claim')}`, callback_data: `claim_redpacket:${redPacketId}` }]] },
        }).catch(() => {});
      }
    } catch (updateErr) {
      console.warn('[redpacket] Could not update red packet message:', updateErr);
    }

  } catch (error: any) {
    const errMsg = error.response?.data?.error || error.message || '';
    if (errMsg === 'Already claimed') {
      await ctx.answerCbQuery(t(lang, 'redpacket_already_claimed'), { show_alert: true }).catch(() => {});
    } else if (errMsg === 'Red packet finished') {
      await ctx.answerCbQuery(t(lang, 'redpacket_finished'), { show_alert: true }).catch(() => {});
    } else if (errMsg === 'Red packet is not active' || errMsg === 'Red packet has expired') {
      await ctx.answerCbQuery(t(lang, 'redpacket_finished'), { show_alert: true }).catch(() => {});
    } else if (errMsg.includes('仅') || errMsg.includes('需要')) {
      // Claim condition not met — surface the backend's message directly
      await ctx.answerCbQuery(errMsg, { show_alert: true }).catch(() => {});
    } else {
      console.error('[redpacket] Claim API error:', error.response?.data || error.message);
      await ctx.answerCbQuery(t(lang, 'error'), { show_alert: true }).catch(() => {});
    }
  }
};
