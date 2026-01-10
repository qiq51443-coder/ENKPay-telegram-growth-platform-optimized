import axios from 'axios';

const API_BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// User endpoints
export const getUser = async (botId: string, telegramId: number) => {
  try {
    const response = await api.get(`/api/users/telegram/${telegramId}`, {
      headers: { 'X-Bot-Token': botId },
    });
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
};

export const createUser = async (botId: string, userData: any) => {
  const response = await api.post('/api/users', userData, {
    headers: { 'X-Bot-Token': botId },
  });
  return response.data;
};

export const updateUser = async (botId: string, userId: string, updates: any) => {
  const response = await api.put(`/api/users/${userId}`, updates, {
    headers: { 'X-Bot-Token': botId },
  });
  return response.data;
};

// Settings endpoints
export const getSettings = async (botId: string) => {
  const response = await api.get(`/api/settings/${botId}`);
  return response.data.settings;
};

// Binding endpoints
export const createBinding = async (botId: string, userId: string, platformUsername: string, screenshotFileId: string) => {
  const response = await api.post('/api/bindings', {
    user_id: userId,
    bot_id: botId,
    platform_username: platformUsername,
    screenshot_file_id: screenshotFileId,
  });
  return response.data;
};

// Screenshot endpoints
export const createScreenshot = async (botId: string, userId: string, groupId: number, messageId: number, fileId: string) => {
  const response = await api.post('/api/screenshots', {
    user_id: userId,
    bot_id: botId,
    group_id: groupId,
    message_id: messageId,
    file_id: fileId,
  });
  return response.data;
};

// Red packet endpoints
export const getRedPacket = async (redPacketId: string) => {
  const response = await api.get(`/api/redpackets/${redPacketId}`);
  return response.data;
};

export const claimRedPacket = async (redPacketId: string, userId: string) => {
  const response = await api.post(`/api/redpackets/${redPacketId}/claim`, {
    user_id: userId,
  });
  return response.data;
};

// Exchange endpoints
export const getExchanges = async () => {
  const response = await api.get('/api/exchanges');
  return response.data.exchanges;
};

export const getExchange = async (exchangeId: string) => {
  const response = await api.get(`/api/exchanges/${exchangeId}`);
  return response.data.exchange;
};

// Transaction endpoints
export const getTransactions = async (userId: string, limit = 10) => {
  const response = await api.get(`/api/users/${userId}/transactions?limit=${limit}`);
  return response.data.transactions;
};

// Invitation endpoints
export const getInviteStats = async (userId: string) => {
  const response = await api.get(`/api/users/${userId}/invites`);
  return response.data;
};
