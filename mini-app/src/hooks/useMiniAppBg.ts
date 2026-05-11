import { useEffect, useState } from 'react';
import type React from 'react';
import { api } from '../services/api';

type MiniAppBgPage = 'trading' | 'auction' | 'period' | 'charity' | 'profile';
type MiniAppBgConfig = Record<MiniAppBgPage, string>;

const CACHE_KEY = 'miniapp_bg_config_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const EMPTY_CONFIG: MiniAppBgConfig = {
  trading: '',
  auction: '',
  period: '',
  charity: '',
  profile: '',
};

let pendingRequest: Promise<MiniAppBgConfig> | null = null;

function readCache(): MiniAppBgConfig | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.expiresAt || Date.now() > Number(parsed.expiresAt)) return null;
    return { ...EMPTY_CONFIG, ...(parsed.data || {}) };
  } catch {
    return null;
  }
}

function writeCache(data: MiniAppBgConfig) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      expiresAt: Date.now() + CACHE_TTL_MS,
      data,
    }));
  } catch {
    // ignore
  }
}

async function fetchMiniAppBgConfig(): Promise<MiniAppBgConfig> {
  const cached = readCache();
  if (cached) return cached;

  if (!pendingRequest) {
    pendingRequest = api
      .get('/miniapp/bg-config')
      .then((res) => ({ ...EMPTY_CONFIG, ...(res.data || {}) }))
      .then((data) => {
        writeCache(data);
        return data;
      })
      .catch(() => EMPTY_CONFIG)
      .finally(() => { pendingRequest = null; });
  }

  return pendingRequest;
}

export function buildBgStyle(bgUrl: string): React.CSSProperties {
  return {
    minHeight: '100vh',
    backgroundImage: bgUrl
      ? `linear-gradient(rgba(10, 22, 40, 0.65), rgba(10, 22, 40, 0.65)), url(${bgUrl})`
      : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  };
}

export function useMiniAppBg(page: MiniAppBgPage): string {
  const [bgUrl, setBgUrl] = useState('');

  useEffect(() => {
    let active = true;
    const cached = readCache();
    if (cached) {
      setBgUrl(cached[page] || '');
      return;
    }

    fetchMiniAppBgConfig().then((config) => {
      if (!active) return;
      setBgUrl(config[page] || '');
    });

    return () => { active = false; };
  }, [page]);

  return bgUrl;
}
