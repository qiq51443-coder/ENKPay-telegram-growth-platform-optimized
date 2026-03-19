import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000, // 15s: accommodates 10s SDK polling window + server processing time
});

// ─── Init data management ──────────────────────────────────────────────────────
export function setInitData(initData: string) {
  if (initData) {
    api.defaults.headers.common['X-Telegram-Init-Data'] = initData;
  }
}

// ─── User Profile ─────────────────────────────────────────────────────────────
export async function getUserProfile() {
  const response = await api.get('/miniapp/profile');
  return response.data;
}

// ─── Auth Sync ────────────────────────────────────────────────────────────────
export async function authSync(initData: string) {
  const response = await api.post('/miniapp/auth-sync', {}, {
    headers: { 'X-Telegram-Init-Data': initData },
  });
  return response.data;
}

// ─── Trading ──────────────────────────────────────────────────────────────────
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
  pair_id: string;
  duration: number;
  direction: 'up' | 'down';
  amount: number;
}) {
  const response = await api.post('/trading/quick-session', params);
  return response.data;
}

export async function getMyOrders(options?: { status?: string; limit?: number }) {
  const response = await api.get('/trading/orders/my', {
    params: options,
  });
  return response.data;
}

// ─── Products / NFT ───────────────────────────────────────────────────────────
export async function getProducts() {
  const response = await api.get('/nft/products');
  return response.data;
}

// ─── Charity ─────────────────────────────────────────────────────────────────
export async function getCharityActivities() {
  const response = await api.get('/charity/activities');
  return response.data;
}

// ─── Transactions ─────────────────────────────────────────────────────────────
export async function getTransactions() {
  const response = await api.get('/miniapp/transactions');
  return response.data;
}

// ─── Announcements ────────────────────────────────────────────────────────────
export async function getAnnouncements(showOnLaunch?: boolean) {
  const params = showOnLaunch ? { show_on_app_launch: true } : {};
  const response = await api.get('/miniapp/announcements', { params });
  return response.data;
}

// ─── Language ─────────────────────────────────────────────────────────────────
export async function updateLanguage(langCode: string) {
  const response = await api.post('/miniapp/language', { language_code: langCode });
  return response.data;
}

// ─── Auctions ────────────────────────────────────────────────────────────────
export async function getAuctions(status = 'active') {
  const response = await api.get('/auctions', { params: { status } });
  return response.data;
}

export async function getAuctionDetail(id: string) {
  const response = await api.get(`/auctions/${id}`);
  return response.data;
}

export async function joinAuction(id: string, quantity: number) {
  const response = await api.post(`/auctions/${id}/join`, { quantity });
  return response.data;
}

export async function getAuctionResults() {
  const response = await api.get('/auctions/results');
  return response.data;
}

export async function getMyAuctions() {
  const response = await api.get('/auctions/my');
  return response.data;
}

export async function redeemAuction(resultId: string) {
  const response = await api.post(`/auctions/results/${resultId}/redeem`, {});
  return response.data;
}

// ─── Agreement ────────────────────────────────────────────────────────────────

export async function getAgreement() {
  const response = await api.get('/miniapp/agreement');
  return response.data;
}

