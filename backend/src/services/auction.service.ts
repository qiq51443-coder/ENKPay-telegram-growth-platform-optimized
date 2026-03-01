import crypto from 'crypto';
import { query, transaction } from '../db';

/**
 * Draw a winner for a completed auction.
 * Called automatically when current_participants >= participant_count.
 */
export async function drawWinner(auctionId: string): Promise<void> {
  await transaction(async (client) => {
    // Lock the auction row
    const auctionResult = await client.query(
      `SELECT * FROM auctions WHERE id = $1 FOR UPDATE`,
      [auctionId]
    );

    if (auctionResult.rows.length === 0) {
      throw new Error('Auction not found');
    }

    const auction = auctionResult.rows[0];

    if (auction.status !== 'active') {
      return; // Already drawn or cancelled
    }

    // Get all participants
    const participantsResult = await client.query(
      `SELECT ap.*, u.unique_id, u.telegram_id, u.first_name, u.bot_id
       FROM auction_participants ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.auction_id = $1`,
      [auctionId]
    );

    const participants = participantsResult.rows;
    if (participants.length === 0) {
      throw new Error('No participants in auction');
    }

    // Build lottery pool: expand by quantity
    const pool: string[] = [];
    for (const p of participants) {
      for (let i = 0; i < p.quantity; i++) {
        pool.push(p.user_id);
      }
    }

    // Secure random selection
    const winnerIndex = crypto.randomInt(0, pool.length);
    const winnerId = pool[winnerIndex];

    // Find winner participant info
    const winnerParticipant = participants.find((p) => p.user_id === winnerId);
    const winnerUniqueId = winnerParticipant?.unique_id || null;

    const charityAmount =
      (Number(auction.product_value) * Number(auction.platform_fee_percent)) / 100;
    const payoutAmount = Number(auction.winner_payout);

    // Update auction status
    await client.query(
      `UPDATE auctions
       SET status = 'completed', winner_id = $1, winner_unique_id = $2,
           drawn_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [winnerId, winnerUniqueId, auctionId]
    );

    // Mark winner in participants
    await client.query(
      `UPDATE auction_participants SET is_winner = true WHERE auction_id = $1 AND user_id = $2`,
      [auctionId, winnerId]
    );

    // Insert auction result
    await client.query(
      `INSERT INTO auction_results
       (auction_id, winner_id, winner_unique_id, product_title, product_value,
        payout_amount, charity_amount, total_participants)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        auctionId,
        winnerId,
        winnerUniqueId,
        auction.title,
        auction.product_value,
        payoutAmount,
        charityAmount,
        pool.length,
      ]
    );

    // Notify all participants (fire and forget)
    notifyParticipants(auction, participants, winnerId, winnerUniqueId, payoutAmount).catch(
      (err) => console.error('Notification error:', err)
    );
  });
}

/**
 * Notify all participants of auction result via Telegram messages.
 * Uses bot API to send messages — silently skips on errors.
 */
async function notifyParticipants(
  auction: any,
  participants: any[],
  winnerId: string,
  winnerUniqueId: string | null,
  payoutAmount: number
): Promise<void> {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return;

  for (const p of participants) {
    try {
      const isWinner = p.user_id === winnerId;
      const text = isWinner
        ? `🏆 恭喜您赢得了竞拍【${auction.title}】！您可兑换 ${payoutAmount.toFixed(2)} USDT。`
        : `🎯 竞拍【${auction.title}】已开奖！获奖者：${winnerUniqueId || '未知'}。感谢您的参与！`;

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: p.telegram_id, text }),
      });
    } catch {
      // Silently ignore notification errors
    }
  }
}

/**
 * Process expired auctions: refund all participants and mark as expired.
 * Called by the cleanup job.
 */
export async function processExpiredAuctions(): Promise<void> {
  // Find expired active auctions
  const expired = await query(
    `UPDATE auctions SET status = 'expired', updated_at = NOW()
     WHERE status = 'active' AND expires_at <= NOW()
     RETURNING *`,
    []
  );

  for (const auction of expired.rows) {
    try {
      await refundAuction(auction);
    } catch (err) {
      console.error(`Failed to refund auction ${auction.id}:`, err);
    }
  }

  if (expired.rows.length > 0) {
    console.log(`Cleanup: expired ${expired.rows.length} auctions and issued refunds`);
  }
}

/**
 * Refund all participants of a cancelled or expired auction.
 */
export async function refundAuction(auction: any): Promise<void> {
  await transaction(async (client) => {
    const participants = await client.query(
      `SELECT ap.*, u.telegram_id
       FROM auction_participants ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.auction_id = $1 AND ap.refunded = false`,
      [auction.id]
    );

    for (const p of participants.rows) {
      // Refund balance
      await client.query(
        `UPDATE users SET balance = balance + $1 WHERE id = $2`,
        [p.amount, p.user_id]
      );
      // Mark refunded
      await client.query(
        `UPDATE auction_participants SET refunded = true WHERE id = $1`,
        [p.id]
      );

      // Notify participant (fire and forget)
      const BOT_TOKEN = process.env.BOT_TOKEN;
      if (BOT_TOKEN && p.telegram_id) {
        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: p.telegram_id,
            text: `💰 竞拍【${auction.title}】未满员，已自动退款 ${Number(p.amount).toFixed(2)} USDT 到您的账户。`,
          }),
        }).catch(() => {});
      }
    }
  });
}
