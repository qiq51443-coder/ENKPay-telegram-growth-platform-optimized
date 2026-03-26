/**
 * force-settle-stuck-sessions.ts
 *
 * 强制结算所有卡住的 trading sessions（跳过 isRunning 锁）
 *
 * 用法 (Render Shell):
 *   cd /project/src/backend && npx ts-node src/scripts/force-settle-stuck-sessions.ts
 *
 * 该脚本会:
 *  1. 查询所有 status IN ('active','pending') AND end_time <= NOW() 的 sessions
 *  2. 对每个 session 通过 Binance kline API 获取 close_price
 *  3. 计算 result_direction 并在事务中结算订单、更新 session 状态
 *  4. 对无法获取价格的 sessions 执行 cancel + refund
 */

import dotenv from 'dotenv';
dotenv.config();

import { query, transaction } from '../db';
import { binanceFetch, getPairPrice } from '../services/price.service';

const DRAW_THRESHOLD_PERCENTAGE = 0.0001;

function determineDirection(openPrice: number, closePrice: number): string {
  if (!isFinite(openPrice) || !isFinite(closePrice) || isNaN(openPrice) || isNaN(closePrice)) {
    return 'draw';
  }
  if (openPrice > 0) {
    const priceDiff = Math.abs(closePrice - openPrice) / openPrice;
    if (priceDiff < DRAW_THRESHOLD_PERCENTAGE) return 'draw';
  }
  return closePrice >= openPrice ? 'up' : 'down';
}

async function cancelSessionAndRefund(sessionId: string): Promise<void> {
  await transaction(async (client) => {
    const checkResult = await client.query(
      `SELECT status FROM trading_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (!checkResult.rows.length || checkResult.rows[0].status === 'settled' || checkResult.rows[0].status === 'cancelled') return;

    const ordersResult = await client.query(
      `SELECT id, user_id, amount FROM trading_orders WHERE session_id = $1 AND status IN ('active', 'pending')`,
      [sessionId]
    );
    for (const order of ordersResult.rows) {
      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
        [parseFloat(order.amount), order.user_id]
      );
      await client.query(
        `UPDATE trading_orders SET status = 'cancelled', result = 'draw', profit = 0 WHERE id = $1`,
        [order.id]
      );
    }
    await client.query(
      `UPDATE trading_sessions SET status = 'cancelled' WHERE id = $1`,
      [sessionId]
    );
  });
  console.log(`[force-settle] session ${sessionId}: cancelled and all orders refunded`);
}

async function forceSettleStuckSessions(): Promise<void> {
  console.log('[force-settle] Starting force-settle for all stuck sessions...');

  const expiredResult = await query(
    `SELECT
       ts.id,
       ts.pair_id,
       ts.rule_id,
       ts.start_time,
       ts.end_time,
       ts.status,
       COALESCE(ts.open_price, ts.entry_price) as open_price,
       ts.result_direction,
       ts.settlement_price,
       tr.direction as rule_direction,
       tr.force_result as rule_force_result,
       tp.pair_type,
       tp.binance_symbol
     FROM trading_sessions ts
     LEFT JOIN trading_rules tr ON ts.rule_id = tr.id
     LEFT JOIN trading_pairs tp ON ts.pair_id = tp.id
     WHERE ts.end_time <= NOW()
       AND ts.status IN ('active', 'pending')
     ORDER BY ts.end_time ASC`,
    []
  );

  const sessions = expiredResult.rows;
  if (sessions.length === 0) {
    console.log('[force-settle] No stuck sessions found.');
    return;
  }

  console.log(`[force-settle] Found ${sessions.length} stuck session(s) to process.`);

  for (const session of sessions) {
    try {
      console.log(`[force-settle] Processing session ${session.id} (pair_id=${session.pair_id}, end_time=${session.end_time})...`);

      // Short-circuit: if the session already has result_direction and settlement_price,
      // use them directly and skip the Binance kline fetch entirely.
      if (session.result_direction && session.settlement_price) {
        const closePrice: number = parseFloat(session.settlement_price);
        const openPrice: number = session.open_price != null ? parseFloat(session.open_price) : closePrice;
        const resultDirection: string = session.result_direction;
        console.log(
          `[force-settle] session ${session.id}: using existing result_direction=${resultDirection}, settlement_price=${closePrice} (skipping kline fetch)`
        );

        let settledOrderCount = 0;
        let settledTotalBetAmount = 0;
        let settledTotalPayout = 0;
        let settledWinningOrders = 0;
        let settledLosingOrders = 0;
        let settledDrawOrders = 0;
        let isSettled = false;

        await transaction(async (client) => {
          const checkResult = await client.query(
            `SELECT status FROM trading_sessions WHERE id = $1 FOR UPDATE`,
            [session.id]
          );
          if (!checkResult.rows.length || checkResult.rows[0].status === 'settled' || checkResult.rows[0].status === 'cancelled') {
            console.log(`[force-settle] session ${session.id}: already ${checkResult.rows[0]?.status ?? 'gone'}, skipping`);
            return;
          }

          if (checkResult.rows[0].status === 'pending') {
            await client.query(
              `UPDATE trading_sessions SET status = 'active' WHERE id = $1 AND status = 'pending'`,
              [session.id]
            );
            await client.query(
              `UPDATE trading_orders SET status = 'active' WHERE session_id = $1 AND status = 'pending'`,
              [session.id]
            );
          }

          const ordersResult = await client.query(
            `SELECT id, user_id, direction, amount, odds, entry_price, status
             FROM trading_orders
             WHERE session_id = $1 AND status IN ('active', 'pending')`,
            [session.id]
          );
          const orders = ordersResult.rows;

          let totalBetAmount = 0;
          let totalPayout = 0;
          let winningOrders = 0;
          let losingOrders = 0;
          let drawOrders = 0;

          let ruleOdds = 1.85;
          if (session.rule_id) {
            const ruleRes = await client.query(`SELECT odds FROM trading_rules WHERE id = $1`, [session.rule_id]);
            if (ruleRes.rows.length > 0) ruleOdds = parseFloat(ruleRes.rows[0].odds);
          } else {
            const globalRule = await client.query(
              `SELECT odds FROM trading_rules WHERE pair_id IS NULL AND is_active = true ORDER BY id ASC LIMIT 1`,
              []
            );
            if (globalRule.rows.length > 0) ruleOdds = parseFloat(globalRule.rows[0].odds);
          }

          for (const order of orders) {
            const amount = parseFloat(order.amount);
            const orderOdds = order.odds ? parseFloat(order.odds) : ruleOdds;
            totalBetAmount += amount;

            let orderResult: string;
            let profit: number;
            let payout: number;

            if (resultDirection === 'draw') {
              orderResult = 'draw';
              profit = 0;
              payout = amount;
              drawOrders++;
              await client.query(
                `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
                [payout, order.user_id]
              );
              totalPayout += payout;
            } else if (order.direction === resultDirection) {
              orderResult = 'win';
              payout = amount * orderOdds;
              profit = payout - amount;
              winningOrders++;
              totalPayout += payout;
              await client.query(
                `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
                [payout, order.user_id]
              );
            } else {
              orderResult = 'lose';
              payout = 0;
              profit = -amount;
              losingOrders++;
            }

            await client.query(
              `UPDATE users SET reward_unlock_traded = COALESCE(reward_unlock_traded, 0) + $1 WHERE id = $2`,
              [amount, order.user_id]
            );

            await client.query(
              `UPDATE trading_orders
               SET result = $1, profit = $2, close_price = $3, settlement_price = $3, settled_at = NOW(), status = 'settled',
                   entry_price = COALESCE(entry_price, $4)
               WHERE id = $5`,
              [orderResult, profit, closePrice, openPrice, order.id]
            );
          }

          await client.query(
            `UPDATE trading_sessions
             SET status = 'settled',
                 result_direction = $1,
                 result = $1,
                 settlement_price = $2,
                 close_price = $2,
                 open_price = COALESCE(open_price, $3),
                 total_bet_amount = $4,
                 total_payout = $5,
                 order_count = $6,
                 settled_at = NOW()
             WHERE id = $7`,
            [resultDirection, closePrice, openPrice, totalBetAmount, totalPayout, orders.length, session.id]
          );

          settledOrderCount = orders.length;
          settledTotalBetAmount = totalBetAmount;
          settledTotalPayout = totalPayout;
          settledWinningOrders = winningOrders;
          settledLosingOrders = losingOrders;
          settledDrawOrders = drawOrders;
          isSettled = true;
        });

        if (isSettled) {
          const platformProfit = settledTotalBetAmount - settledTotalPayout;
          try {
            await query(
              `INSERT INTO trading_settlement_log
               (session_id, rule_id, result_direction, settlement_price, total_orders, total_bet_amount, total_payout, platform_profit)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [session.id, session.rule_id, resultDirection, closePrice, settledOrderCount, settledTotalBetAmount, settledTotalPayout, platformProfit]
            );
          } catch (logErr: any) {
            console.warn(`[force-settle] session ${session.id}: settlement log insert failed (non-critical):`, logErr.message);
          }

          console.log(
            `[force-settle] session ${session.id} SETTLED (from existing result): result=${resultDirection}, close_price=${closePrice} ` +
            `(open=${openPrice}, orders=${settledOrderCount}: win=${settledWinningOrders}, lose=${settledLosingOrders}, draw=${settledDrawOrders})`
          );
        }
        continue;
      }

      let closePrice: number;

      if (session.pair_type === 'real' && session.binance_symbol) {
        const ONE_MINUTE_MS = 60000;
        const KLINE_END_BUFFER_MS = 5000;
        try {
          const endTimeMs = new Date(session.end_time).getTime();
          const klineData = await binanceFetch('/api/v3/klines', {
            symbol: session.binance_symbol,
            interval: '1m',
            startTime: endTimeMs - ONE_MINUTE_MS,
            endTime: endTimeMs + KLINE_END_BUFFER_MS,
            limit: 2,
          });
          if (Array.isArray(klineData) && klineData.length > 0) {
            // Pick the kline whose open time is the latest at or before end_time
            const validKlines = klineData.filter((k: any[]) => k[0] <= endTimeMs);
            if (validKlines.length === 0) throw new Error(`No valid kline at or before end_time for session ${session.id} (endTimeMs=${endTimeMs})`);
            const bestKline = validKlines.reduce((best: any, k: any) => k[0] > best[0] ? k : best, validKlines[0]);
            closePrice = parseFloat(bestKline[4]);
            console.log(`[force-settle] session ${session.id}: Binance kline close_price=${closePrice}`);
          } else {
            throw new Error('No kline data returned');
          }
        } catch (klineErr: any) {
          console.warn(`[force-settle] session ${session.id}: Binance kline failed (${klineErr.message}), trying live price...`);
          try {
            const priceData = await getPairPrice(session.pair_id);
            closePrice = priceData.price;
            console.warn(`[force-settle] session ${session.id}: using live price fallback close_price=${closePrice}`);
          } catch {
            console.warn(`[force-settle] session ${session.id}: no price available, cancelling and refunding...`);
            await cancelSessionAndRefund(session.id);
            continue;
          }
        }
      } else {
        const ppResult = await query(
          `SELECT price FROM price_points
           WHERE pair_id = $1
             AND timestamp BETWEEN ($2::timestamptz - INTERVAL '120 seconds')
                               AND ($2::timestamptz + INTERVAL '30 seconds')
           ORDER BY ABS(EXTRACT(EPOCH FROM (timestamp - $2::timestamptz))) ASC
           LIMIT 1`,
          [session.pair_id, session.end_time]
        );
        if (ppResult.rows.length > 0) {
          closePrice = parseFloat(ppResult.rows[0].price);
        } else {
          try {
            const priceData = await getPairPrice(session.pair_id);
            closePrice = priceData.price;
            console.warn(`[force-settle] session ${session.id}: no price_points, using live price close_price=${closePrice}`);
          } catch {
            console.warn(`[force-settle] session ${session.id}: no price available, cancelling and refunding...`);
            await cancelSessionAndRefund(session.id);
            continue;
          }
        }
      }

      let openPrice: number;
      if (session.open_price == null) {
        if (session.pair_type === 'real' && session.binance_symbol && session.start_time) {
          try {
            const startTimeMs = new Date(session.start_time).getTime();
            const startKlineData = await binanceFetch('/api/v3/klines', {
              symbol: session.binance_symbol,
              interval: '1m',
              startTime: startTimeMs,
              limit: 1,
            });
            if (Array.isArray(startKlineData) && startKlineData.length > 0) {
              openPrice = parseFloat(startKlineData[0][1]);
              console.log(`[force-settle] session ${session.id}: historical open_price=${openPrice}`);
            } else {
              throw new Error('No kline data for start_time');
            }
          } catch (err: any) {
            console.warn(`[force-settle] session ${session.id}: cannot get open_price (${err.message}), cancelling...`);
            await cancelSessionAndRefund(session.id);
            continue;
          }
        } else {
          try {
            const priceData = await getPairPrice(session.pair_id);
            openPrice = priceData.price;
          } catch {
            console.warn(`[force-settle] session ${session.id}: cannot get open_price, cancelling...`);
            await cancelSessionAndRefund(session.id);
            continue;
          }
        }
      } else {
        openPrice = parseFloat(session.open_price);
      }

      let resultDirection: string;
      const adminForceResult = session.rule_force_result === true || session.rule_force_result === 't';
      if (session.rule_id && session.rule_direction && adminForceResult) {
        resultDirection = session.rule_direction;
      } else {
        resultDirection = determineDirection(openPrice, closePrice);
      }

      console.log(`[force-settle] session ${session.id}: open=${openPrice}, close=${closePrice}, result=${resultDirection}`);

      // Settle session + orders in a transaction
      let settledOrderCount = 0;
      let settledTotalBetAmount = 0;
      let settledTotalPayout = 0;
      let settledWinningOrders = 0;
      let settledLosingOrders = 0;
      let settledDrawOrders = 0;
      let isSettled = false;

      await transaction(async (client) => {
        const checkResult = await client.query(
          `SELECT status FROM trading_sessions WHERE id = $1 FOR UPDATE`,
          [session.id]
        );
        if (!checkResult.rows.length || checkResult.rows[0].status === 'settled' || checkResult.rows[0].status === 'cancelled') {
          console.log(`[force-settle] session ${session.id}: already ${checkResult.rows[0]?.status ?? 'gone'}, skipping`);
          return;
        }

        if (checkResult.rows[0].status === 'pending') {
          await client.query(
            `UPDATE trading_sessions SET status = 'active' WHERE id = $1 AND status = 'pending'`,
            [session.id]
          );
          await client.query(
            `UPDATE trading_orders SET status = 'active' WHERE session_id = $1 AND status = 'pending'`,
            [session.id]
          );
        }

        const ordersResult = await client.query(
          `SELECT id, user_id, direction, amount, odds, entry_price, status
           FROM trading_orders
           WHERE session_id = $1 AND status IN ('active', 'pending')`,
          [session.id]
        );
        const orders = ordersResult.rows;

        let totalBetAmount = 0;
        let totalPayout = 0;
        let winningOrders = 0;
        let losingOrders = 0;
        let drawOrders = 0;

        let ruleOdds = 1.85;
        if (session.rule_id) {
          const ruleRes = await client.query(`SELECT odds FROM trading_rules WHERE id = $1`, [session.rule_id]);
          if (ruleRes.rows.length > 0) ruleOdds = parseFloat(ruleRes.rows[0].odds);
        } else {
          const globalRule = await client.query(
            `SELECT odds FROM trading_rules WHERE pair_id IS NULL AND is_active = true ORDER BY id ASC LIMIT 1`,
            []
          );
          if (globalRule.rows.length > 0) ruleOdds = parseFloat(globalRule.rows[0].odds);
        }

        for (const order of orders) {
          const amount = parseFloat(order.amount);
          const orderOdds = order.odds ? parseFloat(order.odds) : ruleOdds;
          totalBetAmount += amount;

          let orderResult: string;
          let profit: number;
          let payout: number;

          if (resultDirection === 'draw') {
            orderResult = 'draw';
            profit = 0;
            payout = amount;
            drawOrders++;
            await client.query(
              `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
              [payout, order.user_id]
            );
            totalPayout += payout;
          } else if (order.direction === resultDirection) {
            orderResult = 'win';
            payout = amount * orderOdds;
            profit = payout - amount;
            winningOrders++;
            totalPayout += payout;
            await client.query(
              `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
              [payout, order.user_id]
            );
          } else {
            orderResult = 'lose';
            payout = 0;
            profit = -amount;
            losingOrders++;
          }

          await client.query(
            `UPDATE users SET reward_unlock_traded = COALESCE(reward_unlock_traded, 0) + $1 WHERE id = $2`,
            [amount, order.user_id]
          );

          await client.query(
            `UPDATE trading_orders
             SET result = $1, profit = $2, close_price = $3, settlement_price = $3, settled_at = NOW(), status = 'settled',
                 entry_price = COALESCE(entry_price, $4)
             WHERE id = $5`,
            [orderResult, profit, closePrice, openPrice, order.id]
          );
        }

        await client.query(
          `UPDATE trading_sessions
           SET status = 'settled',
               result_direction = $1,
               result = $1,
               settlement_price = $2,
               close_price = $2,
               open_price = COALESCE(open_price, $3),
               total_bet_amount = $4,
               total_payout = $5,
               order_count = $6,
               settled_at = NOW()
           WHERE id = $7`,
          [resultDirection, closePrice, openPrice, totalBetAmount, totalPayout, orders.length, session.id]
        );

        settledOrderCount = orders.length;
        settledTotalBetAmount = totalBetAmount;
        settledTotalPayout = totalPayout;
        settledWinningOrders = winningOrders;
        settledLosingOrders = losingOrders;
        settledDrawOrders = drawOrders;
        isSettled = true;
      });

      // Write settlement log OUTSIDE the transaction
      if (isSettled) {
        const platformProfit = settledTotalBetAmount - settledTotalPayout;
        try {
          await query(
            `INSERT INTO trading_settlement_log
             (session_id, rule_id, result_direction, settlement_price, total_orders, total_bet_amount, total_payout, platform_profit)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [session.id, session.rule_id, resultDirection, closePrice, settledOrderCount, settledTotalBetAmount, settledTotalPayout, platformProfit]
          );
        } catch (logErr: any) {
          console.warn(`[force-settle] session ${session.id}: settlement log insert failed (non-critical):`, logErr.message);
        }

        console.log(
          `[force-settle] session ${session.id} SETTLED: result=${resultDirection}, close_price=${closePrice} ` +
          `(open=${openPrice}, orders=${settledOrderCount}: win=${settledWinningOrders}, lose=${settledLosingOrders}, draw=${settledDrawOrders})`
        );
      }
    } catch (err: any) {
      console.error(`[force-settle] Error settling session ${session.id}:`, err.message);
    }
  }

  console.log('[force-settle] Done.');
}

forceSettleStuckSessions()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[force-settle] Fatal error:', err);
    process.exit(1);
  });
