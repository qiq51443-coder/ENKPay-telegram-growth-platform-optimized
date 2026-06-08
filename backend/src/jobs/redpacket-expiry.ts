import { query, transaction } from '../db';
import { getBotMessageEmojiConfig, getEmoji } from '../utils/emoji-config';
import { sendCrossBotNotification } from '../utils/cross-bot-notify';

const INTERVAL_MS = 60 * 60 * 1000; // Run every hour
const REDPACKET_EXPIRY_NOTIFY: Record<string, { title: string; amount: string; note: string }> = {
  zh: { title: '红包余额已过期', amount: '到期金额', note: '该金额已从红包余额中扣除。' },
  en: { title: 'Red packet balance expired', amount: 'Expired amount', note: 'This amount has been deducted from your red packet balance.' },
  fr: { title: 'Le solde du paquet rouge a expiré', amount: 'Montant expiré', note: 'Ce montant a été déduit de votre solde de paquet rouge.' },
  de: { title: 'Das Red-Packet-Guthaben ist abgelaufen', amount: 'Abgelaufener Betrag', note: 'Dieser Betrag wurde von Ihrem Red-Packet-Guthaben abgezogen.' },
  es: { title: 'El saldo del sobre rojo ha expirado', amount: 'Monto vencido', note: 'Este monto se ha deducido de su saldo de sobre rojo.' },
  ar: { title: 'انتهت صلاحية رصيد الحزمة الحمراء', amount: 'المبلغ المنتهي', note: 'تم خصم هذا المبلغ من رصيد الحزمة الحمراء الخاص بك.' },
  ja: { title: 'レッドパケット残高の有効期限が切れました', amount: '失効金額', note: 'この金額はレッドパケット残高から差し引かれました。' },
};

/**
 * Expire red packet balances whose balance_expires_at has passed.
 * Deducts the claimed amount from the user's reward_balance.
 */
async function processExpiredRedPacketBalances(): Promise<void> {
  try {
    const emojiConfig = await getBotMessageEmojiConfig();
    const redpacketEmoji = getEmoji(emojiConfig, 'field_redpacket') || '🧧';
    const amountEmoji = getEmoji(emojiConfig, 'field_amount') || '💰';
    const warningEmoji = getEmoji(emojiConfig, 'emoji_warning') || '⚠️';

    const expired = await query(`
      SELECT rpc.id, rpc.user_id, rpc.amount
      FROM red_packet_claims rpc
      WHERE rpc.balance_expires_at IS NOT NULL
        AND rpc.balance_expires_at < NOW()
        AND rpc.balance_expiry_processed = false
    `);

    if (expired.rows.length === 0) return;

    for (const claim of expired.rows) {
      try {
        await transaction(async (client) => {
          // Deduct amount from red_packet_balance (floor at 0)
          await client.query(
            `UPDATE users
             SET red_packet_balance = GREATEST(COALESCE(red_packet_balance, 0) - $1, 0)
             WHERE id = $2`,
            [claim.amount, claim.user_id]
          );

          // Mark claim as processed so we don't process it again
          await client.query(
            `UPDATE red_packet_claims SET balance_expiry_processed = true WHERE id = $1`,
            [claim.id]
          );
        });

        await sendCrossBotNotification({
          userId: claim.user_id,
          buildMessage: (lang) => {
            const template = REDPACKET_EXPIRY_NOTIFY[lang] || REDPACKET_EXPIRY_NOTIFY.en;
            const amount = Number(claim.amount || 0).toFixed(2);
            return `${redpacketEmoji} <b>${template.title}</b>\n\n${amountEmoji} ${template.amount}: <b>${amount} USDT</b>\n${warningEmoji} ${template.note}`;
          },
        });
      } catch (err) {
        console.error(`Failed to expire red packet claim ${claim.id}:`, err);
      }
    }

    console.log(`Red packet expiry job: processed ${expired.rows.length} expired claim(s)`);
  } catch (error) {
    console.error('Red packet expiry job error:', error);
  }
}

export function startRedPacketExpiryJob(): void {
  console.log('✓ Red packet expiry job started');
  // Run once on startup
  processExpiredRedPacketBalances();
  // Then run on interval
  setInterval(processExpiredRedPacketBalances, INTERVAL_MS);
}
