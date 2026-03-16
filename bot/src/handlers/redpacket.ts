import { Context } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getRedPacket, claimRedPacket } from '../services/api';
import { t } from '../i18n';

export const handleRedPacketClaim = async (ctx: Context, user: User, redPacketId: string, botId?: string) => {
  try {
    const lang = getUserLanguage(user);
    const resolvedBotId = botId || (ctx as any).botId || '';

    // Try to claim
    try {
      const result = await claimRedPacket(resolvedBotId, redPacketId, user.id);
      
      // Answer the callback query first (must be done within 30s)
      const amountStr = result?.amount != null ? String(result.amount) : '0';
      await ctx.answerCbQuery(
        t(lang, 'redpacket_claimed', { amount: amountStr }),
        { show_alert: true }
      );

      // Try to update the message - this is optional and shouldn't block the claim
      try {
        const message = ctx.callbackQuery?.message;
        if (message && 'text' in message) {
          const claimedCount = result.claimed_count ?? '?';
          const redPacket = await getRedPacket(redPacketId);
          const updatedText = message.text + `\n\n✅ ${claimedCount}/${redPacket.total_count} claimed`;
          await ctx.editMessageText(updatedText);
        }
      } catch (updateErr) {
        console.warn('Could not update red packet message:', updateErr);
      }
    } catch (error: any) {
      if (error.response?.data?.error === 'Already claimed') {
        await ctx.answerCbQuery(t(lang, 'redpacket_already_claimed'), { show_alert: true });
      } else if (error.response?.data?.error === 'Red packet finished') {
        await ctx.answerCbQuery(t(lang, 'redpacket_finished'), { show_alert: true });
      } else if (error.response?.data?.error === 'Red packet is not active') {
        await ctx.answerCbQuery(t(lang, 'redpacket_finished'), { show_alert: true });
      } else {
        console.error('Red packet claim API error:', error.response?.data || error.message);
        await ctx.answerCbQuery(t(lang, 'error'), { show_alert: true });
      }
    }
  } catch (error) {
    console.error('Red packet claim error:', error);
    try {
      const lang = getUserLanguage(user);
      await ctx.answerCbQuery(t(lang, 'error'), { show_alert: true });
    } catch {}
  }
};
