import { PoolClient } from 'pg';
import { transaction } from '../db';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Price difference threshold for a draw (0.01%). */
const DRAW_THRESHOLD_PERCENTAGE = 0.0001;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface OrderSettlementInput {
  orderId: string;
  closePrice: number;
}

export interface OrderSettlementResult {
  orderId: string;
  userId: string;
  direction: 'up' | 'down';
  result: 'win' | 'lose' | 'draw';
  amount: number;
  odds: number;
  payout: number;
  profit: number;
  openPrice: number;
  closePrice: number;
}

export interface SessionSettlementSummary {
  sessionId: string;
  resultDirection: 'up' | 'down' | 'draw';
  totalOrders: number;
  totalBetAmount: number;
  totalPayout: number;
  platformProfit: number;
  winningOrders: number;
  losingOrders: number;
  drawOrders: number;
}

export interface ExecuteSettlementResult {
  totalBetAmount: number;
  totalPayout: number;
  winningOrders: number;
  losingOrders: number;
  drawOrders: number;
}

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------

/**
 * Determine the session result direction from open and close prices.
 *
 * Rules:
 *   closePrice > openPrice (by > 0.01%) → 'up'
 *   closePrice < openPrice (by > 0.01%) → 'down'
 *   |diff| ≤ 0.01%                      → 'draw'
 */
function determineResultDirection(
  openPrice: number,
  closePrice: number
): 'up' | 'down' | 'draw' {
  if (!isFinite(openPrice) || !isFinite(closePrice) || isNaN(openPrice) || isNaN(closePrice)) {
    return 'draw';
  }
  if (openPrice > 0) {
    const priceDiff = Math.abs(closePrice - openPrice) / openPrice;
    if (priceDiff <= DRAW_THRESHOLD_PERCENTAGE) return 'draw';
  }
  return closePrice > openPrice ? 'up' : 'down';
}

/**
 * Determine whether an individual order is a win, lose, or draw.
 *
 * @param direction  The direction the trader bet on ('up' | 'down').
 * @param openPrice  The session open price.
 * @param closePrice The session close price.
 */
export function determineTradeResult(
  direction: 'up' | 'down',
  openPrice: number,
  closePrice: number
): 'win' | 'lose' | 'draw' {
  const resultDirection = determineResultDirection(openPrice, closePrice);
  if (resultDirection === 'draw') return 'draw';
  return direction === resultDirection ? 'win' : 'lose';
}

// ---------------------------------------------------------------------------
// Core batch settlement (internal)
// ---------------------------------------------------------------------------

/**
 * Core settlement executor – used internally by settleOrder and settleSession.
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
  orders: Array<{ id: string; user_id: string; direction: string; amount: any; odds?: any }>,
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

  const orderIds: string[] = [];
  const orderResults: string[] = [];
  const orderProfits: number[] = [];

  // Aggregate payouts and traded amounts per user to avoid duplicate-user issues in batch UPDATE
  const payoutByUser = new Map<string, number>();
  const amountByUser = new Map<string, number>();

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
       FROM (SELECT unnest($1::uuid[]) AS user_id, unnest($2::numeric[]) AS payout) v
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
     FROM (SELECT unnest($1::uuid[]) AS user_id, unnest($2::numeric[]) AS amount) v
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
         entry_price      = COALESCE(entry_price, $5),
         settled_at       = NOW(),
         status           = 'settled'
     FROM (SELECT unnest($1::int[]) AS id,
                  unnest($2::text[]) AS result,
                  unnest($3::numeric[]) AS profit) v
     WHERE trading_orders.id = v.id`,
    [orderIds, orderResults, orderProfits, closePrice, openPrice]
  );

  return { totalBetAmount, totalPayout, winningOrders, losingOrders, drawOrders };
}

// ---------------------------------------------------------------------------
// settleOrder – single-order settlement (idempotent, atomic)
// ---------------------------------------------------------------------------

/**
 * Settle a single trading order.
 *
 * Idempotent: if the order is already 'settled', returns the existing result
 * without any further database writes.
 *
 * @param input.orderId    The order to settle.
 * @param input.closePrice The settlement price used to determine the result.
 */
export async function settleOrder(
  input: OrderSettlementInput
): Promise<OrderSettlementResult> {
  const DEFAULT_ODDS = 1.85;

  return await transaction(async (client) => {
    const orderRes = await client.query(
      `SELECT o.id, o.user_id, o.direction, o.amount, o.odds, o.entry_price,
              o.status, o.result, o.profit, o.close_price,
              ts.rule_id, ts.open_price AS session_open_price
       FROM trading_orders o
       JOIN trading_sessions ts ON o.session_id = ts.id
       WHERE o.id = $1
       FOR UPDATE`,
      [input.orderId]
    );

    if (orderRes.rows.length === 0) {
      throw new Error(`Order ${input.orderId} not found`);
    }

    const order = orderRes.rows[0];

    // Idempotency guard
    if (order.status === 'settled') {
      const amount = parseFloat(order.amount);
      const odds = parseFloat(order.odds ?? DEFAULT_ODDS);
      const result: 'win' | 'lose' | 'draw' = order.result;
      const payout =
        result === 'win' ? amount * odds :
        result === 'draw' ? amount : 0;
      return {
        orderId: order.id,
        userId: order.user_id,
        direction: order.direction,
        result,
        amount,
        odds,
        payout,
        profit: parseFloat(order.profit ?? 0),
        openPrice: parseFloat(order.session_open_price ?? order.entry_price ?? 0),
        closePrice: parseFloat(order.close_price ?? input.closePrice),
      };
    }

    const openPrice = parseFloat(order.entry_price ?? order.session_open_price ?? 0);
    const closePrice = input.closePrice;
    const amount = parseFloat(order.amount);

    // Resolve odds from order, then from rule
    let odds = order.odds ? parseFloat(order.odds) : 0;
    if (!odds || odds <= 0) {
      if (order.rule_id) {
        const ruleRes = await client.query(
          `SELECT odds FROM trading_rules WHERE id = $1`,
          [order.rule_id]
        );
        if (ruleRes.rows.length > 0) odds = parseFloat(ruleRes.rows[0].odds);
      }
      if (!odds || odds <= 0) odds = DEFAULT_ODDS;
    }

    const resultDirection = determineResultDirection(openPrice, closePrice);
    let result: 'win' | 'lose' | 'draw';
    let payout: number;
    let profit: number;

    if (resultDirection === 'draw') {
      result = 'draw';
      payout = amount;
      profit = 0;
    } else if (order.direction === resultDirection) {
      result = 'win';
      payout = amount * odds;
      profit = payout - amount;
    } else {
      result = 'lose';
      payout = 0;
      profit = -amount;
    }

    // Credit payout for winners and draws
    if (payout > 0) {
      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
        [payout, order.user_id]
      );
    }

    // Increment reward_unlock_traded
    await client.query(
      `UPDATE users SET reward_unlock_traded = COALESCE(reward_unlock_traded, 0) + $1 WHERE id = $2`,
      [amount, order.user_id]
    );

    // Update order record
    await client.query(
      `UPDATE trading_orders
       SET result = $1, profit = $2, close_price = $3, settlement_price = $3,
           entry_price = COALESCE(entry_price, $4), settled_at = NOW(), status = 'settled'
       WHERE id = $5`,
      [result, profit, closePrice, openPrice, input.orderId]
    );

    console.log(JSON.stringify({
      event: 'order_settled',
      orderId: input.orderId,
      userId: order.user_id,
      direction: order.direction,
      result,
      amount,
      payout,
    }));

    return {
      orderId: order.id,
      userId: order.user_id,
      direction: order.direction,
      result,
      amount,
      odds,
      payout,
      profit,
      openPrice,
      closePrice,
    };
  });
}

// ---------------------------------------------------------------------------
// settleSession – batch settlement of all active orders in a session
// ---------------------------------------------------------------------------

/**
 * Settle a trading session and all its active orders.
 *
 * Single entry-point for all settlement callers (auto-settle job, admin API,
 * force-settle script). Internally uses batch SQL via executeSettlement() for
 * efficiency.
 *
 * Idempotent: if the session is already 'settled', returns summary data from
 * the existing session record without any further writes.
 *
 * Concurrency-safe: acquires a FOR UPDATE row-lock on trading_sessions before
 * any writes; concurrent calls block until the lock is released.
 *
 * @param sessionId  The session to settle.
 * @param closePrice The settlement price. Direction is computed automatically
 *                   (closePrice > openPrice → up wins; < openPrice → down wins;
 *                    difference ≤ 0.01% → draw / full refund).
 * @param openPrice  Optional override for the session open price. When omitted
 *                   the value stored in trading_sessions.open_price is used; if
 *                   that is also NULL, closePrice is used (resulting in a draw).
 */
export async function settleSession(
  sessionId: string,
  closePrice: number,
  openPrice?: number
): Promise<SessionSettlementSummary> {
  return await transaction(async (client) => {
    // Acquire row-level lock to prevent concurrent settle / cancel races
    const sessionRes = await client.query(
      `SELECT id, status, rule_id, duration_seconds, open_price,
              result_direction, order_count, total_bet_amount, total_payout
       FROM trading_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId]
    );

    if (sessionRes.rows.length === 0) {
      throw new Error(`Trading session ${sessionId} not found`);
    }

    const session = sessionRes.rows[0];

    // Idempotency: already settled – return summary from stored data
    if (session.status === 'settled') {
      console.log(`[settlement] session ${sessionId}: already settled, skipping`);
      return {
        sessionId,
        resultDirection: session.result_direction ?? 'draw',
        totalOrders: parseInt(session.order_count ?? '0', 10),
        totalBetAmount: parseFloat(session.total_bet_amount ?? '0'),
        totalPayout: parseFloat(session.total_payout ?? '0'),
        platformProfit:
          parseFloat(session.total_bet_amount ?? '0') -
          parseFloat(session.total_payout ?? '0'),
        winningOrders: 0,
        losingOrders: 0,
        drawOrders: 0,
      };
    }

    // Promote pending → active before settlement
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

    // Resolve open price: caller → stored in DB → fall back to closePrice (draw)
    let resolvedOpenPrice: number;
    if (openPrice != null) {
      resolvedOpenPrice = openPrice;
    } else if (session.open_price != null) {
      resolvedOpenPrice = parseFloat(session.open_price);
    } else {
      // No open price available — result will be draw (full refund).
      // Callers should ensure openPrice is passed to avoid unintended draws.
      console.warn(
        `[settlement] session ${sessionId}: open_price is NULL and no openPrice passed by caller. ` +
        `Falling back to closePrice=${closePrice} — this will result in DRAW (full refund).`
      );
      resolvedOpenPrice = closePrice;
    }

    // Compute result direction from prices
    const resultDirection = determineResultDirection(resolvedOpenPrice, closePrice);

    // Resolve rule odds
    let ruleOdds = 1.85;
    const ruleId: number | null = session.rule_id;
    if (ruleId) {
      const ruleRes = await client.query(
        `SELECT odds FROM trading_rules WHERE id = $1`,
        [ruleId]
      );
      if (ruleRes.rows.length > 0) ruleOdds = parseFloat(ruleRes.rows[0].odds);
    } else {
      const globalRule = await client.query(
        `SELECT odds FROM trading_rules
         WHERE pair_id IS NULL AND duration_seconds = $1 AND is_active = true
         ORDER BY id ASC LIMIT 1`,
        [session.duration_seconds]
      );
      if (globalRule.rows.length > 0) ruleOdds = parseFloat(globalRule.rows[0].odds);
    }

    // Fetch all active orders for this session
    const ordersRes = await client.query(
      `SELECT id, user_id, direction, amount, odds
       FROM trading_orders
       WHERE session_id = $1 AND status = 'active'`,
      [sessionId]
    );
    const orders = ordersRes.rows;

    // Execute batch settlement
    const stats = await executeSettlement(
      client,
      orders,
      resultDirection,
      closePrice,
      resolvedOpenPrice,
      ruleOdds
    );

    const platformProfit = stats.totalBetAmount - stats.totalPayout;

    // Update session record
    await client.query(
      `UPDATE trading_sessions
       SET status           = 'settled',
           result_direction = $1,
           result           = $1,
           settlement_price = $2,
           close_price      = $2,
           open_price       = COALESCE(open_price, $3),
           total_bet_amount = $4,
           total_payout     = $5,
           order_count      = $6,
           settled_at       = NOW()
       WHERE id = $7`,
      [
        resultDirection,
        closePrice,
        resolvedOpenPrice,
        stats.totalBetAmount,
        stats.totalPayout,
        orders.length,
        sessionId,
      ]
    );

    // Write settlement audit log
    await client.query(
      `INSERT INTO trading_settlement_log
       (session_id, rule_id, result_direction, settlement_price,
        total_orders, total_bet_amount, total_payout, platform_profit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sessionId,
        ruleId,
        resultDirection,
        closePrice,
        orders.length,
        stats.totalBetAmount,
        stats.totalPayout,
        platformProfit,
      ]
    );

    console.log(JSON.stringify({
      event: 'session_settled',
      sessionId,
      resultDirection,
      orders: orders.length,
      winningOrders: stats.winningOrders,
      losingOrders: stats.losingOrders,
      drawOrders: stats.drawOrders,
      platformProfit,
    }));

    return {
      sessionId,
      resultDirection,
      totalOrders: orders.length,
      totalBetAmount: stats.totalBetAmount,
      totalPayout: stats.totalPayout,
      platformProfit,
      winningOrders: stats.winningOrders,
      losingOrders: stats.losingOrders,
      drawOrders: stats.drawOrders,
    };
  });
}
