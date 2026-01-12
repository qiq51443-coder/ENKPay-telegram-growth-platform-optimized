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

// Cache TTL configuration
export const CACHE_TTL = {
  USER: 300,           // User information 5 minutes
  SETTINGS: 600,       // System settings 10 minutes
  BOT: 300,            // Bot information 5 minutes
  EXCHANGE: 3600,      // Exchange information 1 hour
  TUTORIAL: 1800,      // Tutorials 30 minutes
};

// Generic cache methods
export async function getCache<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function setCache(key: string, value: any, ttl: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), {
    EX: ttl,
  });
}

export async function deleteCache(key: string): Promise<void> {
  await redis.del(key);
}

export async function deleteCachePattern(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(keys);
  }
}

// User cache
export async function getCachedUser(telegramId: number) {
  return getCache(`user:${telegramId}`);
}

export async function setCachedUser(telegramId: number, user: any) {
  await setCache(`user:${telegramId}`, user, CACHE_TTL.USER);
}

export async function invalidateUserCache(telegramId: number) {
  await deleteCache(`user:${telegramId}`);
}

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
    EX: CACHE_TTL.SETTINGS,
  });
};

export const invalidateSettings = async (botId: string) => {
  await redis.del(`settings:${botId}`);
};

// All settings cache
export async function getCachedSettings() {
  return getCache('settings:all');
}

export async function setCachedSettings(settings: any) {
  await setCache('settings:all', settings, CACHE_TTL.SETTINGS);
}

export async function invalidateSettingsCache() {
  await deleteCachePattern('settings:*');
}

// Bot cache
export async function getCachedBot(botId: string) {
  return getCache(`bot:${botId}`);
}

export async function setCachedBot(botId: string, bot: any) {
  await setCache(`bot:${botId}`, bot, CACHE_TTL.BOT);
}

export async function invalidateBotCache(botId: string) {
  await deleteCache(`bot:${botId}`);
}

// Exchange cache
export async function getCachedExchanges() {
  return getCache('exchanges:all');
}

export async function setCachedExchanges(exchanges: any) {
  await setCache('exchanges:all', exchanges, CACHE_TTL.EXCHANGE);
}

export async function invalidateExchangesCache() {
  await deleteCache('exchanges:all');
}

// Tutorial cache
export async function getCachedTutorials(exchangeId?: string) {
  const key = exchangeId ? `tutorials:exchange:${exchangeId}` : 'tutorials:all';
  return getCache(key);
}

export async function setCachedTutorials(tutorials: any, exchangeId?: string) {
  const key = exchangeId ? `tutorials:exchange:${exchangeId}` : 'tutorials:all';
  await setCache(key, tutorials, CACHE_TTL.TUTORIAL);
}

export async function invalidateTutorialsCache() {
  await deleteCachePattern('tutorials:*');
}

// Pub/Sub for real-time synchronization
export const publishSettingsUpdate = async (botId: string) => {
  await redis.publish('settings:update', JSON.stringify({ botId, timestamp: Date.now() }));
};

export const publishGlobalSettingsUpdate = async () => {
  await redis.publish('settings:update', JSON.stringify({ botId: null, timestamp: Date.now() }));
};

export async function subscribeSettingsUpdate(callback: () => void) {
  const subscriber = redis.duplicate();
  await subscriber.connect();
  await subscriber.subscribe('settings:update', () => {
    callback();
  });
  return subscriber;
}

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

export { redis };
export default redis;
