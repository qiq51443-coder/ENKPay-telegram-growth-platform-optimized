import { query, transaction } from '../db';

const INTERVAL_MS = 60 * 60 * 1000; // Run every hour

/**
 * Expire red packet balances whose balance_expires_at has passed.
 * Deducts the claimed amount from the user's reward_balance.
 */
async function processExpiredRedPacketBalances(): Promise<void> {
  try {
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
          // Deduct amount from reward_balance (floor at 0)
          await client.query(
            `UPDATE users
             SET reward_balance = GREATEST(reward_balance - $1, 0)
             WHERE id = $2`,
            [claim.amount, claim.user_id]
          );

          // Mark claim as processed so we don't process it again
          await client.query(
            `UPDATE red_packet_claims SET balance_expiry_processed = true WHERE id = $1`,
            [claim.id]
          );
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
