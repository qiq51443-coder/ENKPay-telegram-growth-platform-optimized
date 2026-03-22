-- Migration 1007: Fix Trading Period Logic — 补全交易期结算所需字段
-- Date: 2026-03-22
-- Purpose:
--   1. trading_sessions  补充 close_price / result / order_count 列
--   2. trading_orders    新增 result 列（win / lose / draw）用于订单级输赢标记
--   3. 新增 idx_trading_sessions_period ON (pair_id, duration_seconds, period_label)
--   4. 新增 idx_trading_orders_user_status ON (user_id, status)
--   5. trading_rules     插入 3 档全局默认规则（pair_id IS NULL，duration 60/300/600，odds 1.85）

-- ============================================================================
-- Section 1: trading_sessions — 补充结算所需字段
-- ============================================================================

-- 期末收盘价（由 period-settlement job 在期结束时写入）
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS close_price NUMERIC;

-- 该期最终涨跌结果（up / down / draw）
DO $$ BEGIN
  ALTER TABLE trading_sessions
    ADD COLUMN IF NOT EXISTS result VARCHAR(10)
      CHECK (result IN ('up', 'down', 'draw'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 该期总下单数（结算时批量写入）
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;

-- ============================================================================
-- Section 2: trading_orders — 新增订单级输赢标记列
-- ============================================================================

-- 若 result 列尚不存在，先新增（支持 win / lose / draw / pending）
ALTER TABLE trading_orders
  ADD COLUMN IF NOT EXISTS result VARCHAR(10);

-- 删除旧的 CHECK 约束（若存在），重建以支持 draw
ALTER TABLE trading_orders DROP CONSTRAINT IF EXISTS trading_orders_result_check;
DO $$ BEGIN
  ALTER TABLE trading_orders
    ADD CONSTRAINT trading_orders_result_check
      CHECK (result IN ('win', 'lose', 'draw', 'pending'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================================
-- Section 3: 索引优化
-- ============================================================================

-- 加速按 (pair_id, duration_seconds, period_label) 查询活跃期（快速定位当前期）
CREATE INDEX IF NOT EXISTS idx_trading_sessions_period
  ON trading_sessions(pair_id, duration_seconds, period_label);

-- 加速按 (user_id, status) 查询用户活跃订单（Mini App 轮询用）
CREATE INDEX IF NOT EXISTS idx_trading_orders_user_status
  ON trading_orders(user_id, status);

-- ============================================================================
-- Section 4: trading_rules — 放宽约束，插入全局默认赔率规则
-- ============================================================================

-- 放宽 rule_name NOT NULL（全局规则允许无名称）
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
-- 使用 WHERE NOT EXISTS 确保幂等性

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

Commit message: feat(db): migration 1007 — 补全交易期结算字段、索引与全局默认规则