-- Migration 1007: Fix Trading Period Logic —补全交易期结算所需字段
-- Date: 2026-03-21
-- Purpose:
--   1. trading_sessions  补充 close_price / result / order_count 列
--   2. trading_orders    扩展 result CHECK 约束支持 'draw'，补充 close_price / entry_price 列
--   3. 创建 4 个加速查询的索引
--   4. trading_rules     放宽 rule_name / direction NOT NULL，插入 3 档全局默认规则

-- ============================================================================
-- Section 1: trading_sessions — 补充结算所需字段
-- ============================================================================

-- 期末价格（由 period-snapshot job 在期结束时写入）
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS close_price DECIMAL(18,8);

-- 该期最终涨跌结果（up / down / draw），语义比已有 result_direction 更清晰
DO $$ BEGIN
  ALTER TABLE trading_sessions
    ADD COLUMN IF NOT EXISTS result VARCHAR(10)
      CHECK (result IN ('up', 'down', 'draw'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 该期总下注人数（结算时批量写入）
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;

-- ============================================================================
-- Section 2: trading_orders — 扩展 result 约束支持 'draw'，补充价格列
-- ============================================================================

-- 删除旧的 CHECK 约束（仅允许 win / lose / pending），重建以支持 draw
ALTER TABLE trading_orders DROP CONSTRAINT IF EXISTS trading_orders_result_check;
DO $$ BEGIN
  ALTER TABLE trading_orders
    ADD CONSTRAINT trading_orders_result_check
      CHECK (result IN ('win', 'lose', 'draw', 'pending'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 订单对应期的结束价格
ALTER TABLE trading_orders
  ADD COLUMN IF NOT EXISTS close_price DECIMAL(18,8);

-- 订单对应期的开始价格（期开始时由 period-snapshot job 写入）
ALTER TABLE trading_orders
  ADD COLUMN IF NOT EXISTS entry_price DECIMAL(18,8);

-- ============================================================================
-- Section 3: 索引优化
-- ============================================================================

-- 加速按 user_id + status 查询活跃订单（Mini App 轮询用）
CREATE INDEX IF NOT EXISTS idx_trading_orders_user_status
  ON trading_orders(user_id, status);

-- 加速按 session_id 查询订单（结算时批量更新用）
CREATE INDEX IF NOT EXISTS idx_trading_orders_session_id
  ON trading_orders(session_id);

-- 加速 pending sessions 的定时激活查询
CREATE INDEX IF NOT EXISTS idx_trading_sessions_status_start
  ON trading_sessions(status, start_time)
  WHERE status = 'pending';

-- 加速 active sessions 的定时结算查询
CREATE INDEX IF NOT EXISTS idx_trading_sessions_status_end
  ON trading_sessions(status, end_time)
  WHERE status = 'active';

-- ============================================================================
-- Section 4: trading_rules — 放宽约束，插入全局默认赔率规则
-- ============================================================================

-- 放宽 rule_name NOT NULL（全局规则不需要名称也可以有值，但允许 NULL 更灵活）
DO $$ BEGIN
  ALTER TABLE trading_rules ALTER COLUMN rule_name DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 放宽 direction NOT NULL（全局默认规则无预设方向）
DO $$ BEGIN
  ALTER TABLE trading_rules ALTER COLUMN direction DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 插入 3 档全局默认赔率（pair_id IS NULL 表示全局适用）
-- 使用 WHERE NOT EXISTS 确保幂等性（trading_rules 无唯一约束，ON CONFLICT 不可靠）
-- 60 秒档
INSERT INTO trading_rules (pair_id, session_id, rule_name, direction, odds, min_bet, max_bet, duration_seconds, is_active)
SELECT NULL, NULL, 'global_default_60s', NULL, 1.85, 1.00, 10000.00, 60, true
WHERE NOT EXISTS (
  SELECT 1 FROM trading_rules WHERE pair_id IS NULL AND duration_seconds = 60 AND rule_name = 'global_default_60s'
);

-- 300 秒档（5 分钟）
INSERT INTO trading_rules (pair_id, session_id, rule_name, direction, odds, min_bet, max_bet, duration_seconds, is_active)
SELECT NULL, NULL, 'global_default_300s', NULL, 1.85, 1.00, 10000.00, 300, true
WHERE NOT EXISTS (
  SELECT 1 FROM trading_rules WHERE pair_id IS NULL AND duration_seconds = 300 AND rule_name = 'global_default_300s'
);

-- 600 秒档（10 分钟）
INSERT INTO trading_rules (pair_id, session_id, rule_name, direction, odds, min_bet, max_bet, duration_seconds, is_active)
SELECT NULL, NULL, 'global_default_600s', NULL, 1.85, 1.00, 10000.00, 600, true
WHERE NOT EXISTS (
  SELECT 1 FROM trading_rules WHERE pair_id IS NULL AND duration_seconds = 600 AND rule_name = 'global_default_600s'
);
