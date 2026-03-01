import { query } from '../db';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Cleanup job that runs hourly:
 * 1. Expire red_packet_claims whose balance_expires_at has passed (deduct from reward_balance)
 * 2. Expire announcements whose expires_at has passed
 * 3. Expire red_packets whose expires_at has passed
 */
async function runCleanup(): Promise<void> {
  try {
    // 1. Expire red packet claim balances
    const expiredClaims = await query(
      `SELECT rpc.id, rpc.user_id, rpc.amount
       FROM red_packet_claims rpc
       WHERE rpc.balance_expires_at IS NOT NULL
         AND rpc.balance_expires_at < NOW()
         AND rpc.balance_expired = false`,
      []
    );

    for (const claim of expiredClaims.rows) {
      try {
        await query(
          `UPDATE users SET reward_balance = GREATEST(0, reward_balance - $1) WHERE id = $2`,
          [claim.amount, claim.user_id]
        );
        await query(
          `UPDATE red_packet_claims SET balance_expired = true WHERE id = $1`,
          [claim.id]
        );
      } catch (err) {
        console.error(`Cleanup: failed to expire claim ${claim.id}:`, err);
      }
    }

    if (expiredClaims.rows.length > 0) {
      console.log(`Cleanup: expired ${expiredClaims.rows.length} red packet claim balances`);
    }

    // 2. Expire announcements
    const expiredAnnouncements = await query(
      `UPDATE announcements
       SET status = 'expired'
       WHERE expires_at IS NOT NULL AND expires_at < NOW() AND status != 'expired'
       RETURNING id`,
      []
    );

    if (expiredAnnouncements.rows.length > 0) {
      console.log(`Cleanup: expired ${expiredAnnouncements.rows.length} announcements`);
    }

    // 3. Expire red packets
    const expiredRedPackets = await query(
      `UPDATE red_packets
       SET status = 'expired'
       WHERE expires_at IS NOT NULL AND expires_at < NOW() AND status = 'active'
       RETURNING id`,
      []
    );

    if (expiredRedPackets.rows.length > 0) {
      console.log(`Cleanup: expired ${expiredRedPackets.rows.length} red packets`);
    }
  } catch (error) {
    console.error('Cleanup job error:', error);
  }
}

export function startCleanupJob(): void {
  console.log('✓ Cleanup job started (runs every hour)');
  // Run immediately on startup, then every hour
  runCleanup();
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}
