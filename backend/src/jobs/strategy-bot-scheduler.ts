import cron from 'node-cron';
import { query } from '../db';
import { sendStrategyMessage } from '../services/strategy-bot.service';

let schedulerStarted = false;

export function startStrategyBotScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  cron.schedule('0 * * * * *', async () => {
    const nowUtc = new Date();
    const currentTimeStr = `${String(nowUtc.getUTCHours()).padStart(2, '0')}:${String(nowUtc.getUTCMinutes()).padStart(2, '0')}`;

    try {
      const configs = await query(
        `SELECT sc.id, sc.send_times
         FROM strategy_configs sc
         JOIN strategy_bots sb ON sc.strategy_bot_id = sb.id
         WHERE sc.is_active = true
           AND sc.auto_send_daily = true
           AND sb.is_active = true`,
        []
      );

      for (const config of configs.rows) {
        let sendTimes: string[] = [];
        if (Array.isArray(config.send_times)) {
          sendTimes = config.send_times;
        } else if (typeof config.send_times === 'string') {
          try {
            const parsed = JSON.parse(config.send_times || '[]');
            sendTimes = Array.isArray(parsed) ? parsed : [];
          } catch {
            sendTimes = [];
          }
        }

        if (sendTimes.includes(currentTimeStr)) {
          await sendStrategyMessage(config.id).catch((err) =>
            console.error(`[strategy-scheduler] Failed to send config ${config.id}:`, err)
          );
        }
      }
    } catch (err) {
      console.error('[strategy-scheduler] Execution error:', err);
    }
  });

  console.log('[strategy-scheduler] Started (runs every minute at second 0)');
}
