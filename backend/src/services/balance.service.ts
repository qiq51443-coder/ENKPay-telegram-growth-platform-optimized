import { query } from '../db';

interface UserBalance {
  wallet_balance: number;
  reward_balance: number;
  frozen_balance: number;
  total_recharged: number;
  total_withdrawn: number;
  total_traded: number;
  total_transferred_out: number;
  total_transferred_in: number;
  reward_unlock_traded: number;
  is_first_trade_done: boolean;
  available_for_transfer: number;
  available_for_withdrawal: number;
  reward_unlock_progress: number; // Percentage (0-100)
  reward_unlock_required: number; // Required trading volume to unlock all rewards
}

/**
 * Get user balance details with unlock progress
 */
export async function getUserBalance(userId: number): Promise<UserBalance> {
  const result = await query(
    `SELECT 
      wallet_balance,
      reward_balance,
      frozen_balance,
      total_recharged,
      total_withdrawn,
      total_traded,
      total_transferred_out,
      total_transferred_in,
      reward_unlock_traded,
      is_first_trade_done
    FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = result.rows[0];

  // Get reward_trade_ratio and require_deposit_before_withdraw from platform_config
  const configResult = await query(
    `SELECT key, value FROM platform_config WHERE key IN ('reward_trade_ratio', 'require_deposit_before_withdraw')`
  );
  const rewardTradeRatioRow = configResult.rows.find((r: { key: string; value: string }) => r.key === 'reward_trade_ratio');
  const rewardTradeRatio = rewardTradeRatioRow ? parseFloat(rewardTradeRatioRow.value) : 1.0;
  const requireDepositRow = configResult.rows.find((r: { key: string; value: string }) => r.key === 'require_deposit_before_withdraw');
  // Default false: admin-credited balances are always withdrawable unless explicitly configured
  const requireDepositBeforeWithdraw = requireDepositRow
    ? (requireDepositRow.value === 'true' || requireDepositRow.value === '1')
    : false;

  // Calculate required trading volume to unlock all rewards
  const rewardUnlockRequired = user.reward_balance * rewardTradeRatio;

  // Calculate unlock progress percentage
  const rewardUnlockProgress = rewardUnlockRequired > 0
    ? Math.min(100, (user.reward_unlock_traded / rewardUnlockRequired) * 100)
    : 100;

  // wallet_balance can be transferred and withdrawn
  // reward_balance cannot be transferred or withdrawn until trading requirement is met
  const availableForTransfer = user.wallet_balance;

  // For withdrawal, optionally enforce:
  // 1. Total recharged >= 10 USDT
  // 2. Reward unlock progress >= 100%
  // Both checks are gated by the require_deposit_before_withdraw platform config key
  // (default false) so that admin-credited balances are always withdrawable.
  let availableForWithdrawal = user.wallet_balance;
  
  if (requireDepositBeforeWithdraw) {
    const minDeposit = 10; // From platform_config: deposit_min_amount
    if (user.total_recharged < minDeposit) {
      availableForWithdrawal = 0;
    } else if (rewardUnlockProgress < 100) {
      // If rewards not fully unlocked, cannot withdraw
      availableForWithdrawal = 0;
    }
  }

  return {
    wallet_balance: parseFloat(user.wallet_balance) || 0,
    reward_balance: parseFloat(user.reward_balance) || 0,
    frozen_balance: parseFloat(user.frozen_balance) || 0,
    total_recharged: parseFloat(user.total_recharged) || 0,
    total_withdrawn: parseFloat(user.total_withdrawn) || 0,
    total_traded: parseFloat(user.total_traded) || 0,
    total_transferred_out: parseFloat(user.total_transferred_out) || 0,
    total_transferred_in: parseFloat(user.total_transferred_in) || 0,
    reward_unlock_traded: parseFloat(user.reward_unlock_traded) || 0,
    is_first_trade_done: user.is_first_trade_done || false,
    available_for_transfer: parseFloat(availableForTransfer) || 0,
    available_for_withdrawal: parseFloat(availableForWithdrawal) || 0,
    reward_unlock_progress: parseFloat(rewardUnlockProgress.toFixed(2)),
    reward_unlock_required: parseFloat(rewardUnlockRequired.toFixed(2)),
  };
}

/**
 * Validate transfer request
 * Rules:
 * - Minimum 10 USDT
 * - Fee 2%
 * - Only wallet_balance can be transferred (not reward_balance)
 * - Must have completed first trade
 */
export async function validateTransfer(
  fromUserId: number,
  amount: number
): Promise<{ valid: boolean; error?: string }> {
  // Get platform config
  const configResult = await query(
    `SELECT key, value FROM platform_config WHERE key IN ('transfer_min_amount', 'transfer_fee_rate', 'require_trade_before_transfer')`
  );
  const config: Record<string, number> = {};
  configResult.rows.forEach((row: { key: string; value: string }) => {
    config[row.key] = parseFloat(row.value);
  });
  const requireTradeRow = configResult.rows.find((row: { key: string; value: string }) => row.key === 'require_trade_before_transfer');
  // Default false: admin-credited users are not blocked from transferring
  const requireTrade = requireTradeRow
    ? (requireTradeRow.value === 'true' || requireTradeRow.value === '1')
    : false;

  const minAmount = config.transfer_min_amount || 10;
  const feeRate = config.transfer_fee_rate || 0.02;

  // Check minimum amount
  if (amount < minAmount) {
    return { valid: false, error: `Minimum transfer amount is ${minAmount} USDT` };
  }

  // Get user balance
  const balance = await getUserBalance(fromUserId);

  // Check if first trade is done (only enforced when require_trade_before_transfer = true)
  if (requireTrade && !balance.is_first_trade_done) {
    return { valid: false, error: 'You must complete at least one trade before transferring' };
  }

  // Calculate total cost including fee
  const fee = amount * feeRate;
  const totalCost = amount + fee;

  // Check if user has enough available balance (only wallet_balance)
  if (balance.available_for_transfer < totalCost) {
    return {
      valid: false,
      error: `Insufficient balance. Available: ${balance.available_for_transfer} USDT, Required: ${totalCost} USDT (including ${fee.toFixed(2)} USDT fee)`,
    };
  }

  return { valid: true };
}

/**
 * Validate withdrawal request
 * Rules:
 * - Minimum 10 USDT
 * - Fee 2%
 * - Total recharged must be >= 10 USDT
 * - Reward unlock progress must be 100%
 */
export async function validateWithdrawal(
  userId: number,
  amount: number
): Promise<{ valid: boolean; error?: string }> {
  // Get platform config
  const configResult = await query(
    `SELECT key, value FROM platform_config WHERE key IN ('withdraw_min_amount', 'withdraw_fee_rate', 'deposit_min_amount', 'require_deposit_before_withdraw')`
  );
  const config: Record<string, number> = {};
  configResult.rows.forEach((row: { key: string; value: string }) => {
    config[row.key] = parseFloat(row.value);
  });
  const requireDepositRow = configResult.rows.find((row: { key: string; value: string }) => row.key === 'require_deposit_before_withdraw');
  // Default false: admin-credited balances are always withdrawable unless explicitly configured
  const requireDeposit = requireDepositRow
    ? (requireDepositRow.value === 'true' || requireDepositRow.value === '1')
    : false;

  const minAmount = config.withdraw_min_amount || 10;
  const feeRate = config.withdraw_fee_rate || 0.02;
  const minDeposit = config.deposit_min_amount || 10;

  // Check minimum amount
  if (amount < minAmount) {
    return { valid: false, error: `Minimum withdrawal amount is ${minAmount} USDT` };
  }

  // Get user balance
  const balance = await getUserBalance(userId);

  // Check if total recharged >= minimum deposit (only enforced when require_deposit_before_withdraw = true)
  if (requireDeposit && balance.total_recharged < minDeposit) {
    return {
      valid: false,
      error: `You must deposit at least ${minDeposit} USDT before making a withdrawal`,
    };
  }

  // Check reward unlock progress (only enforced when require_deposit_before_withdraw = true)
  if (requireDeposit && balance.reward_unlock_progress < 100) {
    return {
      valid: false,
      error: `You must complete trading volume to unlock rewards before withdrawal. Progress: ${balance.reward_unlock_progress}% (Required: ${balance.reward_unlock_required} USDT)`,
    };
  }

  // Calculate total cost including fee
  const fee = amount * feeRate;
  const totalCost = amount + fee;

  // Check if user has enough available balance
  if (balance.available_for_withdrawal < totalCost) {
    return {
      valid: false,
      error: `Insufficient balance. Available: ${balance.available_for_withdrawal} USDT, Required: ${totalCost} USDT (including ${fee.toFixed(2)} USDT fee)`,
    };
  }

  return { valid: true };
}

/**
 * Get platform configuration value
 */
export async function getPlatformConfig(key: string): Promise<any> {
  const result = await query(
    `SELECT value FROM platform_config WHERE key = $1`,
    [key]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  try {
    return JSON.parse(result.rows[0].value);
  } catch (error) {
    // If JSON parsing fails, return raw value
    return result.rows[0].value;
  }
}

/**
 * Check and auto-unlock reward balance if trading volume requirement is met.
 * Call this after every trade settlement.
 *
 * Unlock rule:
 *   reward_unlock_traded >= reward_balance * reward_trade_ratio
 * On unlock: reward_balance is transferred into wallet_balance and both
 * reward_balance and reward_unlock_traded are reset to 0.
 *
 * Returns the unlocked amount (0 if nothing was unlocked).
 */
export async function autoUnlockRewardBalance(userId: string | number): Promise<number> {
  // Fetch user reward fields
  const userResult = await query(
    `SELECT reward_balance, reward_unlock_traded FROM users WHERE id = $1`,
    [String(userId)]
  );
  if (userResult.rows.length === 0) return 0;

  const rewardBalance = parseFloat(String(userResult.rows[0].reward_balance ?? 0));
  const rewardUnlockTraded = parseFloat(String(userResult.rows[0].reward_unlock_traded ?? 0));

  if (rewardBalance <= 0) return 0;

  // Get ratio from platform config (default 1.0)
  const configResult = await query(
    `SELECT value FROM platform_config WHERE key = 'reward_trade_ratio'`
  );
  const rewardTradeRatio = configResult.rows.length > 0
    ? parseFloat(configResult.rows[0].value) : 1.0;

  const required = rewardBalance * rewardTradeRatio;
  if (rewardUnlockTraded < required) return 0;

  // Unlock: move reward_balance into wallet_balance
  await query(
    `UPDATE users
     SET wallet_balance = COALESCE(wallet_balance, 0) + reward_balance,
         reward_balance = 0,
         reward_unlock_traded = 0
     WHERE id = $1`,
    [String(userId)]
  );

  return rewardBalance;
}

/**
 * Check and auto-unlock red_packet_balance if wagering requirement is met.
 * On unlock: red_packet_balance moves to wallet_balance, red_packet_wagered resets to 0.
 *
 * Returns the unlocked amount (0 if nothing was unlocked).
 */
export async function autoUnlockRedPacketBalance(userId: string): Promise<number> {
  const userResult = await query(
    `SELECT red_packet_balance, red_packet_wagered FROM users WHERE id = $1`,
    [userId]
  );
  if (userResult.rows.length === 0) return 0;

  const rpBalance = parseFloat(String(userResult.rows[0].red_packet_balance ?? 0));
  const rpWagered = parseFloat(String(userResult.rows[0].red_packet_wagered ?? 0));

  if (rpBalance <= 0) return 0;

  // Get multiplier from platform_config (default 2)
  const configResult = await query(
    `SELECT value FROM platform_config WHERE key = 'red_packet_wager_multiplier'`
  );
  const multiplier = configResult.rows.length > 0 ? parseFloat(configResult.rows[0].value) : 2.0;
  const required = rpBalance * multiplier;

  if (rpWagered < required) return 0;

  // Unlock: move red_packet_balance into wallet_balance
  await query(
    `UPDATE users
     SET wallet_balance = COALESCE(wallet_balance, 0) + red_packet_balance,
         red_packet_balance = 0,
         red_packet_wagered = 0
     WHERE id = $1`,
    [userId]
  );

  return rpBalance;
}
