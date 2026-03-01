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

export async function getProducts() {
  const response = await api.get('/nft/products');
  return response.data;
}

export async function getCharityActivities() {
  const response = await api.get('/charity/activities');
  return response.data;
}
