import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redis.on('error', (err) => console.error('Redis Client Error', err));
redis.on('connect', () => console.log('Redis connected'));

export const connectRedis = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
  return redis;
};

// Settings cache management
export const getSettings = async (botId: string) => {
  const cached = await redis.get(`settings:${botId}`);
  if (cached) {
    return JSON.parse(cached);
  }
  return null;
};

export const setSettings = async (botId: string, settings: any) => {
  await redis.set(`settings:${botId}`, JSON.stringify(settings), {
    EX: 300, // 5 minutes cache
  });
};

export const invalidateSettings = async (botId: string) => {
  await redis.del(`settings:${botId}`);
};

// Broadcast to all bot instances
export const publishSettingsUpdate = async (botId: string) => {
  await redis.publish('settings:update', JSON.stringify({ botId, timestamp: Date.now() }));
};

// User state management
export const getUserState = async (userId: string) => {
  const state = await redis.get(`user:state:${userId}`);
  return state ? JSON.parse(state) : null;
};

export const setUserState = async (userId: string, state: any, ttl = 3600) => {
  await redis.set(`user:state:${userId}`, JSON.stringify(state), {
    EX: ttl,
  });
};

export const clearUserState = async (userId: string) => {
  await redis.del(`user:state:${userId}`);
};

export default redis;
