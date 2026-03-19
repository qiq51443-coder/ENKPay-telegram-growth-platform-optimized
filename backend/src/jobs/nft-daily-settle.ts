import cron from 'node-cron';
import { query, transaction } from '../db';
import { TelegramAPI } from '../utils/telegram';
import { buildNFTDailyIncomeNotification, buildNFTMaturityReturnNotification } from '../i18n/nft-notifications';

let cronJob: cron.ScheduledTask | null = null;
let isRunning = false;

/**
 * Send a Telegram message to a user via their bot token.
 * Errors are swallowed so that one bad notification doesn't block the rest.
 */
async function sendBotNotification(
  telegramId: number,
  botId: string,
  text: string
): Promise<void> {
  try {
    const botResult = await query(
      'SELECT token FROM bots WHERE id = $1 AND is_active = true',
      [botId]
    );
    if (botResult.rows.length === 0) return;
    const api = new TelegramAPI(botResult.rows[0].token);
    await api.sendMessage(telegramId, text);
  } catch (err: any) {
    console.error(`NFT notify error for telegram_id=${telegramId}:`, err.message);
  }
}

/**
 * Settle daily income for all active fixed_term NFT holdings.
 */
async function settleDailyIncome(): Promise<void> {
  // Use local date string to avoid UTC vs local timezone issues
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Find all active fixed_term holdings that haven't been settled today
  const holdingsResult = await query(
    `SELECT
       h.id,
       h.user_id,
       h.product_id,
       h.purchase_price,
       h.created_at,
       p.name AS product_name,
       p.daily_yield_rate,
       p.term_days,
       u.telegram_id,
       u.bot_id,
       u.language_code
     FROM nft_holdings h
     JOIN nft_products p ON h.product_id = p.id
     JOIN users u ON h.user_id = u.id
     WHERE h.status = 'active'
       AND p.product_type = 'fixed_term'
       AND p.daily_yield_rate IS NOT NULL
       AND p.daily_yield_rate > 0
       AND NOT EXISTS (
         SELECT 1 FROM nft_income_records ir
         WHERE ir.holding_id = h.id AND ir.income_date = $1
       )`,
    [today]
  );

  if (holdingsResult.rows.length === 0) return;

  console.log(`NFT daily settle: processing ${holdingsResult.rows.length} holdings`);

  for (const holding of holdingsResult.rows) {
    try {
      const dailyIncome = parseFloat(holding.purchase_price) * parseFloat(holding.daily_yield_rate);
      if (dailyIncome <= 0) continue;

      const amountStr = dailyIncome.toFixed(8);

      // Calculate current day number
      const startDate = new Date(holding.created_at);
      const diffMs = Date.now() - startDate.getTime();
      const currentDay = Math.max(1, Math.floor(diffMs / 86400000) + 1);
      const termDays = holding.term_days ?? 30;

      await transaction(async (client) => {
        // Insert income record (skip if already exists for today)
        await client.query(
          `INSERT INTO nft_income_records (holding_id, user_id, product_id, amount, income_date)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (holding_id, income_date) DO NOTHING`,
          [holding.id, holding.user_id, holding.product_id, amountStr, today]
        );

        // Add income to wallet_balance
        await client.query(
          'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
          [dailyIncome, holding.user_id]
        );

        // Update total_income on holding
        await client.query(
          'UPDATE nft_holdings SET total_income = COALESCE(total_income, 0) + $1 WHERE id = $2',
          [dailyIncome, holding.id]
        );
      });

      // Send bot notification
      if (holding.telegram_id && holding.bot_id) {
        const lang = (holding.language_code || 'en').split('-')[0];
        const text = buildNFTDailyIncomeNotification({
          lang,
          amount: parseFloat(amountStr).toFixed(2),
          product_name: holding.product_name,
          current_day: currentDay,
          term_days: termDays,
        });
        await sendBotNotification(holding.telegram_id, holding.bot_id, text);
      }

      console.log(`NFT daily settle: holding ${holding.id} credited ${amountStr} USDT`);
    } catch (err: any) {
      console.error(`NFT daily settle error for holding ${holding.id}:`, err.message);
    }
  }
}

/**
 * Release matured holdings: return principal from nft_balance to wallet_balance.
 */
async function releaseMatureHoldings(): Promise<void> {
  const matureResult = await query(
    `SELECT
       h.id,
       h.user_id,
       h.product_id,
       h.purchase_price,
       p.name AS product_name,
       u.telegram_id,
       u.bot_id,
       u.language_code
     FROM nft_holdings h
     JOIN nft_products p ON h.product_id = p.id
     JOIN users u ON h.user_id = u.id
     WHERE h.status = 'active'
       AND h.expires_at IS NOT NULL
       AND h.expires_at <= NOW()`,
    []
  );

  if (matureResult.rows.length === 0) return;

  console.log(`NFT mature release: processing ${matureResult.rows.length} expired holdings`);

  for (const holding of matureResult.rows) {
    try {
      const principal = parseFloat(holding.purchase_price);

      await transaction(async (client) => {
        // Mark holding as expired
        await client.query(
          `UPDATE nft_holdings SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [holding.id]
        );

        // Decrease nft_balance and increase wallet_balance
        await client.query(
          `UPDATE users
           SET nft_balance = GREATEST(COALESCE(nft_balance, 0) - $1, 0),
               wallet_balance = COALESCE(wallet_balance, 0) + $1
           WHERE id = $2`,
          [principal, holding.user_id]
        );

        // Decrease current_holders on product
        await client.query(
          `UPDATE nft_products SET current_holders = GREATEST(COALESCE(current_holders, 0) - 1, 0) WHERE id = $1`,
          [holding.product_id]
        );
      });

      // Send maturity notification
      if (holding.telegram_id && holding.bot_id) {
        const lang = (holding.language_code || 'en').split('-')[0];
        const text = buildNFTMaturityReturnNotification({
          lang,
          amount: principal.toFixed(2),
          product_name: holding.product_name,
        });
        await sendBotNotification(holding.telegram_id, holding.bot_id, text);
      }

      console.log(`NFT mature release: holding ${holding.id} principal ${principal} USDT returned`);
    } catch (err: any) {
      console.error(`NFT mature release error for holding ${holding.id}:`, err.message);
    }
  }
}

/**
 * Main daily settlement function
 */
async function runNFTDailySettle(): Promise<void> {
  if (isRunning) {
    console.log('NFT daily settle already running, skipping...');
    return;
  }
  isRunning = true;
  try {
    console.log('NFT daily settle: starting...');
    await settleDailyIncome();
    await releaseMatureHoldings();
    console.log('NFT daily settle: complete');
  } catch (err: any) {
    console.error('NFT daily settle error:', err.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the NFT daily settlement cron job (runs at 00:05 every day)
 */
export function startNFTDailySettle(): void {
  if (cronJob) {
    console.log('NFT daily settle already started');
    return;
  }

  // Runs at 00:05 server local time every day
  cronJob = cron.schedule('5 0 * * *', async () => {
    await runNFTDailySettle();
  });

  console.log('✓ NFT daily settle job started (runs at 00:05 daily)');
}

/**
 * Stop the NFT daily settlement job
 */
export function stopNFTDailySettle(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('NFT daily settle job stopped');
  }
}
