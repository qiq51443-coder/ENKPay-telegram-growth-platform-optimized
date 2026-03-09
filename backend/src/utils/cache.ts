import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// In-memory fallback cache
const memoryCache = new Map<string, { value: string; expiresAt: number }>();
let redisAvailable = false;

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redis.on('error', () => {
  if (redisAvailable) {
    console.warn('Redis connection lost, falling back to in-memory cache');
    redisAvailable = false;
  }
});
redis.on('connect', () => {
  console.log('Redis connected');
  redisAvailable = true;
});

export const connectRedis = async () => {
  if (!process.env.REDIS_URL) {
    console.log('REDIS_URL not set, using in-memory cache');
    return redis;
  }
  try {
    if (!redis.isOpen) {
      await redis.connect();
      redisAvailable = true;
    }
  } catch (err) {
    console.warn('Redis connect failed, using in-memory cache:', (err as Error).message);
    redisAvailable = false;
  }
  return redis;
};

// Memory cache helpers
function memGet(key: string): string | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key: string, value: string, ttlSeconds: number): void {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function memDel(key: string): void {
  memoryCache.delete(key);
}

function memKeys(pattern: string): string[] {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return Array.from(memoryCache.keys()).filter(k => regex.test(k));
}

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
  if (redisAvailable) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.warn('Redis getCache error, falling back to memory:', (err as Error).message);
      redisAvailable = false;
    }
  }
  const data = memGet(key);
  return data ? JSON.parse(data) : null;
}

export async function setCache(key: string, value: any, ttl: number): Promise<void> {
  const serialized = JSON.stringify(value);
  if (redisAvailable) {
    try {
      await redis.set(key, serialized, { EX: ttl });
      return;
    } catch (err) {
      console.warn('Redis setCache error, falling back to memory:', (err as Error).message);
      redisAvailable = false;
    }
  }
  memSet(key, serialized, ttl);
}

export async function deleteCache(key: string): Promise<void> {
  if (redisAvailable) {
    try {
      await redis.del(key);
      return;
    } catch (err) {
      console.warn('Redis deleteCache error, falling back to memory:', (err as Error).message);
      redisAvailable = false;
    }
  }
  memDel(key);
}

export async function deleteCachePattern(pattern: string): Promise<void> {
  if (redisAvailable) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(keys);
      return;
    } catch (err) {
      console.warn('Redis deleteCachePattern error, falling back to memory:', (err as Error).message);
      redisAvailable = false;
    }
  }
  for (const k of memKeys(pattern)) memDel(k);
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
  return getCache(`settings:${botId}`);
};

export const setSettings = async (botId: string, settings: any) => {
  await setCache(`settings:${botId}`, settings, CACHE_TTL.SETTINGS);
};

export const invalidateSettings = async (botId: string) => {
  await deleteCache(`settings:${botId}`);
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

// Pub/Sub for real-time synchronization (no-op when Redis unavailable)
export const publishSettingsUpdate = async (botId: string) => {
  if (!redisAvailable) return;
  try {
    await redis.publish('settings:update', JSON.stringify({ botId, timestamp: Date.now() }));
  } catch {}
};

export const publishGlobalSettingsUpdate = async () => {
  if (!redisAvailable) return;
  try {
    await redis.publish('settings:update', JSON.stringify({ botId: null, timestamp: Date.now() }));
  } catch {}
};

export async function subscribeSettingsUpdate(callback: () => void) {
  if (!redisAvailable) return null;
  try {
    const subscriber = redis.duplicate();
    await subscriber.connect();
    await subscriber.subscribe('settings:update', () => {
      callback();
    });
    return subscriber;
  } catch {
    return null;
  }
}

// User state management
export const getUserState = async (userId: string) => {
  return getCache(`user:state:${userId}`);
};

export const setUserState = async (userId: string, state: any, ttl = 3600) => {
  await setCache(`user:state:${userId}`, state, ttl);
};

export const clearUserState = async (userId: string) => {
  await deleteCache(`user:state:${userId}`);
};

export { redis };
export default redis;
