/**
 * sweep-scheduler.ts — Hourly cron job that consolidates user deposit
 * address balances into the platform hot wallets.
 *
 * Exports:
 *   startSweepScheduler() — start the cron; no-op if already running
 *   stopSweepScheduler()  — stop the cron
 */

import cron from 'node-cron';
import { sweepAllPendingAddresses } from '../services/sweep.service';

let isRunning = false;
let cronJob: cron.ScheduledTask | null = null;

async function runSweep(): Promise<void> {
  if (isRunning) {
    console.log('Sweep scheduler: already running, skipping this tick.');
    return;
  }

  isRunning = true;
  console.log('Sweep scheduler: starting fund sweep...');

  try {
    const results = await sweepAllPendingAddresses();

    const broadcast = results.filter((r) => r.status === 'broadcast');
    const failed = results.filter((r) => r.status === 'failed');

    console.log(
      `Sweep scheduler: finished. Broadcast: ${broadcast.length}, Failed: ${failed.length}.`
    );

    for (const r of broadcast) {
      console.log(`  ✓ Swept ${r.amount} from ${r.fromAddress} → tx ${r.txHash}`);
    }
    for (const r of failed) {
      console.error(`  ✗ Failed to sweep ${r.fromAddress}: ${r.error}`);
    }
  } catch (err: any) {
    console.error('Sweep scheduler error:', err.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the sweep cron job (runs once per hour).
 */
export function startSweepScheduler(): void {
  if (cronJob) {
    console.log('Sweep scheduler already started.');
    return;
  }

  // Run every hour at the top of the hour
  cronJob = cron.schedule('0 * * * *', runSweep);

  console.log('✓ Sweep scheduler started (runs every hour).');
}

/**
 * Stop the sweep cron job.
 */
export function stopSweepScheduler(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Sweep scheduler stopped.');
  }
}
