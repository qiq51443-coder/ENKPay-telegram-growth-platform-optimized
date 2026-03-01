import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
});

export function setInitData(initData: string) {
  api.defaults.headers.common['X-Telegram-Init-Data'] = initData;
}

export async function getUserProfile(initData: string) {
  const response = await api.get('/miniapp/profile', {
    headers: { 'X-Telegram-Init-Data': initData },
  });
  return response.data;
}

export async function getTradingPairs() {
  const response = await api.get('/trading/pairs');
  return response.data;
}

export async function getTradingPairPrice(pairId: string) {
  const response = await api.get(`/trading/pairs/${pairId}/price`);
  return response.data;
}

export async function getTradingPairRules(pairId: string, duration?: number) {
  const params = duration ? { duration } : {};
  const response = await api.get(`/trading/pairs/${pairId}/rules`, { params });
  return response.data;
}

export async function placeQuickSession(params: {
  user_id: number;
  pair_id: string;
  duration: number;
  direction: 'up' | 'down';
  amount: number;
}) {
  const response = await api.post('/trading/quick-session', params);
  return response.data;
}

export async function getMyOrders(userId: number, options?: { status?: string; limit?: number }) {
  const response = await api.get('/trading/my-orders', {
    params: { user_id: userId, ...options },
  });
  return response.data;
}

export async function getProducts() {
  const response = await api.get('/nft/products');
  return response.data;
}

export async function getCharityActivities() {
  const response = await api.get('/charity/activities');
  return response.data;
}

// ============================================================
// Auction API
// ============================================================

export async function getAuctions(status?: string) {
  const response = await api.get('/auctions', { params: status ? { status } : {} });
  return response.data;
}

export async function getAuctionDetail(id: string) {
  const response = await api.get(`/auctions/${id}`);
  return response.data;
}

export async function getAuctionParticipants(id: string) {
  const response = await api.get(`/auctions/${id}/participants`);
  return response.data;
}

export async function joinAuction(id: string, userId: string, quantity: number) {
  const response = await api.post(
    `/auctions/${id}/join`,
    { user_id: userId, quantity },
  );
  return response.data;
}

export async function getAuctionResults() {
  const response = await api.get('/auctions/results');
  return response.data;
}

export async function getMyAuctions(userId: string) {
  const response = await api.get('/auctions/my', { params: { user_id: userId } });
  return response.data;
}

export async function redeemAuction(resultId: string, userId: string) {
  const response = await api.post(`/auctions/results/${resultId}/redeem`, { user_id: userId });
  return response.data;
}

// ============================================================
// Transactions API
// ============================================================

export async function getTransactions(userId: string, options?: { limit?: number; offset?: number }) {
  const response = await api.get(`/users/${userId}/transactions`, {
    params: { ...options },
  });
  return response.data;
}

// ============================================================
// Announcements API
// ============================================================

export async function getAnnouncements(showOnLaunch?: boolean) {
  const params: Record<string, any> = {};
  if (showOnLaunch) params.show_on_app_launch = true;
  const response = await api.get('/announcements', { params });
  return response.data;
}

// ============================================================
// Charity application API
// ============================================================

export async function submitCharityApplication(data: {
  activity_id?: string;
  user_id: string;
  reason: string;
  amount?: number;
}) {
  const response = await api.post('/charity/applications', data);
  return response.data;
}

// ============================================================
// Language preference API
// ============================================================

export async function updateLanguage(userId: string, langCode: string) {
  const response = await api.post('/miniapp/language', { user_id: userId, lang_code: langCode });
  return response.data;
}
