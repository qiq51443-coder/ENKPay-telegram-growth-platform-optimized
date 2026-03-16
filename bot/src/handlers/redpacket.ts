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
        const isFinished =
          result.status === 'finished' ||
          rp?.status === 'finished' ||
          (typeof claimedCount === 'number' && typeof totalCount === 'number' && claimedCount >= totalCount);

        const progressLine = isFinished
          ? `\n\n🎉 红包已抢完！${claimedCount}/${totalCount} 人领取，共 ${claimedAmount} USDT`
          : `\n\n📊 已领 ${claimedCount}/${totalCount} 个 | 已领金额 ${claimedAmount}/${totalAmount} USDT`;

        // Strip any previous progress lines before appending the updated one
        const baseText = cbMessage.text.split('\n\n📊')[0].split('\n\n🎉')[0];
        await ctx.editMessageText(baseText + progressLine).catch(() => {});
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
