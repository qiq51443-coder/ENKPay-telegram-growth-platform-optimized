-- Migration 1010: Fix Trading Win/Loss Logic — 补全交易期结算字段 & 全局默认规则
-- Date: 2026-03-22
-- Purpose:
--   1. trading_sessions  补充 close_price NUMERIC / result VARCHAR(10) / order_count INTEGER
--   2. trading_orders    新增 result VARCHAR(10) 订单级输赢标记（win/lose/draw）
--   3. 创建 2 个加速查询索引
--   4. trading_rules     插入 3 档全局默认规则（pair_id IS NULL，60/300/600s，odds 1.85）
--   5. 修复 trading_orders status CHECK 约束支持 'pending'
-- This migration is fully idempotent (uses IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ============================================================================
-- Section 1: trading_sessions — 补充结算所需字段
-- ============================================================================

-- 期末收盘价（由 auto-settle job 在期结束后写入）
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS close_price NUMERIC(24, 8);

-- 期结果：up / down / draw（与 result_direction 分开，result_direction 存方向，result 存字符串标记）
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS result VARCHAR(10);

-- 本期订单数量（结算时写入，方便统计）
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;

-- ============================================================================
-- Section 2: trading_orders — 补充订单级输赢字段
-- ============================================================================

-- 订单结果：win / lose / draw
ALTER TABLE trading_orders
  ADD COLUMN IF NOT EXISTS result VARCHAR(10);

-- 若旧表已有 result 列但 CHECK 约束过窄，先删除再重建
DO $$
BEGIN
  -- 删除旧的 result check（若存在）
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'trading_orders'
      AND constraint_name = 'trading_orders_result_check'
  ) THEN
    ALTER TABLE trading_orders DROP CONSTRAINT trading_orders_result_check;
  END IF;
END $$;

-- 重���宽松的 CHECK：允许 NULL（未结算），以及 win / lose / draw
ALTER TABLE trading_orders
  ADD CONSTRAINT trading_orders_result_check
  CHECK (result IS NULL OR result IN ('win', 'lose', 'draw'));

-- ============================================================================
-- Section 3: trading_orders — 修复 status 约束支持 'pending'
-- ============================================================================

DO $$
BEGIN
  -- Drop old status check if it does not include 'pending'
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'trading_orders'
      AND constraint_name = 'trading_orders_status_check'
  ) THEN
    ALTER TABLE trading_orders DROP CONSTRAINT trading_orders_status_check;
  END IF;
END $$;

ALTER TABLE trading_orders
  ADD CONSTRAINT trading_orders_status_check
  CHECK (status IN ('pending', 'active', 'settled', 'cancelled', 'expired'));

-- ============================================================================
-- Section 4: Indexes — 加速查询
-- ============================================================================

-- 按 (pair_id, duration_seconds, period_label) 查询当前期 session
CREATE INDEX IF NOT EXISTS idx_trading_sessions_period
  ON trading_sessions (pair_id, duration_seconds, period_label);

-- 按 (user_id, status) 快速查询用户活跃订单
CREATE INDEX IF NOT EXISTS idx_trading_orders_user_status
  ON trading_orders (user_id, status);

-- ============================================================================
-- Section 5: trading_rules — 放宽 NOT NULL 约束 & 插入全局默认规则
-- ============================================================================

-- rule_name 和 direction 在全局默认规则中可以为 NULL（pair_id IS NULL 的规则不需要 direction）
DO $$
BEGIN
  -- Relax rule_name NOT NULL if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_rules' AND column_name = 'rule_name'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE trading_rules ALTER COLUMN rule_name DROP NOT NULL;
  END IF;

  -- Relax direction NOT NULL if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_rules' AND column_name = 'direction'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE trading_rules ALTER COLUMN direction DROP NOT NULL;
  END IF;
END $$;

-- 插入 3 档全局默认规则（pair_id IS NULL 代表全局规则）
-- ON CONFLICT DO NOTHING 保证幂等
INSERT INTO trading_rules (pair_id, rule_name, direction, duration_seconds, odds, min_bet, max_bet, is_active)
VALUES
  (NULL, 'Global 1min',  NULL, 60,  1.85, 1, 10000, true),
  (NULL, 'Global 5min',  NULL, 300, 1.85, 1, 10000, true),
  (NULL, 'Global 10min', NULL, 600, 1.85, 1, 10000, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Done
-- ============================================================================
-- Summary:
--   trading_sessions: close_price, result, order_count columns added
--   trading_orders:   result column added; result & status CHECK constraints updated
--   Indexes:          idx_trading_sessions_period, idx_trading_orders_user_status
--   trading_rules:    3 global default rules inserted (duration 60/300/600, odds 1.85)