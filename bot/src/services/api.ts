import axios from 'axios';

const API_BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const BOT_ID = process.env.BOT_ID; // Bot ID from admin panel

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Bot-Token': BOT_ID || '', // Use Bot ID for authentication
  },
});

// User endpoints
export const getUser = async (botId: string, telegramId: number) => {
  try {
    const response = await api.get(`/api/users/telegram/${telegramId}`, {
      headers: { 'X-Bot-Token': botId },
    });
    return response.data.user;
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

// Wallet endpoints
export const getDepositAddress = async (botId: string, userId: string, networkId: string) => {
  const response = await api.get(`/api/wallet/deposit-address/${userId}?network_id=${networkId}`, {
    headers: { 'X-Bot-Token': botId },
  });
  return response.data.data;
};

export const submitWithdraw = async (botId: string, data: {
  user_id: string | number;
  network_id: string;
  amount: number;
  to_address: string;
}) => {
  const response = await api.post('/api/wallet/withdraw', data, {
    headers: { 'X-Bot-Token': botId },
  });
  return response.data;
};

export const submitTransfer = async (botId: string, data: {
  from_user_id: string | number;
  to_identifier: string;
  amount: number;
  memo?: string;
}) => {
  const response = await api.post('/api/wallet/transfer', data, {
    headers: { 'X-Bot-Token': botId },
  });
  return response.data;
};

export const getWithdrawPassword = async (botId: string, userId: string) => {
  const response = await api.get(`/api/wallet/withdraw-password/${userId}`, {
    headers: { 'X-Bot-Token': botId },
  });
  return response.data;
};

export const setWithdrawPassword = async (botId: string, userId: string, password: string) => {
  const response = await api.post('/api/wallet/withdraw-password', { user_id: userId, password }, {
    headers: { 'X-Bot-Token': botId },
  });
  return response.data;
};

export const verifyWithdrawPassword = async (botId: string, userId: string, password: string) => {
  const response = await api.post('/api/wallet/verify-withdraw-password', { user_id: userId, password }, {
    headers: { 'X-Bot-Token': botId },
  });
  return response.data;
};

export const getUserByUniqueId = async (botId: string, uniqueId: string) => {
  try {
    const response = await api.get(`/api/users/unique/${uniqueId}`, {
      headers: { 'X-Bot-Token': botId },
    });
    return response.data.user;
  } catch (error: any) {
    if (error.response?.status === 404) return null;
    throw error;
  }
};

export const getSystemSetting = async (key: string) => {
  try {
    const response = await api.get(`/api/settings/public/${key}`);
    return response.data.value;
  } catch {
    return null;
  }
};
