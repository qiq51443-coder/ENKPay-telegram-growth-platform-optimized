import { PoolClient } from 'pg';
import { transaction } from '../db';

interface SettlementResult {
  total_orders: number;
  total_bet_amount: number;
  total_payout: number;
  platform_profit: number;
  winning_orders: number;
  losing_orders: number;
  draw_orders: number;
  result_direction: string;
}

export interface ExecuteSettlementResult {
  totalBetAmount: number;
  totalPayout: number;
  winningOrders: number;
  losingOrders: number;
  drawOrders: number;
}

/**
 * Core settlement executor – shared by auto-settle, force-settle, and admin manual-settle.
 *
 * Applies WIN / LOSE / DRAW logic to the supplied orders inside the caller's
 * already-open database transaction, using batch SQL to minimise round-trips:
 *
 *   • One UPDATE to credit wallet_balance for all winners / draw refunds.
 *   • One UPDATE to increment reward_unlock_traded for all participants.
 *   • One UPDATE to mark every order as settled with its result and profit.
 *
 * The caller is responsible for:
 *   – Acquiring a row-level lock on trading_sessions (FOR UPDATE) before calling.
 *   – Promoting pending orders to active if needed.
 *   – Updating trading_sessions after this call returns.
 *   – Inserting the trading_settlement_log record.
 *
 * @param client          Open pg PoolClient (inside a transaction).
 * @param orders          Active orders for the session.
 * @param resultDirection 'up' | 'down' | 'draw'
 * @param closePrice      Settlement close price.
 * @param openPrice       Session open price (used for order entry_price backfill).
 * @param ruleOdds        Default odds from the trading rule (fallback when order.odds is null).
 */
export async function executeSettlement(
  client: PoolClient,
  orders: Array<{ id: number; user_id: number; direction: string; amount: any; odds?: any }>,
  resultDirection: string,
  closePrice: number,
  openPrice: number,
  ruleOdds: number
): Promise<ExecuteSettlementResult> {
  if (orders.length === 0) {
    return { totalBetAmount: 0, totalPayout: 0, winningOrders: 0, losingOrders: 0, drawOrders: 0 };
  }

  let totalBetAmount = 0;
  let totalPayout = 0;
  let winningOrders = 0;
  let losingOrders = 0;
  let drawOrders = 0;

  // Compute per-order results in memory
  const orderIds: number[] = [];
  const orderResults: string[] = [];
  const orderProfits: number[] = [];

  // Aggregate payouts and traded amounts per user to avoid duplicate-user issues in batch UPDATE
  const payoutByUser = new Map<number, number>();
  const amountByUser = new Map<number, number>();

  for (const order of orders) {
    const amount = parseFloat(order.amount);
    const orderOdds = order.odds ? parseFloat(order.odds) : ruleOdds;

    totalBetAmount += amount;
    amountByUser.set(order.user_id, (amountByUser.get(order.user_id) ?? 0) + amount);

    let orderResult: string;
    let profit: number;
    let payout = 0;

    if (resultDirection === 'draw') {
      orderResult = 'draw';
      profit = 0;
      payout = amount;
      drawOrders++;
    } else if (order.direction === resultDirection) {
      orderResult = 'win';
      payout = amount * orderOdds;
      profit = payout - amount;
      winningOrders++;
    } else {
      orderResult = 'lose';
      payout = 0;
      profit = -amount;
      losingOrders++;
    }

    totalPayout += payout;
    if (payout > 0) {
      payoutByUser.set(order.user_id, (payoutByUser.get(order.user_id) ?? 0) + payout);
    }

    orderIds.push(order.id);
    orderResults.push(orderResult);
    orderProfits.push(profit);
  }

  // Batch credit wallet_balance for winners and draw refunds
  if (payoutByUser.size > 0) {
    const payoutUserIds = Array.from(payoutByUser.keys());
    const payoutAmounts = payoutUserIds.map((uid) => payoutByUser.get(uid)!);
    await client.query(
      `UPDATE users u
       SET wallet_balance = wallet_balance + v.payout
       FROM (SELECT unnest($1::int[]) AS user_id, unnest($2::numeric[]) AS payout) v
       WHERE u.id = v.user_id`,
      [payoutUserIds, payoutAmounts]
    );
  }

  // Batch increment reward_unlock_traded for all participants
  const allUserIds = Array.from(amountByUser.keys());
  const allAmounts = allUserIds.map((uid) => amountByUser.get(uid)!);
  await client.query(
    `UPDATE users u
     SET reward_unlock_traded = COALESCE(reward_unlock_traded, 0) + v.amount
     FROM (SELECT unnest($1::int[]) AS user_id, unnest($2::numeric[]) AS amount) v
     WHERE u.id = v.user_id`,
    [allUserIds, allAmounts]
  );

  // Batch settle all orders
  await client.query(
    `UPDATE trading_orders
     SET result           = v.result,
         profit           = v.profit,
         close_price      = $4,
         settlement_price = $4,
         settled_at       = NOW(),
         status           = 'settled'
     FROM (SELECT unnest($1::int[]) AS id,
                  unnest($2::text[]) AS result,
                  unnest($3::numeric[]) AS profit) v
     WHERE trading_orders.id = v.id`,
    [orderIds, orderResults, orderProfits, closePrice]
  );

  return { totalBetAmount, totalPayout, winningOrders, losingOrders, drawOrders };
}

/**
 * Settle a trading session
 *
 * This service is used by the admin manual-settlement API.
 * The caller (admin route) is responsible for computing `resultDirection`
 * based on the actual close price vs. open price before calling this function.
 * Do NOT pass a direction derived from a trading_rule's direction field unless
 * that rule explicitly has force_result = true.
 *
 * Settlement logic:
 * - WIN: order.direction === resultDirection → user receives amount × odds
 * - LOSE: order.direction !== resultDirection → user gets nothing (already paid when placing order)
 * - DRAW: full refund of the bet amount
 *
 * @param sessionId - The trading session to settle
 * @param resultDirection - The actual result: 'up', 'down', or 'draw' (must be based on real price comparison)
 * @param settlementPrice - The final price used for settlement
 * @returns Settlement summary
 */
export async function settleSession(
  sessionId: number,
  resultDirection: string,
  settlementPrice: number,
  options?: { openPrice?: number }
): Promise<SettlementResult> {
  return await transaction(async (client) => {
    // Validate result direction
    if (!['up', 'down', 'draw'].includes(resultDirection)) {
      throw new Error('Invalid result direction. Must be "up", "down", or "draw"');
    }

    // Get session details
    const sessionResult = await client.query(
      `SELECT id, status, rule_id, duration_seconds FROM trading_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error(`Trading session ${sessionId} not found`);
    }

    const session = sessionResult.rows[0];

    if (session.status === 'settled') {
      throw new Error(`Trading session ${sessionId} is already settled`);
    }

    // Promote pending session and orders to active before settling
    if (session.status === 'pending') {
      await client.query(
        `UPDATE trading_sessions SET status = 'active' WHERE id = $1 AND status = 'pending'`,
        [sessionId]
      );
      await client.query(
        `UPDATE trading_orders SET status = 'active' WHERE session_id = $1 AND status = 'pending'`,
        [sessionId]
      );
    }

    // Get trading rule for this session (if exists)
    let ruleOdds = 1.85; // Default odds
    let ruleId = session.rule_id;

    if (!ruleId) {
      // Try to find a global default rule for this duration
      const globalRuleResult = await client.query(
        `SELECT id, odds FROM trading_rules
         WHERE pair_id IS NULL AND duration_seconds = $1 AND is_active = true
         ORDER BY id ASC LIMIT 1`,
        [session.duration_seconds]
      );
      if (globalRuleResult.rows.length > 0) {
        ruleId = globalRuleResult.rows[0].id;
        ruleOdds = parseFloat(globalRuleResult.rows[0].odds);
      }
    } else {
      const ruleResult = await client.query(
        `SELECT id, odds FROM trading_rules WHERE id = $1`,
        [ruleId]
      );

      if (ruleResult.rows.length > 0) {
        ruleOdds = parseFloat(ruleResult.rows[0].odds);
      }
    }

    // Get all orders for this session (pending orders were already promoted to active above)
    const ordersResult = await client.query(
      `SELECT id, user_id, direction, amount, odds
       FROM trading_orders
       WHERE session_id = $1 AND status = 'active'`,
      [sessionId]
    );

    const orders = ordersResult.rows;

    if (orders.length === 0) {
      // No orders to settle
      await client.query(
        `UPDATE trading_sessions
         SET status = 'settled',
             result_direction = $1,
             result = $1,
             settlement_price = $2,
             close_price = $2,
             open_price = COALESCE(open_price, $3),
             total_bet_amount = 0,
             total_payout = 0,
             order_count = 0,
             settled_at = NOW()
         WHERE id = $4`,
        [resultDirection, settlementPrice, options?.openPrice ?? null, sessionId]
      );

      return {
        total_orders: 0,
        total_bet_amount: 0,
        total_payout: 0,
        platform_profit: 0,
        winning_orders: 0,
        losing_orders: 0,
        draw_orders: 0,
        result_direction: resultDirection,
      };
    }

    // Delegate order settlement to shared core function (uses batch SQL)
    const {
      totalBetAmount,
      totalPayout,
      winningOrders,
      losingOrders,
      drawOrders,
    } = await executeSettlement(
      client,
      orders,
      resultDirection,
      settlementPrice,
      options?.openPrice ?? settlementPrice,
      ruleOdds
    );

    const platformProfit = totalBetAmount - totalPayout;

    // Update session
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
           order_count = $7,
           settled_at = NOW()
       WHERE id = $6`,
      [resultDirection, settlementPrice, options?.openPrice ?? null, totalBetAmount, totalPayout, sessionId, orders.length]
    );

    // Log settlement
    await client.query(
      `INSERT INTO trading_settlement_log
       (session_id, rule_id, result_direction, settlement_price, total_orders, 
        total_bet_amount, total_payout, platform_profit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sessionId,
        ruleId,
        resultDirection,
        settlementPrice,
        orders.length,
        totalBetAmount,
        totalPayout,
        platformProfit,
      ]
    );

    console.log(
      `✓ Settled session ${sessionId}: ${orders.length} orders, ` +
      `${winningOrders} wins, ${losingOrders} losses, ${drawOrders} draws, ` +
      `platform profit: $${platformProfit.toFixed(2)}`
    );

    return {
      total_orders: orders.length,
      total_bet_amount: totalBetAmount,
      total_payout: totalPayout,
      platform_profit: platformProfit,
      winning_orders: winningOrders,
      losing_orders: losingOrders,
      draw_orders: drawOrders,
      result_direction: resultDirection,
    };
  });
}
