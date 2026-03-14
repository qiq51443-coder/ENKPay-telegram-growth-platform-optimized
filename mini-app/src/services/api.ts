// @ts-nocheck
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
}, initData: string) {
  const response = await api.post('/trading/quick-session', params, {
    headers: { 'X-Telegram-Init-Data': initData },
  });
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

export async function getTransactions(initData: string) {
  const response = await api.get('/miniapp/transactions', {
    headers: { 'X-Telegram-Init-Data': initData },
  });
  return response.data;
}

export async function getAnnouncements(showOnLaunch?: boolean) {
  const params = showOnLaunch ? { show_on_app_launch: true } : {};
  const response = await api.get('/miniapp/announcements', { params });
  return response.data;
}

export async function updateLanguage(langCode: string, initData: string) {
  const response = await api.post('/miniapp/language', { language_code: langCode }, {
    headers: { 'X-Telegram-Init-Data': initData },
  });
  return response.data;
}

// Auction (Lucky Draw) APIs
export async function getAuctions(status = 'active') {
  const response = await api.get('/auctions', { params: { status } });
  return response.data;
}

export async function getAuctionDetail(id: string) {
  const response = await api.get(`/auctions/${id}`);
  return response.data;
}

export async function joinAuction(id: string, quantity: number, initData: string) {
  const response = await api.post(`/auctions/${id}/join`, { quantity }, {
    headers: { 'X-Telegram-Init-Data': initData },
  });
  return response.data;
}

export async function getAuctionResults() {
  const response = await api.get('/auctions/results');
  return response.data;
}

export async function getMyAuctions(initData: string) {
  const response = await api.get('/auctions/my', {
    headers: { 'X-Telegram-Init-Data': initData },
  });
  return response.data;
}

export async function redeemAuction(resultId: string, initData: string) {
  const response = await api.post(`/auctions/results/${resultId}/redeem`, {}, {
    headers: { 'X-Telegram-Init-Data': initData },
  });
  return response.data;
}

export async function authSync(initData: string) {
  const response = await api.post('/miniapp/auth-sync', {}, {
    headers: { 'X-Telegram-Init-Data': initData },
  });
  return response.data;
}

// Module-level flag so Trading.tsx can check whether auth-sync has already
// completed at least once (prevents "User not found" race on first open).
let _authSyncCompleted = false;

export function isAuthSyncCompleted(): boolean {
  return _authSyncCompleted;
}

export function setAuthSyncCompleted(value: boolean): void {
  _authSyncCompleted = value;
}

