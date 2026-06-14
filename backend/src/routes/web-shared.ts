import { query } from '../db';

export async function buildWebProfile(userId: string) {
  const result = await query(
    `SELECT id, unique_id, email, username, first_name, last_name, language_code,
            telegram_id, wallet_balance, nft_balance,
            COALESCE(red_packet_balance, red_packet_credits, 0) AS red_packet_balance,
            reward_balance, reward_unlock_traded, frozen_balance,
            total_recharged, total_withdrawn,
            invite_code, invited_by, account_status,
            email_verified, register_type
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) return null;
  const user = result.rows[0];

  let walletTipMessage = '';
  try {
    const tipResult = await query(`SELECT value FROM system_settings WHERE key = 'wallet_tip_message' LIMIT 1`);
    walletTipMessage = tipResult.rows[0]?.value || '';
  } catch {}

  let inviteCount = 0;
  try {
    const inviteCountResult = await query(`SELECT COUNT(*) AS cnt FROM users WHERE invited_by = $1`, [user.id]);
    inviteCount = parseInt(inviteCountResult.rows[0]?.cnt ?? '0', 10);
  } catch {}

  let invitedByUniqueId: string | null = null;
  if (user.invited_by) {
    try {
      const inviterResult = await query(`SELECT unique_id FROM users WHERE id = $1 LIMIT 1`, [user.invited_by]);
      invitedByUniqueId = inviterResult.rows[0]?.unique_id || null;
    } catch {}
  }

  let rewardTradeRatio = 1;
  try {
    const configResult = await query(`SELECT value FROM platform_config WHERE key = 'reward_trade_ratio'`);
    if (configResult.rows.length > 0) {
      rewardTradeRatio = parseFloat(configResult.rows[0].value) || 1;
    }
  } catch {}

  const rewardBalance = parseFloat(String(user.reward_balance ?? 0));
  const rewardTraded = parseFloat(String(user.reward_unlock_traded ?? 0));
  const rewardUnlockRequired = rewardBalance * rewardTradeRatio;
  const rewardUnlockProgress = rewardUnlockRequired > 0
    ? Math.round(Math.min(100, (rewardTraded / rewardUnlockRequired) * 100) * 100) / 100
    : 100;

  const walletBalance = parseFloat(String(user.wallet_balance ?? 0));
  const redPacketBalance = parseFloat(String(user.red_packet_balance ?? 0));

  return {
    id: user.id,
    unique_id: user.unique_id,
    telegram_id: user.telegram_id,
    email: user.email,
    email_verified: Boolean(user.email_verified),
    register_type: user.register_type || 'email',
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    language_code: user.language_code,
    invite_code: user.invite_code || user.unique_id,
    invited_by: invitedByUniqueId,
    invite_count: inviteCount,
    wallet_balance: walletBalance,
    reward_balance: rewardBalance,
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
