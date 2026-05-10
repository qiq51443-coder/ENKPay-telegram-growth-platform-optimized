import { Context } from 'telegraf';
import { getUser as getUserFromAPI, createUser as createUserAPI } from './api';

export interface User {
  id: string;
  bot_id: string;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code: string;
  robot_user_id: string;
  unique_id?: string;
  invite_code: string;
  invited_by?: string;
  balance: number;
  wallet_balance?: number;
  reward_balance?: number;
  frozen_balance?: number;
  platform_username?: string;
  platform_bound: boolean;
  platform_status: string;
  account_status: string;
  channel_followed: boolean;
  group_joined: boolean;
  follow_reward_unlocked: boolean;
  bind_reward_unlocked: boolean;
  red_packet_credits?: number;
  red_packet_balance?: number;
  nft_balance?: number;
  registered_at: string;
  created_at: string;
}

export const getOrCreateUser = async (ctx: Context, botId: string, inviteCode?: string): Promise<User> => {
  if (!ctx.from) {
    throw new Error('No user context');
  }

  // Try to get existing user
  let user = await getUserFromAPI(botId, ctx.from.id);

  // Create if doesn't exist
  if (!user) {
    const userData: Record<string, any> = {
      bot_id: botId,
      telegram_id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name,
      language_code: ctx.from.language_code || 'en',
    };

    // invite_code_used is only passed on first registration (new users).
    // The caller is responsible for ensuring this is not set for existing users
    // or for self-referrals.
    if (inviteCode) {
      userData.invite_code_used = inviteCode;
    }

    try {
      const response = await createUserAPI(botId, userData);
      user = response.user;
    } catch (createErr: any) {
      // If backend rejects the invite code with a 400 (e.g. self-referral), gracefully
      // retry without it so that user registration still succeeds.
      // We only retry when invite_code_used was set and the error body hints at an
      // invite-related rejection; other 400 causes (malformed fields, etc.) are re-thrown.
      const errBody: string = JSON.stringify(createErr?.response?.data ?? '').toLowerCase();
      const isInviteRejection =
        createErr?.response?.status === 400 &&
        userData.invite_code_used &&
        (errBody.includes('invite') || errBody.includes('self') || errBody.includes('referral'));
      if (isInviteRejection) {
        console.warn('[user] Invite code rejected by backend, retrying without invite code');
        delete userData.invite_code_used;
        const retryResponse = await createUserAPI(botId, userData);
        user = retryResponse.user;
      } else {
        throw createErr;
      }
    }
  }

  return user;
};

export const getUserLanguage = (user: User): string => {
  return user.language_code || 'en';
};
