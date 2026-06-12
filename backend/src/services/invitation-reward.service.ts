/**
 * Invitation Reward Service
 * Handles L1 and L2 referral rewards for first trades
 */

/**
 * Trigger invitation rewards for a user's first trade.
 *
 * NOTE: Automatic reward dispatch is currently disabled because the recharge
 * detection logic has known issues.  Rewards are issued exclusively through the
 * admin panel's "手动下发奖励" (manual grant) button, which calls the
 * POST /users/:id/invitees/:inviteeId/grant-reward endpoint.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function triggerFirstTradeReward(_client: any, _userId: string): Promise<void> {
  return;
}
