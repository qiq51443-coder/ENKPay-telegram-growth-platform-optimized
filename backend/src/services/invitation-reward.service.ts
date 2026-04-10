/**
 * Invitation Reward Service
 * Handles L1 and L2 referral rewards for first trades
 */

/**
 * Read invite reward configuration from system_settings.
 * Falls back to safe defaults if the table/rows don't exist yet.
 */
async function getInviteRewardConfig(client: any): Promise<{ amount: number; enabled: boolean }> {
  try {
    const result = await client.query(
      `SELECT key, value FROM system_settings WHERE key IN ('invite_reward_amount', 'invite_reward_enabled')`
    );
    let amount = 2.00;
    let enabled = true;
    for (const row of result.rows) {
      if (row.key === 'invite_reward_amount') {
        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        amount = parseFloat(String(parsed)) || 2.00;
      }
      if (row.key === 'invite_reward_enabled') {
        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        enabled = parsed === true || parsed === 'true';
      }
    }
    return { amount, enabled };
  } catch {
    return { amount: 2.00, enabled: true };
  }
}

/**
 * Trigger invitation rewards for a user's first trade
 * Awards 5 USDT to L1 referrer and 5 USDT to L2 referrer
 * @param client - Database transaction client
 * @param userId - The user who made their first trade
 */
export async function triggerFirstTradeReward(client: any, userId: string) {
  // Load reward config from system_settings
  const { amount: TRADE_REWARD, enabled } = await getInviteRewardConfig(client);

  // If invite rewards are disabled, do nothing
  if (!enabled) {
    return;
  }

  // Check for L1 referrer
  const invitationResult = await client.query(
    `SELECT inviter_id, trade_reward_paid, invitee_first_trade
     FROM invitations 
     WHERE invitee_id = $1`,
    [userId]
  );

  if (invitationResult.rows.length === 0) {
    return; // No referrer
  }

  const invitation = invitationResult.rows[0];
  
  // Check if this is the first trade and reward not paid
  if (invitation.invitee_first_trade || invitation.trade_reward_paid || !invitation.inviter_id) {
    return; // Already rewarded or no referrer
  }

  // Give trade reward to L1 referrer
  await client.query(
    'UPDATE users SET reward_balance = reward_balance + $1 WHERE id = $2',
    [TRADE_REWARD, invitation.inviter_id]
  );

  // Update invitation record
  await client.query(
    `UPDATE invitations 
     SET invitee_first_trade = CURRENT_TIMESTAMP,
         trade_reward_paid = true
     WHERE invitee_id = $1`,
    [userId]
  );

  // Record L1 referrer transaction
  const l1BalanceResult = await client.query(
    'SELECT reward_balance FROM users WHERE id = $1',
    [invitation.inviter_id]
  );
  
  await client.query(
    `INSERT INTO transactions (user_id, type, amount, balance_after, description, related_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      invitation.inviter_id,
      'referral_reward',
      TRADE_REWARD,
      l1BalanceResult.rows[0].reward_balance,
      'First trade reward from referral',
      userId
    ]
  );

  // Check for L2 referrer
  const l2InvitationResult = await client.query(
    `SELECT inviter_id, trade_reward_paid_l2
     FROM invitations 
     WHERE invitee_id = $1`,
    [invitation.inviter_id]
  );

  if (l2InvitationResult.rows.length === 0) {
    return; // No L2 referrer
  }

  const l2Invitation = l2InvitationResult.rows[0];
  
  if (l2Invitation.trade_reward_paid_l2 || !l2Invitation.inviter_id) {
    return; // Already rewarded or no L2 referrer
  }

  // Give L2 trade reward
  await client.query(
    'UPDATE users SET reward_balance = reward_balance + $1 WHERE id = $2',
    [TRADE_REWARD, l2Invitation.inviter_id]
  );

  // Update L2 invitation record
  await client.query(
    `UPDATE invitations 
     SET trade_reward_paid_l2 = true
     WHERE invitee_id = $1`,
    [invitation.inviter_id]
  );

  // Record L2 referrer transaction
  const l2BalanceResult = await client.query(
    'SELECT reward_balance FROM users WHERE id = $1',
    [l2Invitation.inviter_id]
  );
  
  await client.query(
    `INSERT INTO transactions (user_id, type, amount, balance_after, description, related_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      l2Invitation.inviter_id,
      'referral_reward',
      TRADE_REWARD,
      l2BalanceResult.rows[0].reward_balance,
      'L2 first trade reward from referral',
      userId
    ]
  );
}
