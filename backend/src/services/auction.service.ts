import crypto from 'crypto';
import { query, transaction } from '../db';

// Notification messages for the 7 supported languages
const DRAW_NOTIFICATION: Record<string, (title: string, winnerId: string) => string> = {
  zh: (title, winnerId) => `🎉 竞拍 <b>${title}</b> 已开奖！获奖者ID：<b>${winnerId}</b>`,
  en: (title, winnerId) => `🎉 Auction <b>${title}</b> has drawn! Winner ID: <b>${winnerId}</b>`,
  ja: (title, winnerId) => `🎉 オークション <b>${title}</b> の抽選が完了しました！当選者ID：<b>${winnerId}</b>`,
  de: (title, winnerId) => `🎉 Auktion <b>${title}</b> hat gezogen! Gewinner-ID: <b>${winnerId}</b>`,
  fr: (title, winnerId) => `🎉 L'enchère <b>${title}</b> a tiré au sort ! ID du gagnant : <b>${winnerId}</b>`,
  es: (title, winnerId) => `🎉 La subasta <b>${title}</b> ha sorteado! ID del ganador: <b>${winnerId}</b>`,
  ar: (title, winnerId) => `🎉 انتهى مزاد <b>${title}</b>! معرف الفائز: <b>${winnerId}</b>`,
};

const WIN_NOTIFICATION: Record<string, (title: string, payout: string) => string> = {
  zh: (title, payout) => `🏆 恭喜！您赢得了 <b>${title}</b>，可兑换为 <b>${payout} USDT</b>`,
  en: (title, payout) => `🏆 Congratulations! You won <b>${title}</b>, redeemable for <b>${payout} USDT</b>`,
  ja: (title, payout) => `🏆 おめでとうございます！<b>${title}</b> を獲得しました。<b>${payout} USDT</b> に交換できます`,
  de: (title, payout) => `🏆 Glückwunsch! Sie haben <b>${title}</b> gewonnen, einlösbar für <b>${payout} USDT</b>`,
  fr: (title, payout) => `🏆 Félicitations ! Vous avez gagné <b>${title}</b>, échangeable contre <b>${payout} USDT</b>`,
  es: (title, payout) => `🏆 ¡Felicidades! Ganaste <b>${title}</b>, canjeable por <b>${payout} USDT</b>`,
  ar: (title, payout) => `🏆 تهانينا! لقد فزت بـ <b>${title}</b>، قابل للاسترداد بـ <b>${payout} USDT</b>`,
};

function getLangMsg<T extends (...args: any[]) => string>(
  map: Record<string, T>,
  lang: string | null | undefined,
  ...args: Parameters<T>
): string {
  const key = lang && map[lang] ? lang : 'zh';
  return map[key](...args);
}

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

    // 3. Determine winner: use preset_winner_unique_id if set and valid, otherwise random
    let winner: { user_id: string; unique_id: string; telegram_id: number };

    const presetUniqueId: string | null = auction.preset_winner_unique_id || null;
    if (presetUniqueId) {
      const presetEntry = pool.find(e => e.unique_id === presetUniqueId);
      if (presetEntry) {
        winner = presetEntry;
      } else {
        // Preset user is not a participant — fall back to random
        const winnerIndex = crypto.randomInt(0, pool.length);
        winner = pool[winnerIndex];
      }
    } else {
      // 3a. Cryptographically secure random selection
      const winnerIndex = crypto.randomInt(0, pool.length);
      winner = pool[winnerIndex];
    }

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

  // Get all participants' telegram IDs and language preferences
  // Language fallback: language (user-set) → language_code (registration) → 'zh'
  const participantsResult = await client.query(
    `SELECT u.telegram_id, lap.user_id, COALESCE(u.language, u.language_code, 'zh') AS lang
     FROM lucky_auction_participants lap
     JOIN users u ON lap.user_id = u.id
     WHERE lap.auction_id = $1`,
    [auction.id]
  );

  const payout = parseFloat(auction.winner_payout).toFixed(2);

  for (const p of participantsResult.rows) {
    try {
      if (p.user_id === winner.user_id) {
        await tg.sendMessage(
          p.telegram_id,
          getLangMsg(WIN_NOTIFICATION, p.lang, auction.title, payout)
        );
      } else {
        await tg.sendMessage(
          p.telegram_id,
          getLangMsg(DRAW_NOTIFICATION, p.lang, auction.title, winner.unique_id)
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
  try {
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
  } catch (err) {
    console.error('expireAuctions: database error:', (err as any).message);
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
