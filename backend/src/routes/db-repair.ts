import express from 'express';
import { query } from '../db';
import { authenticateAdmin, AuthRequest } from '../middleware/auth';
import { adminLimiter } from '../middleware/rateLimiter';
import { runMigrations } from '../db/migrate';

const router = express.Router();

// Apply rate limiting to all db-repair routes
router.use(adminLimiter);

/**
 * POST /api/admin/db-repair
 * One-shot repair endpoint to fix NULL unique_id and wallet_balance for all users.
 * Protected by admin authentication.
 * Safe to call multiple times (idempotent).
 */
router.post('/', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const results: Record<string, number> = {};

    // 1. Fix unique_id: generate 'U' + zero-padded telegram_id for users missing unique_id
    const uniqueIdResult = await query(`
      UPDATE users
      SET unique_id = 'U' || LPAD(CAST(telegram_id AS TEXT), 8, '0')
      WHERE (unique_id IS NULL OR unique_id = '')
        AND telegram_id IS NOT NULL
    `);
    results.unique_id_fixed = uniqueIdResult.rowCount ?? 0;

    // 2. Fix wallet_balance: copy from balance column where wallet_balance is NULL
    const walletBalanceResult = await query(`
      UPDATE users
      SET wallet_balance = COALESCE(balance, 0)
      WHERE wallet_balance IS NULL
    `);
    results.wallet_balance_fixed = walletBalanceResult.rowCount ?? 0;

    // 3. Fix red_packet_credits: default to 0 where NULL
    const redPacketResult = await query(`
      UPDATE users
      SET red_packet_credits = 0
      WHERE red_packet_credits IS NULL
    `);
    results.red_packet_credits_fixed = redPacketResult.rowCount ?? 0;

    // 4. Fix nft_balance: default to 0 where NULL
    const nftBalanceResult = await query(`
      UPDATE users
      SET nft_balance = 0
      WHERE nft_balance IS NULL
    `);
    results.nft_balance_fixed = nftBalanceResult.rowCount ?? 0;

    // 5. Report current state after repair
    const statsResult = await query(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(unique_id) FILTER (WHERE unique_id IS NOT NULL AND unique_id != '') AS users_with_unique_id,
        COUNT(*) FILTER (WHERE wallet_balance IS NULL) AS users_missing_wallet_balance,
        COUNT(*) FILTER (WHERE unique_id IS NULL OR unique_id = '') AS users_missing_unique_id
      FROM users
    `);

    res.json({
      success: true,
      message: 'Database repair completed successfully',
      fixed: results,
      stats: statsResult.rows[0],
    });
  } catch (error: any) {
    console.error('DB repair error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/db-repair/status
 * Check current data health without making any changes.
 */
router.get('/status', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE unique_id IS NULL OR unique_id = '') AS missing_unique_id,
        COUNT(*) FILTER (WHERE wallet_balance IS NULL) AS missing_wallet_balance,
        COUNT(*) FILTER (WHERE red_packet_credits IS NULL) AS missing_red_packet_credits,
        COUNT(*) FILTER (WHERE nft_balance IS NULL) AS missing_nft_balance
      FROM users
    `);

    const stats = result.rows[0];
    const needsRepair =
      parseInt(stats.missing_unique_id) > 0 ||
      parseInt(stats.missing_wallet_balance) > 0 ||
      parseInt(stats.missing_red_packet_credits) > 0 ||
      parseInt(stats.missing_nft_balance) > 0;

    res.json({
      success: true,
      needs_repair: needsRepair,
      stats,
    });
  } catch (error: any) {
    console.error('DB repair status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/db-repair/force-migrations
 * Delete _migrations records for all zzz_ files then re-run the full
 * migration pipeline so that safety-net files are applied immediately,
 * without requiring a server restart.
 * Protected by admin authentication.
 */
router.post('/force-migrations', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    // Remove _migrations records for zzz_ files so runMigrations() will
    // re-execute them even though they were previously marked as applied.
    const deleteResult = await query(
      `DELETE FROM _migrations WHERE filename LIKE $1`,
      ['zzz_%']
    );
    const deletedCount = deleteResult.rowCount ?? 0;

    // Re-run the full migration pipeline (zzz_ files will now always run;
    // regular files that are already recorded will be skipped automatically).
    await runMigrations();

    res.json({
      success: true,
      message: 'Force-migration completed successfully',
      zzz_records_cleared: deletedCount,
    });
  } catch (error: any) {
    console.error('Force-migration error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;