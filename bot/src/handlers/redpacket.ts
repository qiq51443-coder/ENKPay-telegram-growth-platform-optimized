import { Context } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getRedPacket, claimRedPacket } from '../services/api';
import { t } from '../i18n';

export const handleRedPacketClaim = async (ctx: Context, user: User, redPacketId: string) => {
  try {
    const lang = getUserLanguage(user);

    // Check if user has credits
    if (user.red_packet_credits <= 0) {
      await ctx.answerCbQuery(t(lang, 'redpacket_no_credits'), { show_alert: true });
      return;
    }

    // Try to claim
    try {
      const result = await claimRedPacket(redPacketId, user.id);
      
      await ctx.answerCbQuery(
        t(lang, 'redpacket_claimed', { amount: result.amount.toString() }),
        { show_alert: true }
      );

      // Update the message to show new claim status
      const redPacket = await getRedPacket(redPacketId);
      const message = ctx.callbackQuery?.message;
      
      if (message && 'text' in message) {
        const updatedText = message.text + `\n\n✅ ${result.claimed_count}/${redPacket.total_count} claimed`;
        await ctx.editMessageText(updatedText);
      }
    } catch (error: any) {
      if (error.response?.data?.error === 'Already claimed') {
        await ctx.answerCbQuery(t(lang, 'redpacket_already_claimed'), { show_alert: true });
      } else if (error.response?.data?.error === 'Red packet finished') {
        await ctx.answerCbQuery(t(lang, 'redpacket_finished'), { show_alert: true });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Red packet claim error:', error);
    await ctx.answerCbQuery(t('en', 'error'), { show_alert: true });
  }
};
