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
 *  2. 对每个 session 通过 Binance kline API 获取 close_price 和 open_price
 *  3. 调用统一的 settleSession() 完成结算（含事务、日志、余额发放）
 *  4. 对无法获取价格的 sessions 执行 cancel + refund
 */

import dotenv from 'dotenv';
dotenv.config();

import { query, transaction } from '../db';
import { binanceFetch, getPairPrice } from '../services/price.service';
import { settleSession } from '../services/trading-settlement.service';

async function cancelSessionAndRefund(sessionId: string): Promise<void> {
  await transaction(async (client) => {
    const checkResult = await client.query(
      `SELECT status FROM trading_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (
      !checkResult.rows.length ||
      checkResult.rows[0].status === 'settled' ||
      checkResult.rows[0].status === 'expired'
    ) return;

    const ordersResult = await client.query(
      `SELECT id, user_id, amount FROM trading_orders WHERE session_id = $1 AND status IN ('active', 'pending')`,
      [sessionId]
    );

    if (ordersResult.rows.length > 0) {
      // Aggregate refund amounts per user (multiple orders possible)
      const refundByUser = new Map<string, number>();
      const orderIds: string[] = [];
      for (const order of ordersResult.rows) {
        const amount = parseFloat(order.amount);
        refundByUser.set(order.user_id, (refundByUser.get(order.user_id) ?? 0) + amount);
        orderIds.push(order.id);
      }

      const userIds = Array.from(refundByUser.keys());
      const amounts = userIds.map((uid) => refundByUser.get(uid)!);

      await client.query(
        `UPDATE users u
         SET wallet_balance = wallet_balance + v.refund
         FROM (SELECT unnest($1::uuid[]) AS user_id, unnest($2::numeric[]) AS refund) v
         WHERE u.id = v.user_id`,
        [userIds, amounts]
      );

      await client.query(
        `UPDATE trading_orders
         SET status = 'cancelled', result = 'draw', profit = 0
         WHERE id = ANY($1::uuid[])`,
        [orderIds]
      );
    }

    await client.query(
      `UPDATE trading_sessions SET status = 'expired', settled_at = NOW() WHERE id = $1`,
      [sessionId]
    );
  });
  console.log(`[force-settle] session ${sessionId}: expired and all orders refunded`);
}

async function forceSettleStuckSessions(): Promise<void> {
  console.log('[force-settle] Starting force-settle for all stuck sessions...');

  const expiredResult = await query(
    `SELECT
       ts.id,
       ts.pair_id,
       ts.start_time,
       ts.end_time,
       ts.status,
       ts.open_price,
       ts.settlement_price,
       tp.pair_type,
       tp.binance_symbol
     FROM trading_sessions ts
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

      // Resolve close price: admin-preset settlement_price first, then Binance/price_points
      let closePrice: number | null = null;

      if (session.settlement_price != null) {
        closePrice = parseFloat(session.settlement_price);
        console.log(`[force-settle] session ${session.id}: using admin-preset settlement_price=${closePrice}`);
      } else if (session.pair_type === 'real' && session.binance_symbol) {
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
            const validKlines = klineData.filter((k: any[]) => k[0] <= endTimeMs);
            if (validKlines.length === 0) throw new Error(`No valid kline at or before end_time for session ${session.id}`);
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
            // closePrice remains null
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
            // closePrice remains null
          }
        }
      }

      if (closePrice == null) {
        console.warn(`[force-settle] session ${session.id}: no price available, cancelling and refunding...`);
        await cancelSessionAndRefund(session.id);
        continue;
      }

      // Resolve open price
      let openPrice: number | undefined;
      if (session.open_price != null) {
        openPrice = parseFloat(session.open_price);
      } else if (session.pair_type === 'real' && session.binance_symbol && session.start_time) {
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
          }
        } catch (err: any) {
          console.warn(`[force-settle] session ${session.id}: cannot get open_price (${err.message}), will settle as draw`);
        }
      }

      // Delegate all settlement logic to the unified service
      const summary = await settleSession(session.id, closePrice, openPrice);

      console.log(
        `[force-settle] session ${session.id} SETTLED: result=${summary.resultDirection}, ` +
        `orders=${summary.totalOrders} (win=${summary.winningOrders}, lose=${summary.losingOrders}, draw=${summary.drawOrders})`
      );
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
