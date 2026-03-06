import cron from 'node-cron';
import { query, transaction } from '../db';

/**
 * Distribute daily yield for all active product holdings
 * Runs at UTC+8 00:05 = UTC 16:05
 */
async function distributeDailyYield(): Promise<void> {
  console.log('[nft-yield] Starting daily yield distribution...');
  try {
    const holdings = await query(
      `SELECT ph.id, ph.user_id, ph.product_id, ph.amount,
              p.daily_yield_rate, p.name as product_name
       FROM product_holdings ph
       JOIN nft_products p ON ph.product_id = p.id
       WHERE ph.status = 'active' AND ph.end_date >= CURRENT_DATE`,
      []
    );

    for (const holding of holdings.rows) {
      const dailyYield = parseFloat(holding.amount) * parseFloat(holding.daily_yield_rate || '0.005');
      if (dailyYield <= 0) continue;

      await transaction(async (client) => {
        await client.query(
          `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
          [dailyYield, holding.user_id]
        );
        await client.query(
          `UPDATE product_holdings SET total_yield = COALESCE(total_yield, 0) + $1 WHERE id = $2`,
          [dailyYield, holding.id]
        );
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
           SELECT $1, 'product_yield', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
          [holding.user_id, dailyYield, `定期产品每日收益: ${holding.product_name}`, holding.product_id]
        );
      });
    }

    console.log(`[nft-yield] Daily yield distributed for ${holdings.rows.length} holdings`);
  } catch (error) {
    console.error('[nft-yield] Daily yield error:', error);
  }
}

/**
 * Refund principal for expired product holdings
 * Runs at UTC+8 00:10 = UTC 16:10
 */
async function refundExpiredHoldings(): Promise<void> {
  console.log('[nft-yield] Starting expired holdings refund...');
  try {
    const expired = await query(
      `SELECT ph.id, ph.user_id, ph.product_id, ph.amount,
              p.name as product_name
       FROM product_holdings ph
       JOIN nft_products p ON ph.product_id = p.id
       WHERE ph.status = 'active' AND ph.end_date < CURRENT_DATE`,
      []
    );

    for (const holding of expired.rows) {
      await transaction(async (client) => {
        await client.query(
          `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
          [holding.amount, holding.user_id]
        );
        await client.query(
          `UPDATE product_holdings SET status = 'completed' WHERE id = $1`,
          [holding.id]
        );
        await client.query(
          `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
           SELECT $1, 'product_refund', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
          [holding.user_id, holding.amount, `定期产品到期退款: ${holding.product_name}`, holding.product_id]
        );
      });
    }

    console.log(`[nft-yield] Refunded ${expired.rows.length} expired holdings`);
  } catch (error) {
    console.error('[nft-yield] Refund error:', error);
  }
}

export function startNftYieldJobs(): void {
  // Daily yield: UTC+8 00:05 = UTC 16:05
  cron.schedule('5 16 * * *', distributeDailyYield);

  // Daily refund: UTC+8 00:10 = UTC 16:10
  cron.schedule('10 16 * * *', refundExpiredHoldings);

  console.log('[nft-yield] Yield and refund cron jobs scheduled');
}
