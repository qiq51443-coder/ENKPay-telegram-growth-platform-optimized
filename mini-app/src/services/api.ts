// @ts-nocheck
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
});

// ─── Session token management ─────────────────────────────────────────────────

let _sessionToken: string = sessionStorage.getItem('_session_token') || '';

export function getSessionToken(): string {
  return _sessionToken;
}

export function setSessionToken(token: string): void {
  _sessionToken = token;
  if (token) {
    sessionStorage.setItem('_session_token', token);
  } else {
    sessionStorage.removeItem('_session_token');
  }
}

// Automatically attach auth headers to every outgoing request.
// Rule: if a session token is present, use it exclusively and omit initData
// to avoid confusing the backend middleware with two auth signals at once.
api.interceptors.request.use((config) => {
  const token = getSessionToken();
  if (token) {
    config.headers['X-Session-Token'] = token;
    // Remove any per-instance initData to prevent dual-auth confusion
    delete config.headers['X-Telegram-Init-Data'];
  }
  return config;
});

// Response interceptor: clear session token on 401 so the next request
// falls back to initData validation instead of retrying with a stale token.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const currentToken = getSessionToken();
      if (currentToken) {
        console.warn('[api] Received 401 — clearing stale session token');
        setSessionToken('');
      }
    }
    return Promise.reject(error);
  }
);

// ─── Existing helpers ─────────────────────────────────────────────────────────

export function setInitData(initData: string) {
  api.defaults.headers.common['X-Telegram-Init-Data'] = initData;
}

export async function getUserProfile(initData?: string) {
  const headers: Record<string, string> = {};
  // Only attach initData when there is no session token to avoid dual-auth
  if (initData && !getSessionToken()) {
    headers['X-Telegram-Init-Data'] = initData;
  }
  const response = await api.get('/miniapp/profile', { headers });
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

// ─── Bot temp-token exchange ──────────────────────────────────────────────────

/**
 * Exchange a one-time bot temp token for a session token + full user profile.
 * On success, call setSessionToken(data.session_token) so subsequent requests
 * are automatically authenticated.
 * Sends telegram_id from the URL as a fallback so the backend can recover
 * even if the one-time token has already been consumed (e.g. user reopened
 * the same cached Telegram WebApp button URL).
 */
export async function exchangeBotToken(botToken: string) {
  // Attempt to read telegram_id from URL as fallback for expired/consumed tokens
  const urlParams = new URLSearchParams(window.location.search);
  const telegramIdStr = urlParams.get('telegram_id');
  const body: Record<string, unknown> = { token: botToken };
  if (telegramIdStr) {
    const telegramId = parseInt(telegramIdStr, 10);
    if (!isNaN(telegramId)) {
      body.telegram_id = telegramId;
    }
  }
  const response = await api.post('/miniapp/bot-token/exchange', body);
  return response.data; // { success, user, session_token, bot_id }
}

// ─── Auth-sync state flag ─────────────────────────────────────────────────────

// Module-level flag so Trading.tsx can check whether auth-sync has already
// completed at least once (prevents "User not found" race on first open).
let _authSyncCompleted = false;

export function isAuthSyncCompleted(): boolean {
  return _authSyncCompleted;
}

export function setAuthSyncCompleted(value: boolean): void {
  _authSyncCompleted = value;
}


