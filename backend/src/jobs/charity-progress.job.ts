import cron from 'node-cron';
import { query } from '../db';

let cronJob: cron.ScheduledTask | null = null;

/**
 * Run the charity progress auto-increment logic
 */
async function runCharityProgressIncrement(): Promise<void> {
  try {
    // Find all active projects with auto-increment enabled and not yet completed
    const projectsResult = await query(
      `SELECT id, progress_override, progress_increment_rate, progress_increment_interval,
              progress_last_incremented_at, target_amount
       FROM charity_projects
       WHERE status = 'active'
         AND progress_auto_increment = TRUE
         AND (progress_override IS NULL OR progress_override < 100)`
    );

    for (const project of projectsResult.rows) {
      const {
        id,
        progress_override,
        progress_increment_rate,
        progress_increment_interval,
        progress_last_incremented_at,
        target_amount,
      } = project;

      // Check if enough time has passed since last increment
      const shouldIncrement =
        progress_last_incremented_at == null ||
        (Date.now() - new Date(progress_last_incremented_at).getTime()) >=
          Number(progress_increment_interval) * 60 * 1000;

      if (!shouldIncrement) continue;

      const currentProgress = progress_override != null ? parseFloat(String(progress_override)) : 0;
      const rate = parseFloat(String(progress_increment_rate));
      const newProgress = Math.min(100, currentProgress + rate);
      const newRaised = Math.round((newProgress / 100.0) * parseFloat(String(target_amount)) * 100) / 100;

      if (newProgress >= 100) {
        // Complete the project
        await query(
          `UPDATE charity_projects
           SET progress_override = $1,
               raised_amount = $2,
               progress_last_incremented_at = NOW(),
               status = 'completed',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newProgress, newRaised, id]
        );
        console.log(`[CharityProgress] Project ${id} reached 100% — marked as completed`);
      } else {
        await query(
          `UPDATE charity_projects
           SET progress_override = $1,
               raised_amount = $2,
               progress_last_incremented_at = NOW(),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [newProgress, newRaised, id]
        );
        console.log(`[CharityProgress] Project ${id} progress updated: ${currentProgress.toFixed(2)}% → ${newProgress.toFixed(2)}%, raised: ${newRaised}`);
      }
    }
  } catch (error: any) {
    console.error('[CharityProgress] Error running charity progress increment:', error.message);
  }
}

/**
 * Start the charity progress auto-increment cron job (runs every minute)
 */
export function startCharityProgressJob(): void {
  if (cronJob) {
    console.log('Charity progress job already started');
    return;
  }

  // Run every minute
  cronJob = cron.schedule('* * * * *', async () => {
    await runCharityProgressIncrement();
  });

  console.log('✓ Charity progress auto-increment job started (runs every minute)');
}

/**
 * Stop the charity progress auto-increment cron job
 */
export function stopCharityProgressJob(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Charity progress job stopped');
  }
}
