/**
 * emergency-settle.js
 * 紧急结算卡住的 sessions 17-20
 * 用法: node src/scripts/emergency-settle.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    // Sessions to settle: { id, open_price, close_price }
    // close=null means refund all orders
    const sessions = [
      { id: 17, open: 69004.50, close: 68993.64 }, // BTC: down wins
      { id: 18, open: null,     close: null      }, // no price → refund
      { id: 19, open: 68674.18, close: 68498.65 }, // BTC: down wins
      { id: 20, open: 68498.64, close: 68580.32 }, // BTC: up wins
    ];

    for (const s of sessions) {
      await client.query('BEGIN');
      try {
        // Lock the session row
        const chk = await client.query(
          'SELECT status FROM trading_sessions WHERE id = $1 FOR UPDATE',
          [s.id]
        );
        if (!chk.rows.length) {
          console.log('session ' + s.id + ': not found, skipping');
          await client.query('ROLLBACK');
          continue;
        }
        if (!['active', 'pending'].includes(chk.rows[0].status)) {
          console.log('session ' + s.id + ': status=' + chk.rows[0].status + ', skipping');
          await client.query('ROLLBACK');
          continue;
        }

        if (s.close === null) {
          // ── REFUND ──────────────────────────────────────────────
          const orders = await client.query(
            "SELECT id, user_id, amount FROM trading_orders WHERE session_id = $1 AND status IN ('active','pending')",
            [s.id]
          );
          for (const o of orders.rows) {
            await client.query(
              'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
              [parseFloat(o.amount), o.user_id]
            );
            await client.query(
              "UPDATE trading_orders SET status = 'cancelled', result = 'draw', profit = 0 WHERE id = $1",
              [o.id]
            );
          }
          await client.query(
            "UPDATE trading_sessions SET status = 'cancelled', settled_at = NOW() WHERE id = $1",
            [s.id]
          );
          console.log('session ' + s.id + ': REFUNDED (' + orders.rows.length + ' orders)');

        } else {
          // ── SETTLE ──────────────────────────────────────────────
          const diff = s.close - s.open;
          const dir = Math.abs(diff) < 0.0001 ? 'draw' : (s.close > s.open ? 'up' : 'down');
          console.log('session ' + s.id + ': open=' + s.open + ' close=' + s.close + ' => ' + dir);

          const orders = await client.query(
            "SELECT id, user_id, direction, amount, odds FROM trading_orders WHERE session_id = $1 AND status = 'active'",
            [s.id]
          );

          let wins = 0, loses = 0, draws = 0;
          for (const o of orders.rows) {
            const amt  = parseFloat(o.amount);
            const odds = parseFloat(o.odds) || 1.85;
            let result, payout, profit;

            if (dir === 'draw') {
              result = 'draw'; payout = amt; profit = 0; draws++;
            } else if (o.direction === dir) {
              result = 'win'; payout = amt * odds; profit = payout; wins++;
            } else {
              result = 'lose'; payout = 0; profit = -amt; loses++;
            }

            if (payout > 0) {
              await client.query(
                'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                [payout, o.user_id]
              );
            }
            await client.query(
              "UPDATE trading_orders SET status='settled', result=$1, profit=$2, close_price=$3, settlement_price=$3, settled_at=NOW() WHERE id=$4",
              [result, profit, s.close, o.id]
            );
          }

          await client.query(
            "UPDATE trading_sessions SET status='settled', result_direction=$1, result=$1, settlement_price=$2, close_price=$2, open_price=COALESCE(open_price,$3), settled_at=NOW() WHERE id=$4",
            [dir, s.close, s.open, s.id]
          );

          console.log('session ' + s.id + ': SETTLED dir=' + dir + ' win=' + wins + ' lose=' + loses + ' draw=' + draws);
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('session ' + s.id + ': ERROR: ' + e.message);
      }
    }

    // Verify final state
    console.log('\n── Final state ──');
    const verify = await client.query(
      'SELECT id, status, result_direction, settlement_price FROM trading_sessions WHERE id = ANY($1)',
      [[17, 18, 19, 20]]
    );
    console.table(verify.rows);

    const orderVerify = await client.query(
      "SELECT id, session_id, status, result, profit FROM trading_orders WHERE session_id = ANY($1) ORDER BY session_id, id",
      [[17, 18, 19, 20]]
    );
    console.table(orderVerify.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(function(e) {
  console.error('Fatal:', e.message);
  process.exit(1);
});