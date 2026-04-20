export type MiniAppBgRotation = 'manual' | 'weekly' | 'monthly';
export type MiniAppBgPageKey = 'trading' | 'auction' | 'period' | 'charity' | 'profile';

export interface MiniAppBgGroup {
  id: string;
  name: string;
  trading: string;
  auction: string;
  period: string;
  charity: string;
  profile: string;
}

export interface MiniAppBgConfig {
  groups: MiniAppBgGroup[];
  rotation: MiniAppBgRotation;
  current_group_id: string | null;
  rotation_start: string | null;
}

export const MINIAPP_BG_EMPTY_CONFIG: MiniAppBgConfig = {
  groups: [],
  rotation: 'manual',
  current_group_id: null,
  rotation_start: null,
};

export const MINIAPP_BG_EMPTY_PAGE_MAP: Record<MiniAppBgPageKey, string> = {
  trading: '',
  auction: '',
  period: '',
  charity: '',
  profile: '',
};

function parseJsonValue(raw: any): any {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

export function normalizeMiniAppBgConfig(input: any): MiniAppBgConfig {
  const parsed = parseJsonValue(input) || {};
  const rotation: MiniAppBgRotation = parsed.rotation === 'weekly' || parsed.rotation === 'monthly' ? parsed.rotation : 'manual';
  const groupsRaw = Array.isArray(parsed.groups) ? parsed.groups : [];
  const groups: MiniAppBgGroup[] = groupsRaw
    .map((item: any, index: number) => ({
      id: String(item?.id || `group_${index + 1}`),
      name: String(item?.name || `第${index + 1}组`),
      trading: String(item?.trading || ''),
      auction: String(item?.auction || ''),
      period: String(item?.period || ''),
      charity: String(item?.charity || ''),
      profile: String(item?.profile || ''),
    }))
    .filter(g => g.id);

  const fallbackGroupId = groups[0]?.id || null;
  const currentGroupId = parsed.current_group_id ? String(parsed.current_group_id) : null;
  const current_group_id = currentGroupId && groups.some(g => g.id === currentGroupId) ? currentGroupId : fallbackGroupId;
  const rotation_start = parsed.rotation_start ? String(parsed.rotation_start) : null;

  return { groups, rotation, current_group_id, rotation_start };
}

function getBaseGroupIndex(config: MiniAppBgConfig): number {
  if (config.groups.length === 0) return -1;
  const idx = config.current_group_id
    ? config.groups.findIndex(g => g.id === config.current_group_id)
    : -1;
  return idx >= 0 ? idx : 0;
}

function getRotationSteps(config: MiniAppBgConfig, now: Date): number {
  if (config.rotation === 'manual' || !config.rotation_start) return 0;
  const startDate = new Date(config.rotation_start);
  if (Number.isNaN(startDate.getTime()) || now.getTime() < startDate.getTime()) return 0;

  if (config.rotation === 'weekly') {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.floor((now.getTime() - startDate.getTime()) / msPerWeek);
  }

  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();
  return Math.max(0, (nowYear - startYear) * 12 + (nowMonth - startMonth));
}

export function getActiveMiniAppBgGroup(config: MiniAppBgConfig, now = new Date()): MiniAppBgGroup | null {
  if (config.groups.length === 0) return null;
  const baseIndex = getBaseGroupIndex(config);
  if (baseIndex < 0) return null;
  const steps = getRotationSteps(config, now);
  const idx = (baseIndex + steps) % config.groups.length;
  return config.groups[idx] || null;
}

export function getActiveMiniAppBgMap(config: MiniAppBgConfig, now = new Date()): Record<MiniAppBgPageKey, string> {
  const group = getActiveMiniAppBgGroup(config, now);
  if (!group) return { ...MINIAPP_BG_EMPTY_PAGE_MAP };
  return {
    trading: group.trading || '',
    auction: group.auction || '',
    period: group.period || '',
    charity: group.charity || '',
    profile: group.profile || '',
  };
}

export function deriveCurrentGroupId(config: MiniAppBgConfig, now = new Date()): string | null {
  const group = getActiveMiniAppBgGroup(config, now);
  return group?.id || null;
}
