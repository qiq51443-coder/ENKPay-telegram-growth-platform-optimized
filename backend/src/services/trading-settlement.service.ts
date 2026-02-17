import { transaction } from '../db';

interface SettlementResult {
  total_orders: number;
  total_bet_amount: number;
  total_payout: number;
  platform_profit: number;
  winning_orders: number;
  losing_orders: number;
}

/**
 * Settle a trading session
 * 
 * Settlement logic:
 * - WIN: order.direction === resultDirection → user receives amount × odds
 * - LOSE: order.direction !== resultDirection → user gets nothing (already paid when placing order)
 * 
 * @param sessionId - The trading session to settle
 * @param resultDirection - The actual result: 'up' or 'down'
 * @param settlementPrice - The final price used for settlement
 * @returns Settlement summary
 */
export async function settleSession(
  sessionId: number,
  resultDirection: string,
  settlementPrice: number
): Promise<SettlementResult> {
  return await transaction(async (client) => {
    // Validate result direction
    if (!['up', 'down'].includes(resultDirection)) {
      throw new Error('Invalid result direction. Must be "up" or "down"');
    }

    // Get session details
    const sessionResult = await client.query(
      `SELECT id, status, rule_id FROM trading_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error(`Trading session ${sessionId} not found`);
    }

    const session = sessionResult.rows[0];

    if (session.status === 'settled') {
      throw new Error(`Trading session ${sessionId} is already settled`);
    }

    // Get trading rule for this session (if exists)
    let ruleOdds = 1.95; // Default odds
    let ruleId = session.rule_id;

    if (ruleId) {
      const ruleResult = await client.query(
        `SELECT id, odds FROM trading_rules WHERE id = $1`,
        [ruleId]
      );

      if (ruleResult.rows.length > 0) {
        ruleOdds = parseFloat(ruleResult.rows[0].odds);
      }
    }

    // Get all orders for this session
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
             settlement_price = $2,
             total_bet_amount = 0,
             total_payout = 0,
             settled_at = NOW()
         WHERE id = $3`,
        [resultDirection, settlementPrice, sessionId]
      );

      return {
        total_orders: 0,
        total_bet_amount: 0,
        total_payout: 0,
        platform_profit: 0,
        winning_orders: 0,
        losing_orders: 0,
      };
    }

    // Calculate settlements
    let totalBetAmount = 0;
    let totalPayout = 0;
    let winningOrders = 0;
    let losingOrders = 0;

    for (const order of orders) {
      const amount = parseFloat(order.amount);
      const orderOdds = order.odds ? parseFloat(order.odds) : ruleOdds;
      const isWin = order.direction === resultDirection;

      totalBetAmount += amount;

      let profit = 0;
      let payout = 0;

      if (isWin) {
        // User wins: receives back (amount × odds)
        payout = amount * orderOdds;
        profit = payout - amount; // Net profit
        winningOrders++;
        totalPayout += payout;

        // Credit user's wallet
        await client.query(
          `UPDATE users
           SET wallet_balance = wallet_balance + $1
           WHERE id = $2`,
          [payout, order.user_id]
        );
      } else {
        // User loses: gets nothing (amount was already deducted when placing order)
        profit = -amount; // Net loss
        losingOrders++;
      }

      // Update order
      await client.query(
        `UPDATE trading_orders
         SET result = $1,
             profit = $2,
             settlement_price = $3,
             settled_at = NOW(),
             status = 'settled'
         WHERE id = $4`,
        [isWin ? 'win' : 'lose', profit, settlementPrice, order.id]
      );
    }

    const platformProfit = totalBetAmount - totalPayout;

    // Update session
    await client.query(
      `UPDATE trading_sessions
       SET status = 'settled',
           result_direction = $1,
           settlement_price = $2,
           total_bet_amount = $3,
           total_payout = $4,
           settled_at = NOW()
       WHERE id = $5`,
      [resultDirection, settlementPrice, totalBetAmount, totalPayout, sessionId]
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
      `${winningOrders} wins, ${losingOrders} losses, ` +
      `platform profit: $${platformProfit.toFixed(2)}`
    );

    return {
      total_orders: orders.length,
      total_bet_amount: totalBetAmount,
      total_payout: totalPayout,
      platform_profit: platformProfit,
      winning_orders: winningOrders,
      losing_orders: losingOrders,
    };
  });
}
