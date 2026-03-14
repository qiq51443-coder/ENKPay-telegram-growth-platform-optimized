import { createClient } from 'redis';
import { getSettings as getSettingsFromAPI } from './api';

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redis.on('error', (err) => console.error('Redis Client Error', err));

let isConnected = false;

export const connectRedis = async () => {
  if (!isConnected) {
    await redis.connect();
    isConnected = true;
    console.log('✓ Bot Redis connected');
  }
  return redis;
};

// Settings cache with TTL
const settingsCache = new Map<string, { data: any; fetchedAt: number }>();
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const getSettings = async (botId: string) => {
  // Check memory cache with TTL
  const cached = settingsCache.get(botId);
  if (cached && (Date.now() - cached.fetchedAt) < SETTINGS_CACHE_TTL_MS) {
    return cached.data;
  }

  // Check Redis cache
  try {
    const redisCached = await redis.get(`settings:${botId}`);
    if (redisCached) {
      const settings = JSON.parse(redisCached);
      settingsCache.set(botId, { data: settings, fetchedAt: Date.now() });
      return settings;
    }
  } catch (error) {
    console.error('Redis get error:', error);
  }

  // Fetch from API
  const settings = await getSettingsFromAPI(botId);
  
  // Cache in both memory and Redis
  settingsCache.set(botId, { data: settings, fetchedAt: Date.now() });
  try {
    await redis.set(`settings:${botId}`, JSON.stringify(settings), {
      EX: 300, // 5 minutes
    });
  } catch (error) {
    console.error('Redis set error:', error);
  }

  return settings;
};

export const invalidateSettings = (botId: string) => {
  settingsCache.delete(botId);
};

// Subscribe to settings updates
export const subscribeToSettingsUpdates = (callback: (botId: string) => void) => {
  const subscriber = redis.duplicate();
  
  subscriber.connect().then(() => {
    subscriber.subscribe('settings:update', (message) => {
      try {
        const data = JSON.parse(message);
        invalidateSettings(data.botId);
        callback(data.botId);
      } catch (error) {
        console.error('Error processing settings update:', error);
      }
    });
  }).catch((err) => {
    console.error('⚠️  Redis pub/sub unavailable — settings changes will propagate via in-memory TTL (max 5 min delay):', err.message || err);
  });

  return subscriber;
};

export default redis;
