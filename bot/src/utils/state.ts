import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redis.on('error', (err) => console.error('Redis State Error', err));

let isConnected = false;

export const connectRedis = async () => {
  if (!isConnected) {
    await redis.connect();
    isConnected = true;
  }
  return redis;
};

export interface UserState {
  step?: string;
  data?: any;
}

export const getUserState = async (userId: string): Promise<UserState | null> => {
  try {
    const state = await redis.get(`user:state:${userId}`);
    return state ? JSON.parse(state) : null;
  } catch (error) {
    console.error('Get user state error:', error);
    return null;
  }
};

export const setUserState = async (userId: string, state: UserState, ttl = 3600) => {
  try {
    await redis.set(`user:state:${userId}`, JSON.stringify(state), {
      EX: ttl,
    });
  } catch (error) {
    console.error('Set user state error:', error);
  }
};

export const clearUserState = async (userId: string) => {
  try {
    await redis.del(`user:state:${userId}`);
  } catch (error) {
    console.error('Clear user state error:', error);
  }
};

export default redis;
