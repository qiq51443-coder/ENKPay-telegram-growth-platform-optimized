-- Migration 1007: Fix Trading Period Logic — 补全交易期结算所需字段
-- Date: 2026-03-21
-- Purpose:
--   1. trading_sessions  补充 close_price / result / order_count 列
--   2. trading_orders    扩展 result CHECK 约束支持 'draw'
--   3. 创建查询加速索引（含规格要求的 idx_trading_sessions_period）
--   4. trading_rules     放宽 rule_name / direction NOT NULL
--                        添加唯一约束，插入 3 档全局默认规则 ON CONFLICT DO NOTHING

-- ============================================================================
-- Section 1: trading_sessions — 补充结算所需字段
-- ============================================================================

-- 期末价格（由 period-snapshot job 在期结束时写入）
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS close_price NUMERIC;

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
-- Section 2: trading_orders — 扩展 result 约束支持 'draw'
-- ============================================================================

-- 删除旧的 CHECK 约束（仅允许 win / lose / pending），重建以支持 draw
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

-- 规格要求：加速按 (pair_id, duration_seconds, period_label) 查询交易期
CREATE INDEX IF NOT EXISTS idx_trading_sessions_period
  ON trading_sessions(pair_id, duration_seconds, period_label);

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

-- 放宽 rule_name NOT NULL（全局规则允许 NULL 更灵活）
DO $$ BEGIN
  ALTER TABLE trading_rules ALTER COLUMN rule_name DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 放宽 direction NOT NULL（全局默认规则无预设方向）
DO $$ BEGIN
  ALTER TABLE trading_rules ALTER COLUMN direction DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 为全局默认规则添加唯一约束，使 ON CONFLICT DO NOTHING 可用
DO $$ BEGIN
  ALTER TABLE trading_rules
    ADD CONSTRAINT uq_trading_rules_global_default
      UNIQUE (pair_id, duration_seconds, rule_name);
EXCEPTION WHEN duplicate_table THEN NULL;
         WHEN others THEN NULL;
END $$;

-- 插入 3 档全局默认赔率（pair_id IS NULL 表示全局适用）
-- ON CONFLICT DO NOTHING 确保幂等性

-- 60 秒档
INSERT INTO trading_rules (pair_id, session_id, rule_name, direction, odds, min_bet, max_bet, duration_seconds, is_active)
VALUES (NULL, NULL, 'global_default_60s', NULL, 1.85, 1.00, 10000.00, 60, true)
ON CONFLICT DO NOTHING;

-- 300 秒档（5 分钟）
INSERT INTO trading_rules (pair_id, session_id, rule_name, direction, odds, min_bet, max_bet, duration_seconds, is_active)
VALUES (NULL, NULL, 'global_default_300s', NULL, 1.85, 1.00, 10000.00, 300, true)
ON CONFLICT DO NOTHING;

-- 600 秒档（10 分钟）
INSERT INTO trading_rules (pair_id, session_id, rule_name, direction, odds, min_bet, max_bet, duration_seconds, is_active)
VALUES (NULL, NULL, 'global_default_600s', NULL, 1.85, 1.00, 10000.00, 600, true)
ON CONFLICT DO NOTHING;