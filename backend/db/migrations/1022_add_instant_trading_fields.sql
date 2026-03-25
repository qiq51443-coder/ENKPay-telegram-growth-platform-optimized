-- Migration 1022: Add missing instant-trading fields
-- Idempotent – safe to run multiple times.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. trading_pairs – add pair_type to distinguish real-market vs custom pairs
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE trading_pairs
  ADD COLUMN IF NOT EXISTS pair_type VARCHAR(10) DEFAULT 'real'
    CHECK (pair_type IN ('real', 'custom'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. trading_orders – add entry_price_source and leverage
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE trading_orders
  ADD COLUMN IF NOT EXISTS entry_price_source VARCHAR(20),  -- 'binance_mark' | 'internal'
  ADD COLUMN IF NOT EXISTS leverage DECIMAL(5,2) DEFAULT 1.0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. trading_sessions – add settlement_price_source; upgrade settlement_price precision
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS settlement_price_source VARCHAR(20);  -- 'binance_mark' | 'internal'

-- Upgrade settlement_price precision from DECIMAL(18,8) → DECIMAL(20,8) if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'trading_sessions'
      AND column_name  = 'settlement_price'
      AND numeric_precision < 20
  ) THEN
    ALTER TABLE trading_sessions
      ALTER COLUMN settlement_price TYPE DECIMAL(20,8);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. price_points – source column already exists (DEFAULT 'generated');
--    no structural change needed – comment documents supported values.
--    Supported values: 'binance_mark', 'internal', 'generated'
-- ─────────────────────────────────────────────────────────────────────────────
-- (no DDL change required; column added in zzz_master_ensure_all_tables.sql)
