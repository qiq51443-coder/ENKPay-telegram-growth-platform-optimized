import { query, transaction } from '../db';
import { PoolClient } from 'pg';

export const addReward = async (
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string
) => {
  return transaction(async (client: PoolClient) => {
    // Get current balance
    const userResult = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const currentBalance = parseFloat(userResult.rows[0].balance);
    const newBalance = currentBalance + amount;

    // Update user balance
    await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);

    // Record transaction
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, type, amount, newBalance, description, referenceId]
    );

    return { newBalance, amount };
  });
};

export const addRedPacketCredits = async (userId: string, credits: number) => {
  const result = await query(
    `UPDATE users 
     SET red_packet_credits = red_packet_credits + $1 
     WHERE id = $2 
     RETURNING red_packet_credits`,
    [credits, userId]
  );
  return result.rows[0]?.red_packet_credits || 0;
};

export const deductRedPacketCredits = async (userId: string, credits: number = 1) => {
  const result = await query(
    `UPDATE users 
     SET red_packet_credits = GREATEST(red_packet_credits - $1, 0)
     WHERE id = $2 AND red_packet_credits >= $1
     RETURNING red_packet_credits`,
    [credits, userId]
  );
  if (result.rows.length === 0) {
    throw new Error('Insufficient red packet credits');
  }
  return result.rows[0].red_packet_credits;
};

export const unlockFollowReward = async (userId: string, botId: string) => {
  return transaction(async (client: PoolClient) => {
    // Get settings
    const settingsResult = await client.query(
      'SELECT follow_reward FROM bot_settings WHERE bot_id = $1',
      [botId]
    );
    const followReward = settingsResult.rows[0]?.follow_reward || 50;

    // Update user status
    await client.query(
      `UPDATE users 
       SET channel_followed = true, 
           group_joined = true, 
           follow_reward_unlocked = true 
       WHERE id = $1`,
      [userId]
    );

    // Add reward
    const userResult = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
    const currentBalance = parseFloat(userResult.rows[0].balance);
    const newBalance = currentBalance + followReward;

    await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, 'reward', followReward, newBalance, 'Follow channel and join group reward']
    );

    return { newBalance, rewardAmount: followReward };
  });
};

export const unlockBindReward = async (userId: string, botId: string) => {
  return transaction(async (client: PoolClient) => {
    // Get settings
    const settingsResult = await client.query(
      'SELECT bind_reward FROM bot_settings WHERE bot_id = $1',
      [botId]
    );
    const bindReward = settingsResult.rows[0]?.bind_reward || 100;

    // Update user status
    await client.query(
      `UPDATE users 
       SET platform_bound = true, 
           platform_status = 'active',
           bind_reward_unlocked = true 
       WHERE id = $1`,
      [userId]
    );

    // Add reward
    const userResult = await client.query('SELECT balance FROM users WHERE id = $1', [userId]);
    const currentBalance = parseFloat(userResult.rows[0].balance);
    const newBalance = currentBalance + bindReward;

    await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, 'reward', bindReward, newBalance, 'Platform binding reward']
    );

    return { newBalance, rewardAmount: bindReward };
  });
};

export const processInviteReward = async (inviterId: string, inviteeId: string, botId: string) => {
  return transaction(async (client: PoolClient) => {
    // Check if already rewarded
    const existingInvite = await client.query(
      'SELECT * FROM invitations WHERE inviter_id = $1 AND invitee_id = $2',
      [inviterId, inviteeId]
    );

    if (existingInvite.rows.length > 0 && existingInvite.rows[0].reward_paid) {
      return null; // Already rewarded
    }

    // Get settings
    const settingsResult = await client.query(
      'SELECT invite_reward FROM bot_settings WHERE bot_id = $1',
      [botId]
    );
    const inviteReward = settingsResult.rows[0]?.invite_reward || 25;

    // Record invitation
    if (existingInvite.rows.length === 0) {
      await client.query(
        `INSERT INTO invitations (inviter_id, invitee_id, reward_amount, reward_paid)
         VALUES ($1, $2, $3, true)`,
        [inviterId, inviteeId, inviteReward]
      );
    } else {
      await client.query(
        `UPDATE invitations SET reward_paid = true, reward_amount = $1
         WHERE inviter_id = $2 AND invitee_id = $3`,
        [inviteReward, inviterId, inviteeId]
      );
    }

    // Add reward to inviter
    const userResult = await client.query('SELECT balance FROM users WHERE id = $1', [inviterId]);
    const currentBalance = parseFloat(userResult.rows[0].balance);
    const newBalance = currentBalance + inviteReward;

    await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, inviterId]);

    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [inviterId, 'invite', inviteReward, newBalance, 'Invitation reward']
    );

    return { newBalance, rewardAmount: inviteReward };
  });
};
