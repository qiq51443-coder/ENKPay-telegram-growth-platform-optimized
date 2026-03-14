import express from 'express';
import { query } from '../db';
import { authenticateMiniApp, MiniAppAuthRequest } from '../middleware/miniapp-auth';
import { generateUniqueIdCandidate, generateUniqueUserId } from '../utils/uniqueId';

const router = express.Router();

/**
 * GET /api/miniapp/profile
 * Get current user's profile (authenticated via Telegram initData)
 */
router.get('/profile', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    const userProfile = await buildCanonicalProfile(telegramId);
    if (!userProfile) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user: userProfile });
  } catch (error: any) {
    console.error('Miniapp profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/miniapp/transactions
 * Get current user's transaction history from transfer_records, deposit_records,
 * withdrawal_records, and trading_orders (UNION query).
 */
router.get('/transactions', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    // Use canonical user id for consistent cross-bot query (ORDER BY + LIMIT 1 prevents
    // returning a random row when legacy duplicate telegram_id records exist)
    const userResult = await query(
      `SELECT id FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [telegramId]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;

    const parsedLimit = parseInt(String(req.query.limit ?? '50'), 10);
    const limitNum = isNaN(parsedLimit) || parsedLimit <= 0 ? 50 : Math.min(parsedLimit, 200);

    const result = await query(
      `SELECT id, type, amount, status, created_at, description
       FROM (
         -- Incoming transfers
         SELECT id::text, 'transfer_in' AS type, amount::numeric, status,
                created_at, NULL AS description
         FROM transfer_records
         WHERE to_user_id = $1

         UNION ALL

         -- Outgoing transfers
         SELECT id::text, 'transfer_out' AS type, amount::numeric, status,
                created_at, NULL AS description
         FROM transfer_records
         WHERE from_user_id = $1

         UNION ALL

         -- Deposits
         SELECT id::text, 'deposit' AS type, amount::numeric, status,
                created_at, tx_hash AS description
         FROM deposit_records
         WHERE user_id = $1

         UNION ALL

         -- Withdrawals
         SELECT id::text, 'withdrawal' AS type, amount::numeric, status,
                created_at, to_address AS description
         FROM withdrawal_records
         WHERE user_id = $1

         UNION ALL

         -- Trading orders (instant trades)
         SELECT id::text,
                CASE WHEN profit >= 0 THEN 'trade_win' ELSE 'trade_loss' END AS type,
                amount::numeric, status,
                created_at, pair_id::text AS description
         FROM trading_orders
         WHERE user_id = $1
       ) AS combined
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limitNum]
    );

    res.json({ success: true, transactions: result.rows });
  } catch (error: any) {
    console.error('Miniapp transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/miniapp/announcements
 * Get public announcements (optionally filtered by show_on_app_launch)
 */
router.get('/announcements', async (req, res) => {
  try {
    const { show_on_app_launch } = req.query;

    let queryText = `SELECT id, title, content, images, is_pinned, show_on_app_launch, created_at
                     FROM announcements WHERE status = 'sent'`;
    const params: any[] = [];

    if (show_on_app_launch === 'true') {
      queryText += ` AND show_on_app_launch = true`;
    }

    queryText += ` ORDER BY is_pinned DESC, created_at DESC LIMIT 20`;

    const result = await query(queryText, params);
    res.json({ success: true, announcements: result.rows });
  } catch (error: any) {
    console.error('Miniapp announcements error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Resolve the canonical user ID for a given Telegram ID.
 * ORDER BY created_at ASC LIMIT 1 ensures the earliest (canonical) record is returned
 * even if legacy duplicate telegram_id rows exist before migration 020 was applied.
 */
async function getCanonicalUserId(telegramId: number): Promise<string | null> {
  const result = await query(
    `SELECT id FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [telegramId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].id;
}

/**
 * POST /api/miniapp/language
 * Update user's language preference (targets canonical record)
 */
router.post('/language', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });
    const { language_code, language } = req.body;
    const lang = language_code || language;
    if (!lang) return res.status(400).json({ error: 'language_code is required' });

    const canonicalId = await getCanonicalUserId(telegramId);
    if (!canonicalId) return res.status(404).json({ error: 'User not found' });

    await query(
      `UPDATE users SET language_code = $1 WHERE id = $2`,
      [lang, canonicalId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Miniapp language error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/miniapp/language
 * Update user's language preference (alias for POST, supports both methods)
 */
router.put('/language', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });
    const { language_code, language } = req.body;
    const lang = language_code || language;
    if (!lang) return res.status(400).json({ error: 'language_code is required' });

    const canonicalId = await getCanonicalUserId(telegramId);
    if (!canonicalId) return res.status(404).json({ error: 'User not found' });

    await query(
      `UPDATE users SET language_code = $1 WHERE id = $2`,
      [lang, canonicalId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Miniapp language PUT error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/miniapp/sync-user
 * Sync Telegram user info (first_name, username, language_code) to the canonical DB record.
 * Targets the earliest-created user record to stay consistent with /profile reads.
 */
router.post('/sync-user', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ error: 'Unauthorized' });

    const { first_name, username, language_code } = req.body;

    const canonicalId = await getCanonicalUserId(telegramId);
    if (!canonicalId) return res.status(404).json({ error: 'User not found' });

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (first_name !== undefined) { updates.push(`first_name = $${idx++}`); values.push(first_name); }
    if (username !== undefined) { updates.push(`username = $${idx++}`); values.push(username); }
    if (language_code !== undefined) { updates.push(`language_code = $${idx++}`); values.push(language_code); }

    if (updates.length > 0) {
      values.push(canonicalId);
      await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      );
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Miniapp sync-user error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Shared helper: build the canonical profile response object for a given telegramId.
 * Used by both /profile and /auth-sync so they return identical data shapes.
 */
async function buildCanonicalProfile(telegramId: number) {
  const result = await query(
    `SELECT id, unique_id, robot_user_id, username, first_name, last_name, language_code,
            balance, telegram_id, wallet_balance, nft_balance,
            COALESCE(red_packet_credits, 0) AS red_packet_balance,
            reward_balance, reward_unlock_traded, frozen_balance,
            total_recharged, total_withdrawn,
            invite_code, invited_by,
            account_status
     FROM users WHERE telegram_id = $1
     ORDER BY created_at ASC LIMIT 1`,
    [telegramId]
  );
  if (result.rows.length === 0) return null;
  const user = result.rows[0];

  // Fetch wallet_tip_message from system settings
  let walletTipMessage = '';
  try {
    const tipResult = await query(
      `SELECT value FROM system_settings WHERE key = 'wallet_tip_message' LIMIT 1`
    );
    walletTipMessage = tipResult.rows[0]?.value || '';
  } catch {/* non-critical */}

  // Count direct invites
  let inviteCount = 0;
  try {
    const inviteCountResult = await query(
      `SELECT COUNT(*) AS cnt FROM users WHERE invited_by = $1`,
      [user.id]
    );
    inviteCount = parseInt(inviteCountResult.rows[0]?.cnt ?? '0', 10);
  } catch {/* non-critical */}

  // Resolve inviter unique_id for display
  let invitedByUniqueId: string | null = null;
  if (user.invited_by) {
    try {
      const inviterResult = await query(
        `SELECT unique_id FROM users WHERE id = $1 LIMIT 1`,
        [user.invited_by]
      );
      invitedByUniqueId = inviterResult.rows[0]?.unique_id || null;
    } catch {/* non-critical */}
  }

  // Calculate reward unlock progress
  let rewardTradeRatio = 1.0;
  try {
    const configResult = await query(
      `SELECT value FROM platform_config WHERE key = 'reward_trade_ratio'`
    );
    if (configResult.rows.length > 0) {
      rewardTradeRatio = parseFloat(configResult.rows[0].value) || 1.0;
    }
  } catch {/* platform_config table may not exist — use default ratio */}
  const rewardBal = parseFloat(String(user.reward_balance ?? 0));
  const rewardTraded = parseFloat(String(user.reward_unlock_traded ?? 0));
  const rewardUnlockRequired = rewardBal * rewardTradeRatio;
  const rewardUnlockProgress = rewardUnlockRequired > 0
    ? Math.round(Math.min(100, (rewardTraded / rewardUnlockRequired) * 100) * 100) / 100
    : 100;

  const walletBalance = parseFloat(String(user.wallet_balance ?? 0));
  const redPacketBalance = parseFloat(String(user.red_packet_balance ?? 0));

  return {
    // Internal DB identifier — stable reference for trading and other server-side operations
    id: user.id,
    // Display / user-facing identifier (falls back through robot_user_id → telegram_id)
    unique_id: user.unique_id || user.robot_user_id || String(user.telegram_id),
    telegram_id: user.telegram_id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    language_code: user.language_code,
    invite_code: user.invite_code || user.unique_id,
    invited_by: invitedByUniqueId,
    invite_count: inviteCount,
    // balance kept for backward compatibility (equals wallet_balance)
    balance: walletBalance,
    wallet_balance: walletBalance,
    reward_balance: rewardBal,
    nft_balance: parseFloat(String(user.nft_balance ?? 0)),
    frozen_balance: parseFloat(String(user.frozen_balance ?? 0)),
    red_packet_balance: redPacketBalance,
    total_recharged: parseFloat(String(user.total_recharged ?? 0)),
    total_withdrawn: parseFloat(String(user.total_withdrawn ?? 0)),
    reward_unlock_progress: rewardUnlockProgress,
    reward_unlock_required: parseFloat(rewardUnlockRequired.toFixed(2)),
    account_status: user.account_status,
    wallet_tip_message: walletTipMessage,
    // tradable_balance: combined amount available for instant trading
    // Business rule: wallet_balance + red_packet_balance may both be used for trading
    tradable_balance: parseFloat((walletBalance + redPacketBalance).toFixed(2)),
  };
}

/**
 * POST /api/miniapp/auth-sync
 * One-shot: validate Telegram initData, upsert the user record, and return the canonical profile.
 * Uses a two-step check+insert/update pattern for compatibility with databases where the
 * UNIQUE (telegram_id) constraint from migration 020 may not yet be applied.
 */
router.post('/auth-sync', authenticateMiniApp, async (req: MiniAppAuthRequest, res) => {
  try {
    const tgUser = req.telegramUser;
    if (!tgUser?.id) return res.status(401).json({ error: 'Unauthorized' });

    const telegramId = tgUser.id;
    const firstName = tgUser.first_name || '';
    const username = tgUser.username || null;
    const languageCode = tgUser.language_code || 'zh';

    // Step 1: check whether a canonical record already exists
    const existing = await query(
      `SELECT id FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [telegramId]
    );

    if (existing.rows.length > 0) {
      // Step 2a: update the existing canonical record
      await query(
        `UPDATE users
         SET first_name    = $2,
             username      = COALESCE($3, username),
             language_code = $4,
             updated_at    = NOW()
         WHERE id = $1`,
        [existing.rows[0].id, firstName, username, languageCode]
      );
    } else {
      // Step 2b: create a brand-new user record with all required fields
      let newUniqueId: string;
      try {
        newUniqueId = await generateUniqueUserId();
      } catch {
        newUniqueId = generateUniqueIdCandidate();
      }

      // Collision guard: retry up to 10 times if the generated id already exists
      let uniqueIdReady = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const conflict = await query(
          `SELECT id FROM users WHERE unique_id = $1 LIMIT 1`,
          [newUniqueId]
        );
        if (conflict.rows.length === 0) { uniqueIdReady = true; break; }
        newUniqueId = generateUniqueIdCandidate();
      }
      if (!uniqueIdReady) {
        throw new Error('Failed to generate a unique user ID after 10 attempts');
      }

      await query(
        `INSERT INTO users (telegram_id, first_name, username, language_code,
                            wallet_balance, reward_balance, frozen_balance,
                            red_packet_credits, unique_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 0, 0, 0, 3, $5, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [telegramId, firstName, username, languageCode, newUniqueId]
      );
    }

    const userProfile = await buildCanonicalProfile(telegramId);
    if (!userProfile) {
      return res.status(404).json({ error: 'User not found after upsert' });
    }

    res.json({ success: true, user: userProfile });
  } catch (error: any) {
    console.error('Miniapp auth-sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
