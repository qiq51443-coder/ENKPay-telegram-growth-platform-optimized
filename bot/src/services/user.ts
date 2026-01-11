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
  invite_code: string;
  invited_by?: string;
  balance: number;
  platform_username?: string;
  platform_bound: boolean;
  platform_status: string;
  account_status: string;
  channel_followed: boolean;
  group_joined: boolean;
  follow_reward_unlocked: boolean;
  bind_reward_unlocked: boolean;
  red_packet_credits: number;
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
    const userData = {
      bot_id: botId,
      telegram_id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name,
      language_code: ctx.from.language_code || 'en',
    };

    // Add invite code if provided
    if (inviteCode) {
      // Find inviter by invite code
      // This would be handled by the backend
      (userData as any).invite_code_used = inviteCode;
    }

    const response = await createUserAPI(botId, userData);
    user = response.user;
  }

  return user;
};

export const getUserLanguage = (user: User): string => {
  return user.language_code || 'en';
};
