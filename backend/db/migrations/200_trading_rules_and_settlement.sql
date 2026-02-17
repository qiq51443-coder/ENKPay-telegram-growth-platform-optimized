-- Migration 200: Trading Rules, Settlement, and Odds System
-- Date: 2026-02-17

-- ============================================================================
-- 1. Trading Rules Table (Admin configurable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS trading_rules (
  id SERIAL PRIMARY KEY,
  pair_id INT REFERENCES trading_pairs(id) ON DELETE CASCADE,
  session_id INT REFERENCES trading_sessions(id) ON DELETE SET NULL,
  rule_name VARCHAR(100) NOT NULL,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('up', 'down')),  -- Predetermined result
  odds DECIMAL(5,2) NOT NULL DEFAULT 1.95,  -- Payout multiplier (e.g., 1.95 = 95% profit)
  min_bet DECIMAL(18,2) DEFAULT 1.00,
  max_bet DECIMAL(18,2) DEFAULT 10000.00,
  duration_seconds INT NOT NULL DEFAULT 60,  -- Round duration
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trading_rules_pair ON trading_rules(pair_id);
CREATE INDEX IF NOT EXISTS idx_trading_rules_session ON trading_rules(session_id);
CREATE INDEX IF NOT EXISTS idx_trading_rules_active ON trading_rules(is_active);

-- ============================================================================
-- 2. Add settlement fields to trading_orders
-- ============================================================================
ALTER TABLE trading_orders
  ADD COLUMN IF NOT EXISTS rule_id INT REFERENCES trading_rules(id),
  ADD COLUMN IF NOT EXISTS odds DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS settlement_price DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS profit DECIMAL(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result VARCHAR(10) CHECK (result IN ('win', 'lose', 'pending')),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- ============================================================================  
-- 3. Trading Settlement History
-- ============================================================================
CREATE TABLE IF NOT EXISTS trading_settlement_log (
  id SERIAL PRIMARY KEY,
  session_id INT REFERENCES trading_sessions(id),
  rule_id INT REFERENCES trading_rules(id),
  result_direction VARCHAR(10) NOT NULL,  -- actual result: 'up' or 'down'
  settlement_price DECIMAL(18,8),
  total_orders INT DEFAULT 0,
  total_bet_amount DECIMAL(18,2) DEFAULT 0,
  total_payout DECIMAL(18,2) DEFAULT 0,
  platform_profit DECIMAL(18,2) DEFAULT 0,
  settled_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. Add fields to trading_sessions for rule binding
-- ============================================================================
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS rule_id INT REFERENCES trading_rules(id),
  ADD COLUMN IF NOT EXISTS result_direction VARCHAR(10),
  ADD COLUMN IF NOT EXISTS settlement_price DECIMAL(18,8),
  ADD COLUMN IF NOT EXISTS total_bet_amount DECIMAL(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_payout DECIMAL(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
