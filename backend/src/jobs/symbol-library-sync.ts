import cron from 'node-cron';
import { syncBinanceSymbols } from '../services/symbol-library.service';

let cronJob: cron.ScheduledTask | null = null;

/**
 * Run the Binance symbol library sync
 */
async function runSymbolLibrarySync(): Promise<void> {
  try {
    console.log('Starting Binance symbol library sync...');
    const count = await syncBinanceSymbols();
    console.log(`✓ Binance symbol library sync completed: ${count} symbols synced`);
  } catch (error: any) {
    console.error('Error syncing Binance symbol library:', error.message);
  }
}

/**
 * Start the symbol library sync cron job (runs daily at 03:00)
 */
export function startSymbolLibrarySync(): void {
  if (cronJob) {
    console.log('Symbol library sync job already started');
    return;
  }

  // Run every day at 03:00
  cronJob = cron.schedule('0 3 * * *', async () => {
    await runSymbolLibrarySync();
  });

  console.log('✓ Symbol library sync job started (runs daily at 03:00)');
}

/**
 * Stop the symbol library sync cron job
 */
export function stopSymbolLibrarySync(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Symbol library sync job stopped');
  }
}
