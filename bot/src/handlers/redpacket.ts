import { Context } from 'telegraf';
import { User, getUserLanguage } from '../services/user';
import { getRedPacket, claimRedPacket } from '../services/api';
import { t, tClaimConditionNotMet } from '../i18n';
import { animateEmojis } from '../utils/animate-emojis';
import { entitiesToHtml } from '../utils/entities-to-html';

const TG_EMOJI_TAG_RE = /<tg-emoji\b[^>]*>([\s\S]*?)<\/tg-emoji>/gi;

function stripProgressSection(content: string, markers: string[]): string {
  let cutIndex = content.length;
  for (const marker of markers) {
    const index = content.indexOf(`\n\n${marker}`);
    if (index !== -1 && index < cutIndex) {
      cutIndex = index;
    }
  }
  return content.slice(0, cutIndex).trimEnd();
}

function toPlainTextWithEmojiFallback(content: string): string {
  return content.replace(TG_EMOJI_TAG_RE, '$1');
}

function isHtmlParseError(error: any): boolean {
  const description = String(error?.response?.description || error?.description || error?.message || '');
  return description.toLowerCase().includes("can't parse entities");
}

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
      const animatedNotifText = await animateEmojis(notifText);
      await ctx.telegram.sendMessage(ctx.from!.id, animatedNotifText, { parse_mode: 'HTML' }).catch(() => {});

      // Send extra notification for newly auto-registered users
      if (options?.isNew) {
        try {
          const notifLang = options.defaultLanguage || lang;
          const newUserText = t(notifLang, 'redpacket_auto_registered_and_claimed', {
            amount: amountStr,
            multiplier: String(wagMultiplier ?? 2),
          });
          const animatedNewUserText = await animateEmojis(newUserText);
          await ctx.telegram.sendMessage(ctx.from!.id, animatedNewUserText, { parse_mode: 'HTML' }).catch(() => {});
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
        const animatedProgressLine = await animateEmojis(progressLine);
        const plainProgressLine = toPlainTextWithEmojiFallback(animatedProgressLine);
        const progressMarkers = ['📊', '🎉', '<tg-emoji', '&lt;tg-emoji'];
        const replyMarkup = isFinished
          ? { inline_keyboard: [] }
          : { inline_keyboard: [[{ text: `🧧 ${t(rpLang, 'redpacket_claim')}`, callback_data: `claim_redpacket:${redPacketId}` }]] };

        if ('caption' in cbMessage && cbMessage.caption != null) {
          // Photo message: update caption
          const baseCaptionHtml = stripProgressSection(
            entitiesToHtml(cbMessage.caption, (cbMessage as any).caption_entities),
            progressMarkers
          );
          const baseCaptionText = stripProgressSection(cbMessage.caption, progressMarkers);
          await ctx.editMessageCaption(baseCaptionHtml + animatedProgressLine, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          }).catch(async (err) => {
            if (!isHtmlParseError(err)) return;
            await ctx.editMessageCaption(baseCaptionText + plainProgressLine, {
              reply_markup: replyMarkup,
            }).catch(() => {});
          });
        } else if ('text' in cbMessage) {
          // Text message: update text
          const baseTextHtml = stripProgressSection(
            entitiesToHtml(cbMessage.text, (cbMessage as any).entities),
            progressMarkers
          );
          const baseText = stripProgressSection(cbMessage.text, progressMarkers);
          await ctx.editMessageText(baseTextHtml + animatedProgressLine, {
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          }).catch(async (err) => {
            if (!isHtmlParseError(err)) return;
            await ctx.editMessageText(baseText + plainProgressLine, {
              reply_markup: replyMarkup,
            }).catch(() => {});
          });
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
