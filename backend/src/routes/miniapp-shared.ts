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

/** Optional real user info provided by the Bot during pre-registration. */
export interface TelegramUserInfo {
  firstName?: string;
  username?: string;
  languageCode?: string;
}

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
 * Atomically upsert a user record for the given telegramId.
 * Uses INSERT ... ON CONFLICT (telegram_id) DO UPDATE SET so the operation is
 * race-free and relies on the UNIQUE (telegram_id) constraint from migration 020/021.
 *
 * On INSERT: a new record is created with all required fields.
 * On CONFLICT: the existing canonical record is updated in-place — profile fields
 *   are refreshed (if non-empty values are supplied) and any NULL balance columns
 *   are backfilled from their legacy aliases.
 */
export async function upsertUserFromTelegramId(
  telegramId: number,
  userInfo?: TelegramUserInfo
): Promise<void> {
  // Generate a candidate unique_id upfront (only written on the INSERT path;
  // the DO UPDATE clause preserves the existing value when the row already exists).
  let newUniqueId: string;
  try {
    newUniqueId = await generateUniqueUserId();
  } catch {
    newUniqueId = generateUniqueIdCandidate();
  }

  const firstName = userInfo?.firstName || DEFAULT_FIRST_NAME;
  const username = userInfo?.username || null;
  const languageCode = userInfo?.languageCode || DEFAULT_LANGUAGE_CODE;

  await query(
    `INSERT INTO users (
       telegram_id, first_name, username, language_code,
       wallet_balance, reward_balance, frozen_balance,
       red_packet_credits, unique_id, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, 0, 0, 0, $5, $6, NOW(), NOW())
     ON CONFLICT (telegram_id) DO UPDATE SET
       updated_at         = NOW(),
       last_active_at     = NOW(),
       first_name         = CASE WHEN EXCLUDED.first_name <> '' THEN EXCLUDED.first_name ELSE users.first_name END,
       username           = COALESCE(EXCLUDED.username, users.username),
       language_code      = CASE WHEN EXCLUDED.language_code <> '' THEN EXCLUDED.language_code ELSE users.language_code END,
       unique_id          = CASE WHEN (users.unique_id IS NULL OR users.unique_id = '')
                              THEN EXCLUDED.unique_id
                              ELSE users.unique_id END,
       wallet_balance     = CASE WHEN users.wallet_balance IS NULL
                              THEN COALESCE(users.balance, 0)
                              ELSE users.wallet_balance END,
       red_packet_balance = CASE WHEN users.red_packet_balance IS NULL
                              THEN COALESCE(users.red_packet_credits, 0)
                              ELSE users.red_packet_balance END,
       red_packet_credits = CASE WHEN users.red_packet_credits IS NULL THEN 0 ELSE users.red_packet_credits END,
       nft_balance        = CASE WHEN users.nft_balance IS NULL THEN 0 ELSE users.nft_balance END`,
    [telegramId, firstName, username, languageCode, DEFAULT_RED_PACKET_CREDITS, newUniqueId]
  );
}
