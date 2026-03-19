/**
 * Shared helpers used by both miniapp.ts and miniapp-bot-token.ts.
 * Extracted to avoid circular dependencies and code duplication.
 */
import { query } from '../db';
import { generateUniqueIdCandidate, generateUniqueUserId } from '../utils/uniqueId';

/** Default values for new users created without Telegram initData context. */
const DEFAULT_FIRST_NAME = '';
const DEFAULT_LANGUAGE_CODE = 'zh';
const DEFAULT_RED_PACKET_CREDITS = 3;

/**
 * Build the canonical profile response object for a given telegramId.
 * Used by /profile, /auth-sync, and /bot-token/exchange so they all return identical shapes.
 */
export async function buildCanonicalProfile(telegramId: number) {
  const result = await query(
    `SELECT id, unique_id, robot_user_id, username, first_name, last_name, language_code,
            balance, telegram_id, wallet_balance, nft_balance,
            COALESCE(red_packet_balance, red_packet_credits, 0) AS red_packet_balance,
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
    id: user.id,
    unique_id: user.unique_id || user.robot_user_id || String(user.telegram_id),
    telegram_id: user.telegram_id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    language_code: user.language_code,
    invite_code: user.invite_code || user.unique_id,
    invited_by: invitedByUniqueId,
    invite_count: inviteCount,
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
    account_status: user.account_status ?? 'active',
    wallet_tip_message: walletTipMessage,
    tradable_balance: parseFloat((walletBalance + redPacketBalance).toFixed(2)),
  };
}

/**
 * Ensure a user record exists for the given telegramId.
 * If no record exists, creates one with minimal defaults.
 * This mirrors the upsert logic in POST /api/miniapp/auth-sync.
 */
export async function upsertUserFromTelegramId(telegramId: number): Promise<void> {
  const existing = await query(
    `SELECT id FROM users WHERE telegram_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [telegramId]
  );

  if (existing.rows.length > 0) {
    // Update last_active_at and backfill nullable columns
    await query(
      `UPDATE users
       SET updated_at         = NOW(),
           last_active_at     = NOW(),
           unique_id          = CASE WHEN (unique_id IS NULL OR unique_id = '')
                                  THEN 'U' || LPAD(CAST($2 AS TEXT), 8, '0')
                                  ELSE unique_id END,
           wallet_balance     = CASE WHEN wallet_balance IS NULL
                                  THEN COALESCE(balance, 0)
                                  ELSE wallet_balance END,
           red_packet_balance = CASE WHEN red_packet_balance IS NULL
                                  THEN COALESCE(red_packet_credits, 0)
                                  ELSE red_packet_balance END,
           red_packet_credits = CASE WHEN red_packet_credits IS NULL
                                  THEN 0
                                  ELSE red_packet_credits END,
           nft_balance        = CASE WHEN nft_balance IS NULL
                                  THEN 0
                                  ELSE nft_balance END
       WHERE id = $1`,
      [existing.rows[0].id, telegramId]
    );
    return;
  }

  // Create a brand-new user record with all required fields
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
     VALUES ($1, $2, NULL, $3, 0, 0, 0, $4, $5, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [telegramId, DEFAULT_FIRST_NAME, DEFAULT_LANGUAGE_CODE, DEFAULT_RED_PACKET_CREDITS, newUniqueId]
  );
}
