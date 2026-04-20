import cron from 'node-cron';
import { query } from '../db';
import { deriveCurrentGroupId, normalizeMiniAppBgConfig } from '../services/miniapp-bg.service';

let cronJob: cron.ScheduledTask | null = null;

async function runMiniAppBgRotationCheck(): Promise<void> {
  try {
    const result = await query(
      `SELECT value FROM system_settings WHERE key = 'miniapp_bg_groups' LIMIT 1`
    );
    if (result.rows.length === 0) return;

    const config = normalizeMiniAppBgConfig(result.rows[0].value);
    if (config.rotation === 'manual' || config.groups.length === 0) return;

    const nextGroupId = deriveCurrentGroupId(config, new Date());
    if (!nextGroupId || nextGroupId === config.current_group_id) return;

    const nextConfig = { ...config, current_group_id: nextGroupId };
    await query(
      `UPDATE system_settings
       SET value = $1, updated_at = NOW()
       WHERE key = 'miniapp_bg_groups'`,
      [JSON.stringify(nextConfig)]
    );

    console.log(`[miniapp-bg-rotation] Updated current_group_id -> ${nextGroupId}`);
  } catch (error: any) {
    if (error?.code === '42P01') return;
    console.error('[miniapp-bg-rotation] Rotation check failed:', error?.message || error);
  }
}

export function startMiniAppBgRotationJob(): void {
  if (cronJob) {
    console.log('Miniapp background rotation job already started');
    return;
  }

  // 每天凌晨 00:05 检查是否需要自动切组
  cronJob = cron.schedule('5 0 * * *', async () => {
    await runMiniAppBgRotationCheck();
  });

  // 启动时先检查一次，避免服务重启后状态滞后
  void runMiniAppBgRotationCheck();
  console.log('✓ Miniapp background rotation job started (runs daily at 00:05)');
}
