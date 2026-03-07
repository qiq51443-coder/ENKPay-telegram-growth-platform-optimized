import cron from 'node-cron';
import { query } from '../db';
import { settleSession } from '../services/trading-settlement.service';
import { getPairPrice } from '../services/price.service';

let cronJob: cron.ScheduledTask | null = null;
let isRunning = false;

/**
 * Auto-settle expired trading sessions
 */
async function autoSettleSessions(): Promise<void> {
  if (isRunning) {
    console.log('Auto-settle already running, skipping...');
    return;
  }

  isRunning = true;

  try {
    // Find sessions that have ended but not yet settled
    const expiredSessionsResult = await query(
      `SELECT 
         ts.id,
         ts.pair_id,
         ts.rule_id,
         ts.open_price,
         tr.direction as rule_direction
       FROM trading_sessions ts
       LEFT JOIN trading_rules tr ON ts.rule_id = tr.id
       WHERE ts.end_at < NOW() 
         AND ts.status IN ('open', 'upcoming')
       ORDER BY ts.end_at ASC
       LIMIT 50`,
      []
    );

    const sessions = expiredSessionsResult.rows;

    if (sessions.length === 0) {
      return;
    }

    console.log(`Found ${sessions.length} expired sessions to settle`);

    for (const session of sessions) {
      try {
        let resultDirection: string;
        let settlementPrice: number;

        // If session has a rule with predetermined direction, use that
        if (session.rule_id && session.rule_direction) {
          resultDirection = session.rule_direction;
          
          // Get current price for settlement price
          try {
            const priceData = await getPairPrice(session.pair_id);
            settlementPrice = priceData.price;
          } catch (error) {
            console.error(`Failed to get price for pair ${session.pair_id}, using entry price`);
            settlementPrice = parseFloat(session.open_price);
          }
        } else {
          // No predetermined direction - compare current price to entry price
          try {
            const priceData = await getPairPrice(session.pair_id);
            settlementPrice = priceData.price;
            const entryPrice = parseFloat(session.open_price);
            
            resultDirection = settlementPrice >= entryPrice ? 'up' : 'down';
          } catch (error) {
            console.error(`Failed to get price for session ${session.id}, skipping`);
            continue;
          }
        }

        // Settle the session
        const result = await settleSession(session.id, resultDirection, settlementPrice);
        
        console.log(
          `Auto-settled session ${session.id}: ${result.total_orders} orders, ` +
          `direction=${resultDirection}, price=${settlementPrice}`
        );
      } catch (error: any) {
        console.error(`Error settling session ${session.id}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('Error in auto-settle:', error.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the auto-settle cron job
 */
export function startAutoSettle(): void {
  if (cronJob) {
    console.log('Auto-settle already started');
    return;
  }

  // Run every 10 seconds
  cronJob = cron.schedule('*/10 * * * * *', async () => {
    await autoSettleSessions();
  });

  console.log('✓ Auto-settle job started (running every 10 seconds)');

  // Run once immediately
  autoSettleSessions();
}

/**
 * Stop the auto-settle job
 */
export function stopAutoSettle(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Auto-settle job stopped');
  }
}
