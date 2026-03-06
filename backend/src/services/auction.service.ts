import crypto from 'crypto';
import { query, transaction } from '../db';

/**
 * Draw a winner for an auction using cryptographically secure random selection.
 * Each participant's entries are weighted by quantity purchased.
 */
export async function drawWinner(auctionId: string): Promise<void> {  await transaction(async (client) => {
    // 1. Lock the auction row and verify it's still active
    const auctionResult = await client.query(
      `SELECT * FROM lucky_auctions WHERE id = $1 FOR UPDATE`,
      [auctionId]
    );

    if (auctionResult.rows.length === 0) {
      throw new Error('Auction not found');
    }

    const auction = auctionResult.rows[0];

    if (auction.status !== 'active') {
      return; // Already drawn or cancelled
    }

    // 2. Get all participants and expand into a weighted pool
    const participantsResult = await client.query(
      `SELECT lap.user_id, lap.quantity, u.unique_id, u.telegram_id
       FROM lucky_auction_participants lap
       JOIN users u ON lap.user_id = u.id
       WHERE lap.auction_id = $1`,
      [auctionId]
    );

    if (participantsResult.rows.length === 0) {
      return;
    }

    // Build weighted pool: user with quantity=2 appears twice
    const pool: Array<{ user_id: string; unique_id: string; telegram_id: number }> = [];
    for (const p of participantsResult.rows) {
      for (let i = 0; i < p.quantity; i++) {
        pool.push({ user_id: p.user_id, unique_id: p.unique_id, telegram_id: p.telegram_id });
      }
    }

    // 3. Cryptographically secure random selection
    const winnerIndex = crypto.randomInt(0, pool.length);
    const winner = pool[winnerIndex];

    const now = new Date();
    const charityAmount = parseFloat(auction.product_value) * parseFloat(auction.platform_fee_percent) / 100;

    // 4. Update auction with winner
    await client.query(
      `UPDATE lucky_auctions
       SET status = 'completed',
           winner_id = $1,
           winner_unique_id = $2,
           drawn_at = $3,
           updated_at = $3
       WHERE id = $4`,
      [winner.user_id, winner.unique_id, now, auctionId]
    );

    // 5. Mark winner in participants
    await client.query(
      `UPDATE lucky_auction_participants SET is_winner = true
       WHERE auction_id = $1 AND user_id = $2`,
      [auctionId, winner.user_id]
    );

    // 6. Insert auction result record
    await client.query(
      `INSERT INTO lucky_auction_results
         (auction_id, winner_id, winner_unique_id, product_title, product_value,
          payout_amount, charity_amount, total_participants)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        auctionId,
        winner.user_id,
        winner.unique_id,
        auction.title,
        auction.product_value,
        auction.winner_payout,
        charityAmount,
        auction.current_participants,
      ]
    );

    // 7. Notify participants via Telegram (best-effort, errors logged but not thrown)
    try {
      await notifyParticipants(client, auction, winner);
    } catch (err) {
      console.error(`drawWinner: notification failed for auction ${auctionId}:`, err);
    }
  });
}

async function notifyParticipants(
  client: any,
  auction: any,
  winner: { user_id: string; unique_id: string; telegram_id: number }
): Promise<void> {
  // Fetch the first active bot token to send notifications
  const botResult = await client.query(
    `SELECT token FROM bots WHERE is_active = true LIMIT 1`
  );
  if (botResult.rows.length === 0) return;

  const token = botResult.rows[0].token;
  const TelegramAPI = (await import('../utils/telegram')).default;
  const tg = new TelegramAPI(token);

  // Get all participants' telegram IDs
  const participantsResult = await client.query(
    `SELECT u.telegram_id, lap.user_id
     FROM lucky_auction_participants lap
     JOIN users u ON lap.user_id = u.id
     WHERE lap.auction_id = $1`,
    [auction.id]
  );

  for (const p of participantsResult.rows) {
    try {
      if (p.user_id === winner.user_id) {
        await tg.sendMessage(
          p.telegram_id,
          `🏆 恭喜！您赢得了 <b>${auction.title}</b>，可兑换为 <b>${parseFloat(auction.winner_payout).toFixed(2)} USDT</b>`
        );
      } else {
        await tg.sendMessage(
          p.telegram_id,
          `🎉 竞拍 <b>${auction.title}</b> 已开奖！获奖者：<b>${winner.unique_id}</b>`
        );
      }
    } catch {
      // Individual notification failure is non-fatal
    }
  }
}

/**
 * Expire auctions that have passed their deadline without being completed,
 * refund all participants, and notify them.
 * Guard prevents concurrent executions.
 */
let expireAuctionsRunning = false;

export async function expireAuctions(): Promise<void> {
  if (expireAuctionsRunning) return;
  expireAuctionsRunning = true;
  try {
    await _expireAuctions();
  } finally {
    expireAuctionsRunning = false;
  }
}

async function _expireAuctions(): Promise<void> {
  // Find all active auctions past their expiry time
  const expiredResult = await query(
    `SELECT * FROM lucky_auctions
     WHERE status = 'active' AND expires_at <= NOW()`,
    []
  );

  for (const auction of expiredResult.rows) {
    try {
      await transaction(async (client) => {
        // Lock the row
        const lockResult = await client.query(
          `SELECT status FROM lucky_auctions WHERE id = $1 FOR UPDATE`,
          [auction.id]
        );
        if (lockResult.rows[0].status !== 'active') return;

        // Mark as expired
        await client.query(
          `UPDATE lucky_auctions SET status = 'expired', updated_at = NOW() WHERE id = $1`,
          [auction.id]
        );

        // Refund each participant
        const participantsResult = await client.query(
          `SELECT lap.*, u.wallet_balance, u.telegram_id
           FROM lucky_auction_participants lap
           JOIN users u ON lap.user_id = u.id
           WHERE lap.auction_id = $1 AND lap.refunded = false`,
          [auction.id]
        );

        for (const p of participantsResult.rows) {
          await client.query(
            `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
            [p.amount, p.user_id]
          );
          await client.query(
            `UPDATE lucky_auction_participants SET refunded = true WHERE id = $1`,
            [p.id]
          );
          await client.query(
            `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
             SELECT $1, 'auction_refund', $2, wallet_balance, $3, $4
             FROM users WHERE id = $1`,
            [p.user_id, p.amount, `竞拍 ${auction.title} 未满员退款`, auction.id]
          );
        }

        // Best-effort notifications
        try {
          await notifyExpiredParticipants(client, auction, participantsResult.rows);
        } catch (err) {
          console.error(`expireAuctions: notification failed for auction ${auction.id}:`, err);
        }
      });
    } catch (err) {
      console.error(`expireAuctions: failed to expire auction ${auction.id}:`, err);
    }
  }

  if (expiredResult.rows.length > 0) {
    console.log(`AuctionCleanup: expired ${expiredResult.rows.length} auctions and refunded participants`);
  }
}

async function notifyExpiredParticipants(client: any, auction: any, participants: any[]): Promise<void> {
  const botResult = await client.query(
    `SELECT token FROM bots WHERE is_active = true LIMIT 1`
  );
  if (botResult.rows.length === 0) return;

  const token = botResult.rows[0].token;
  const TelegramAPI = (await import('../utils/telegram')).default;
  const tg = new TelegramAPI(token);

  for (const p of participants) {
    try {
      await tg.sendMessage(
        p.telegram_id,
        `💰 竞拍 <b>${auction.title}</b> 未满员，已自动退款 <b>${parseFloat(p.amount).toFixed(2)} USDT</b>`
      );
    } catch {
      // Individual notification failure is non-fatal
    }
  }
}
