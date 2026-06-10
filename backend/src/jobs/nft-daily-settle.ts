import cron from 'node-cron';
import { query, transaction } from '../db';
import { buildNFTDailyIncomeNotification, buildNFTMaturityReturnNotification, buildNFTIncomeDescription, buildNFTPrincipalReturnDescription } from '../i18n/nft-notifications';
import { sendCrossBotNotification } from '../utils/cross-bot-notify';

// ── Language normalization ────────────────────────────────────────────────────
const SUPPORTED_LANGS = ['zh', 'en', 'fr', 'de', 'es', 'ar', 'ja'] as const;
const LANG_ALIAS_MAP: Record<string, string> = {
  'zh-hans': 'zh',
  'zh-hant': 'zh',
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'zh-hk': 'zh',
  'fr-fr': 'fr',
  'fr-be': 'fr',
  'fr-ca': 'fr',
  'fr-ch': 'fr',
  'de-de': 'de',
  'de-at': 'de',
  'de-ch': 'de',
  'es-es': 'es',
  'es-mx': 'es',
  'es-ar': 'es',
  'es-419': 'es',
  'ar-sa': 'ar',
  'ar-eg': 'ar',
  'ja-jp': 'ja',
};

/**
 * Normalize a Telegram language_code to one of the 7 supported language codes.
 * Falls back to 'en' if the language is not supported.
 */
function normalizeLang(rawCode: string | null | undefined): string {
  if (!rawCode) return 'en';
  const lower = rawCode.toLowerCase();
  // Direct match
  if ((SUPPORTED_LANGS as readonly string[]).includes(lower)) return lower;
  // Alias map
  if (LANG_ALIAS_MAP[lower]) return LANG_ALIAS_MAP[lower];
  // Prefix match (e.g. 'fr-FR' → 'fr' via prefix 'fr')
  const prefix = lower.split('-')[0];
  if ((SUPPORTED_LANGS as readonly string[]).includes(prefix)) return prefix;
  return 'en';
}

let incomeJob: cron.ScheduledTask | null = null;
let cronJob: cron.ScheduledTask | null = null;
let maturityCronJob: cron.ScheduledTask | null = null;
let isIncomeRunning = false;
let isRunning = false;
let isMaturityRunning = false;

/**
 * Send a Telegram notification to all bots the user has interacted with.
 * Errors are swallowed so that one bad notification doesn't block the rest.
 */
async function sendBotNotification(
  userId: string,
  buildText: (lang: string) => Promise<string> | string
): Promise<void> {
  try {
    await sendCrossBotNotification({
      userId,
      buildMessage: async (lang) => buildText(normalizeLang(lang)),
    });
  } catch (err: any) {
    console.error(`NFT notify error for user_id=${userId}:`, err.message);
  }
}

/**
 * Settle daily income for all active fixed_term NFT holdings.
 * Products with settlement_type='expiry' are skipped here (paid at maturity instead).
 * Returns the total number of successfully settled income records.
 */
async function settleDailyIncome(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" in UTC

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
       AND (p.settlement_type IS NULL OR p.settlement_type = 'daily')
       AND p.daily_yield_rate IS NOT NULL
       AND p.daily_yield_rate > 0
       AND NOT EXISTS (
         SELECT 1 FROM nft_income_records ir
         WHERE ir.holding_id = h.id AND ir.income_date = $1
       )`,
    [today]
  );

  let totalSuccess = 0;

  if (holdingsResult.rows.length > 0) {
    console.log(`NFT daily settle: processing ${holdingsResult.rows.length} holdings`);

    let successCount = 0;
    let errorCount = 0;

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

        const incomeActuallySettled = await transaction(async (client) => {
          // Insert income record (skip if already exists for today)
          const insertResult = await client.query(
            `INSERT INTO nft_income_records (holding_id, user_id, product_id, amount, income_date)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (holding_id, income_date) DO NOTHING
             RETURNING id`,
            [holding.id, holding.user_id, holding.product_id, amountStr, today]
          );

          if ((insertResult.rowCount ?? 0) === 0) {
            console.log(`NFT daily settle: holding ${holding.id} already settled today, skipping`);
            return false;
          }

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

          // Write transactions record for this income
          const lang = normalizeLang(holding.language_code);
          const incomeDesc = buildNFTIncomeDescription({ lang, product_name: holding.product_name, day: currentDay });
          await client.query(
            `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
             SELECT $1, 'nft_income', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
            [holding.user_id, dailyIncome, incomeDesc, String(holding.id)]
          );

          return true;
        });

        if (!incomeActuallySettled) continue;

        // Send bot notification to all associated bots
        if (holding.user_id) {
          await sendBotNotification(String(holding.user_id), async (lang) => buildNFTDailyIncomeNotification({
            lang,
            amount: parseFloat(amountStr).toFixed(2),
            product_name: holding.product_name,
            current_day: currentDay,
            term_days: termDays,
          }));
        }

        console.log(`NFT daily settle: holding ${holding.id} credited ${amountStr} USDT`);
        successCount++;
      } catch (err: any) {
        console.error(`NFT daily settle error for holding ${holding.id}:`, err.message);
        errorCount++;
      }
    }

    console.log(`NFT daily settle: completed. Success: ${successCount}, Failed: ${errorCount} out of ${holdingsResult.rows.length} holdings`);
    totalSuccess += successCount;
  }

  // ── Part 2: product_holdings (Mini-App purchases) ──────────────────────────
  const phResult = await query(
    `SELECT
       ph.id,
       ph.user_id,
       ph.product_id,
       ph.amount AS purchase_price,
       ph.created_at,
       p.name AS product_name,
       p.daily_yield_rate,
       p.term_days,
       u.telegram_id,
       u.bot_id,
       u.language_code
     FROM product_holdings ph
     JOIN nft_products p ON ph.product_id = p.id
     JOIN users u ON ph.user_id = u.id
     WHERE ph.status = 'active'
       AND p.product_type = 'fixed_term'
       AND (p.settlement_type IS NULL OR p.settlement_type = 'daily')
       AND p.daily_yield_rate IS NOT NULL
       AND p.daily_yield_rate > 0
       AND NOT EXISTS (
         SELECT 1 FROM nft_income_records ir
         WHERE ir.holding_id = ph.id AND ir.income_date = $1
       )`,
    [today]
  );

  if (phResult.rows.length > 0) {
    console.log(`NFT daily settle (product_holdings): processing ${phResult.rows.length} holdings`);
    let phSuccess = 0;
    let phError = 0;

    for (const holding of phResult.rows) {
      try {
        const dailyIncome = parseFloat(holding.purchase_price) * parseFloat(holding.daily_yield_rate);
        if (dailyIncome <= 0) continue;

        const amountStr = dailyIncome.toFixed(8);

        const startDate = new Date(holding.created_at);
        const diffMs = Date.now() - startDate.getTime();
        const currentDay = Math.max(1, Math.floor(diffMs / 86400000) + 1);
        const termDays = holding.term_days ?? 30;

        const incomeActuallySettled = await transaction(async (client) => {
          const insertResult = await client.query(
            `INSERT INTO nft_income_records (holding_id, user_id, product_id, amount, income_date)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (holding_id, income_date) DO NOTHING
             RETURNING id`,
            [holding.id, holding.user_id, holding.product_id, amountStr, today]
          );

          if ((insertResult.rowCount ?? 0) === 0) {
            console.log(`NFT daily settle (product_holdings): holding ${holding.id} already settled today, skipping`);
            return false;
          }

          await client.query(
            'UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
            [dailyIncome, holding.user_id]
          );

          // Write transactions record for this income
          const lang = normalizeLang(holding.language_code);
          const incomeDesc = buildNFTIncomeDescription({ lang, product_name: holding.product_name, day: currentDay });
          await client.query(
            `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
             SELECT $1, 'nft_income', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
            [holding.user_id, dailyIncome, incomeDesc, String(holding.id)]
          );

          return true;
        });

        if (!incomeActuallySettled) continue;

        // Update total_income on product_holdings if the column exists (optional, outside transaction)
        await query(
          `UPDATE product_holdings SET total_income = COALESCE(total_income, 0) + $1 WHERE id = $2`,
          [dailyIncome, holding.id]
        ).catch((e: any) => {
          if (!e.message?.includes('column') && !e.message?.includes('total_income')) {
            console.warn(`NFT daily settle (product_holdings): total_income update skipped for holding ${holding.id}:`, e.message);
          }
        });

        if (holding.user_id) {
          await sendBotNotification(String(holding.user_id), async (lang) => buildNFTDailyIncomeNotification({
            lang,
            amount: parseFloat(amountStr).toFixed(2),
            product_name: holding.product_name,
            current_day: currentDay,
            term_days: termDays,
          }));
        }

        console.log(`NFT daily settle (product_holdings): holding ${holding.id} credited ${amountStr} USDT`);
        phSuccess++;
      } catch (err: any) {
        console.error(`NFT daily settle (product_holdings) error for holding ${holding.id}:`, err.message);
        phError++;
      }
    }

    console.log(`NFT daily settle (product_holdings): completed. Success: ${phSuccess}, Failed: ${phError}`);
    totalSuccess += phSuccess;
  }

  return totalSuccess;
}

/**
 * Release matured holdings: return principal from nft_balance to wallet_balance.
 * For settlement_type='expiry', full accumulated income is also paid here once at maturity.
 * Returns the total number of successfully processed principal returns.
 * Handles both explicit expires_at/end_date and NULL fallback via created_at + term_days.
 */
async function releaseMatureHoldings(): Promise<number> {
  const matureResult = await query(
    `SELECT
       h.id,
       h.user_id,
       h.product_id,
       h.purchase_price,
       p.name AS product_name,
       p.settlement_type,
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
       AND p.term_days IS NOT NULL
       AND (
         (h.expires_at IS NOT NULL AND h.expires_at <= NOW())
         OR
         (h.expires_at IS NULL AND (((h.created_at AT TIME ZONE 'UTC')::date + p.term_days)::timestamp + interval '10 hours 5 minutes') <= (NOW() AT TIME ZONE 'UTC'))
       )`,
    []
  );

  let totalSuccess = 0;

  if (matureResult.rows.length > 0) {
    console.log(`NFT mature release: processing ${matureResult.rows.length} expired holdings`);

    let successCount = 0;
    let errorCount = 0;

    for (const holding of matureResult.rows) {
      try {
        const principal = parseFloat(holding.purchase_price);
        const isExpirySettlement = holding.settlement_type === 'expiry';

        const settleResult = await transaction(async (client) => {
          // Idempotency guard: only one worker can settle this active holding
          const markResult = await client.query(
            `UPDATE nft_holdings
             SET status = 'expired', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND status = 'active'
             RETURNING id`,
            [holding.id]
          );

          if ((markResult.rowCount ?? 0) === 0) {
            return { settled: false, expiryIncome: 0 };
          }

          let expiryIncome = 0;
          if (isExpirySettlement && holding.daily_yield_rate && holding.term_days) {
            const termDays = parseInt(String(holding.term_days), 10);
            const totalIncome = principal * parseFloat(holding.daily_yield_rate) * termDays;
            const alreadyCredited = await client.query(
             `SELECT COALESCE(SUM(amount), 0) AS total FROM nft_income_records WHERE holding_id = $1`,
             [holding.id]
            );
            const alreadyPaid = parseFloat(alreadyCredited.rows[0]?.total ?? '0');
            expiryIncome = Math.max(0, totalIncome - alreadyPaid);
          }

          // Decrease nft_balance and increase wallet_balance
          await client.query(
            `UPDATE users
             SET nft_balance = GREATEST(COALESCE(nft_balance, 0) - $1, 0),
                 wallet_balance = COALESCE(wallet_balance, 0) + $2
             WHERE id = $3`,
            [principal, principal + expiryIncome, holding.user_id]
          );

          // Decrease current_holders on product
          await client.query(
            `UPDATE nft_products SET current_holders = GREATEST(COALESCE(current_holders, 0) - 1, 0) WHERE id = $1`,
            [holding.product_id]
          );

          // Write transactions record for principal return
          const lang = normalizeLang(holding.language_code);
          const principalDesc = buildNFTPrincipalReturnDescription({ lang, product_name: holding.product_name });
          await client.query(
            `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
             SELECT $1, 'nft_principal_return', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
            [holding.user_id, principal, principalDesc, String(holding.id)]
          );

          if (isExpirySettlement && expiryIncome > 0) {
            const lang = normalizeLang(holding.language_code);
            const incomeDesc = buildNFTIncomeDescription({ lang, product_name: holding.product_name, day: parseInt(String(holding.term_days), 10) });
            await client.query(
              `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
               SELECT $1, 'nft_income', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
              [holding.user_id, expiryIncome, incomeDesc, String(holding.id)]
            );
            const today = new Date().toISOString().slice(0, 10);
            await client.query(
              `INSERT INTO nft_income_records (holding_id, user_id, product_id, amount, income_date)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (holding_id, income_date) DO NOTHING`,
              [holding.id, holding.user_id, holding.product_id, expiryIncome.toFixed(8), today]
            );
            await client.query(
              'UPDATE nft_holdings SET total_income = COALESCE(total_income, 0) + $1 WHERE id = $2',
              [expiryIncome, holding.id]
            );
          }

          return { settled: true, expiryIncome };
        });

        if (!settleResult.settled) {
          console.log(`NFT mature release: holding ${holding.id} already settled, skipping`);
          continue;
        }
        const expiryIncome = settleResult.expiryIncome;

        // Send maturity notification to all associated bots
        if (holding.user_id) {
          await sendBotNotification(String(holding.user_id), async (lang) => buildNFTMaturityReturnNotification({
            lang,
            amount: (principal + expiryIncome).toFixed(2),
            product_name: holding.product_name,
          }));
        }

        console.log(`NFT mature release: holding ${holding.id} principal ${principal} USDT returned${isExpirySettlement && expiryIncome > 0 ? ` + expiry income ${expiryIncome.toFixed(8)} USDT` : ''}`);
        successCount++;
      } catch (err: any) {
        console.error(`NFT mature release error for holding ${holding.id}:`, err.message);
        errorCount++;
      }
    }

    console.log(`NFT mature release: completed. Success: ${successCount}, Failed: ${errorCount} out of ${matureResult.rows.length} holdings`);
    totalSuccess += successCount;
  }

  // ── Part 2: product_holdings (Mini-App purchases) ──────────────────────────
  const phMatureResult = await query(
    `SELECT
       ph.id,
       ph.user_id,
       ph.product_id,
       ph.amount AS purchase_price,
       p.name AS product_name,
       p.settlement_type,
       p.daily_yield_rate,
       p.term_days,
       u.telegram_id,
       u.bot_id,
       u.language_code
     FROM product_holdings ph
     JOIN nft_products p ON ph.product_id = p.id
     JOIN users u ON ph.user_id = u.id
     WHERE ph.status = 'active'
       AND p.product_type = 'fixed_term'
       AND p.term_days IS NOT NULL
       AND (
         (ph.end_date IS NOT NULL AND ph.end_date::timestamp + interval '10 hours 5 minutes' <= NOW())
         OR
         (ph.end_date IS NULL AND (((ph.created_at AT TIME ZONE 'UTC')::date + p.term_days)::timestamp + interval '10 hours 5 minutes') <= (NOW() AT TIME ZONE 'UTC'))
       )`,
    []
  );

  if (phMatureResult.rows.length > 0) {
    console.log(`NFT mature release (product_holdings): processing ${phMatureResult.rows.length} expired holdings`);

    let phSuccessCount = 0;
    let phErrorCount = 0;

    for (const holding of phMatureResult.rows) {
      try {
        const principal = parseFloat(holding.purchase_price);
        const isExpirySettlement = holding.settlement_type === 'expiry';

        const settleResult = await transaction(async (client) => {
          // Idempotency guard: only one worker can settle this active holding
          const markResult = await client.query(
            `UPDATE product_holdings
             SET status = 'expired'
             WHERE id = $1 AND status = 'active'
             RETURNING id`,
            [holding.id]
          );

          if ((markResult.rowCount ?? 0) === 0) {
            return { settled: false, expiryIncome: 0 };
          }

          let expiryIncome = 0;
          if (isExpirySettlement && holding.daily_yield_rate && holding.term_days) {
            const termDays = parseInt(String(holding.term_days), 10);
            const totalIncome = principal * parseFloat(holding.daily_yield_rate) * termDays;
            const alreadyCredited = await client.query(
             `SELECT COALESCE(SUM(amount), 0) AS total FROM nft_income_records WHERE holding_id = $1`,
             [holding.id]
            );
            const alreadyPaid = parseFloat(alreadyCredited.rows[0]?.total ?? '0');
            expiryIncome = Math.max(0, totalIncome - alreadyPaid);
          }

          await client.query(
            `UPDATE users
             SET nft_balance = GREATEST(COALESCE(nft_balance, 0) - $1, 0),
                 wallet_balance = COALESCE(wallet_balance, 0) + $2
             WHERE id = $3`,
            [principal, principal + expiryIncome, holding.user_id]
          );

          await client.query(
            `UPDATE nft_products SET current_holders = GREATEST(COALESCE(current_holders, 0) - 1, 0) WHERE id = $1`,
            [holding.product_id]
          );

          // Write transactions record for principal return
          const lang = normalizeLang(holding.language_code);
          const principalDesc = buildNFTPrincipalReturnDescription({ lang, product_name: holding.product_name });
          await client.query(
            `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
             SELECT $1, 'nft_principal_return', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
            [holding.user_id, principal, principalDesc, String(holding.id)]
          );

          if (isExpirySettlement && expiryIncome > 0) {
            const lang = normalizeLang(holding.language_code);
            const incomeDesc = buildNFTIncomeDescription({ lang, product_name: holding.product_name, day: parseInt(String(holding.term_days), 10) });
            await client.query(
              `INSERT INTO transactions (user_id, type, amount, balance_after, description, reference_id)
               SELECT $1, 'nft_income', $2, wallet_balance, $3, $4 FROM users WHERE id = $1`,
              [holding.user_id, expiryIncome, incomeDesc, String(holding.id)]
            );
            const today = new Date().toISOString().slice(0, 10);
            await client.query(
              `INSERT INTO nft_income_records (holding_id, user_id, product_id, amount, income_date)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (holding_id, income_date) DO NOTHING`,
              [holding.id, holding.user_id, holding.product_id, expiryIncome.toFixed(8), today]
            );
            await client.query(
              'UPDATE product_holdings SET total_income = COALESCE(total_income, 0) + $1 WHERE id = $2',
              [expiryIncome, holding.id]
            );
          }

          return { settled: true, expiryIncome };
        });

        if (!settleResult.settled) {
          console.log(`NFT mature release (product_holdings): holding ${holding.id} already settled, skipping`);
          continue;
        }
        const expiryIncome = settleResult.expiryIncome;

        if (holding.user_id) {
          await sendBotNotification(String(holding.user_id), async (lang) => buildNFTMaturityReturnNotification({
            lang,
            amount: (principal + expiryIncome).toFixed(2),
            product_name: holding.product_name,
          }));
        }

        console.log(`NFT mature release (product_holdings): holding ${holding.id} principal ${principal} USDT returned${isExpirySettlement && expiryIncome > 0 ? ` + expiry income ${expiryIncome.toFixed(8)} USDT` : ''}`);
        phSuccessCount++;
      } catch (err: any) {
        console.error(`NFT mature release (product_holdings) error for holding ${holding.id}:`, err.message);
        phErrorCount++;
      }
    }

    console.log(`NFT mature release (product_holdings): completed. Success: ${phSuccessCount}, Failed: ${phErrorCount} out of ${phMatureResult.rows.length} holdings`);
    totalSuccess += phSuccessCount;
  }

  return totalSuccess;
}

/**
 * Income-only settlement function.
 * Called by the daily cron at UTC 10:00.
 */
export async function runNFTDailyIncome(): Promise<{ income_count: number }> {
  if (isIncomeRunning) {
    console.log('NFT daily income already running, skipping...');
    return { income_count: 0 };
  }
  isIncomeRunning = true;
  try {
    console.log('NFT daily income: starting...');
    const income_count = await settleDailyIncome();
    console.log(`NFT daily income: complete. Income: ${income_count}`);
    return { income_count };
  } catch (err: any) {
    console.error('NFT daily income error:', err.message);
    return { income_count: 0 };
  } finally {
    isIncomeRunning = false;
  }
}

/**
 * Main daily settlement function (income + principal release).
 * Called manually or by the admin trigger endpoint.
 * Returns a summary of how many income records and principal refunds were processed.
 */
export async function runNFTDailySettle(): Promise<{ income_count: number; refund_count: number }> {
  if (isRunning) {
    console.log('NFT daily settle already running, skipping...');
    return { income_count: 0, refund_count: 0 };
  }
  if (isIncomeRunning) {
    console.log('NFT daily income already running, skipping settle to avoid duplicate income...');
    return { income_count: 0, refund_count: 0 };
  }
  isRunning = true;
  isIncomeRunning = true;
  try {
    console.log('NFT daily settle: starting...');
    const income_count = await settleDailyIncome();
    const refund_count = await releaseMatureHoldings();
    console.log(`NFT daily settle: complete. Income: ${income_count}, Refunds: ${refund_count}`);
    return { income_count, refund_count };
  } catch (err: any) {
    console.error('NFT daily settle error:', err.message);
    return { income_count: 0, refund_count: 0 };
  } finally {
    isRunning = false;
    isIncomeRunning = false;
  }
}

/**
 * Hourly maturity check — only releases expired principal.
 * Safe to run frequently; no duplicate income is produced.
 */
export async function runNFTMaturityCheck(): Promise<void> {
  if (isMaturityRunning) {
    console.log('NFT maturity check already running, skipping...');
    return;
  }
  isMaturityRunning = true;
  try {
    console.log('NFT maturity check: starting...');
    await releaseMatureHoldings();
    console.log('NFT maturity check: complete');
  } catch (err: any) {
    console.error('NFT maturity check error:', err.message);
  } finally {
    isMaturityRunning = false;
  }
}

/**
 * Start the NFT settlement cron jobs:
 *  - incomeJob:  UTC 10:00 daily — settles daily income for all active holdings
 *  - cronJob:    UTC 10:05 daily — releases matured principal after income is settled
 */
export function startNFTDailySettle(): void {
  if (!incomeJob) {
    // Runs at 10:00 UTC every day — income settlement only
    incomeJob = cron.schedule('0 10 * * *', async () => {
      await runNFTDailyIncome();
    });
    console.log('✓ NFT daily income job started (runs at 10:00 UTC daily)');
  } else {
    console.log('NFT daily income job already started');
  }

  if (!cronJob) {
    // Runs at 10:05 UTC every day — principal release only
    cronJob = cron.schedule('5 10 * * *', async () => {
      await releaseMatureHoldings();
    });
    console.log('✓ NFT principal release job started (runs at 10:05 UTC daily)');
  } else {
    console.log('NFT principal release job already started');
  }
}

/**
 * Stop all NFT settlement jobs.
 */
export function stopNFTDailySettle(): void {
  if (incomeJob) {
    incomeJob.stop();
    incomeJob = null;
    console.log('NFT daily income job stopped');
  }
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('NFT principal release job stopped');
  }
  if (maturityCronJob) {
    maturityCronJob.stop();
    maturityCronJob = null;
    console.log('NFT maturity check job stopped');
  }
}
