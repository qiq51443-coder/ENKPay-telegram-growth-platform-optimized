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

// Settings cache
const settingsCache = new Map<string, any>();

export const getSettings = async (botId: string) => {
  // Check memory cache first
  if (settingsCache.has(botId)) {
    return settingsCache.get(botId);
  }

  // Check Redis cache
  try {
    const cached = await redis.get(`settings:${botId}`);
    if (cached) {
      const settings = JSON.parse(cached);
      settingsCache.set(botId, settings);
      return settings;
    }
  } catch (error) {
    console.error('Redis get error:', error);
  }

  // Fetch from API
  const settings = await getSettingsFromAPI(botId);
  
  // Cache in both memory and Redis
  settingsCache.set(botId, settings);
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
  });

  return subscriber;
};

export default redis;
