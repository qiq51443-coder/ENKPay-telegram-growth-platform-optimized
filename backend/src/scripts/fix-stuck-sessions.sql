-- fix-stuck-sessions.sql
--
-- 将所有卡住超过 5 分钟的 active/pending sessions 取消并全额退款。
-- 这是当应用层脚本无法运行时的 SQL 备选方案。
--
-- 在 Render Shell 通过 psql 执行:
--   psql "$DATABASE_URL" -f src/scripts/fix-stuck-sessions.sql
--
-- 或通过 node 执行:
--   node -e "
--     const { Pool } = require('pg');
--     const fs = require('fs');
--     const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
--     pool.query(fs.readFileSync('src/scripts/fix-stuck-sessions.sql', 'utf8'))
--       .then(r => { console.log('Done:', r.command); return pool.end(); })
--       .catch(e => { console.error(e.message); pool.end(); });
--   "

BEGIN;

-- Step 1: Refund all active/pending orders belonging to stuck sessions
UPDATE users u
SET wallet_balance = wallet_balance + o.amount::numeric
FROM trading_orders o
JOIN trading_sessions s ON s.id = o.session_id
WHERE o.status IN ('active', 'pending')
  AND s.status IN ('active', 'pending')
  AND s.end_time <= NOW() - INTERVAL '5 minutes';

-- Step 2: Cancel the orders
UPDATE trading_orders
SET status = 'cancelled',
    result = 'draw',
    profit = 0
WHERE status IN ('active', 'pending')
  AND session_id IN (
    SELECT id FROM trading_sessions
    WHERE status IN ('active', 'pending')
      AND end_time <= NOW() - INTERVAL '5 minutes'
  );

-- Step 3: Cancel the sessions
UPDATE trading_sessions
SET status = 'cancelled'
WHERE status IN ('active', 'pending')
  AND end_time <= NOW() - INTERVAL '5 minutes';

COMMIT;
