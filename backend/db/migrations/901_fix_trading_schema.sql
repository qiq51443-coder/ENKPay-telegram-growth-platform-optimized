-- Migration 901: Fix trading schema – ensure all columns referenced by the API exist
-- This migration is idempotent (uses IF NOT EXISTS / WHERE … IS NULL) so it is
-- safe to run multiple times.

-- ─── trading_pairs ────────────────────────────────────────────────────────────
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS display_name  VARCHAR(200);
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS binance_symbol VARCHAR(50);
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS base_currency  VARCHAR(20);
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS quote_currency VARCHAR(20);

-- Backfill display_name from name (prefer name, fall back to symbol)
UPDATE trading_pairs SET display_name = name   WHERE display_name IS NULL AND name   IS NOT NULL;
UPDATE trading_pairs SET display_name = symbol WHERE display_name IS NULL AND symbol IS NOT NULL;

-- ─── trading_rules ────────────────────────────────────────────────────────────
ALTER TABLE trading_rules ADD COLUMN IF NOT EXISTS pair_id          UUID REFERENCES trading_pairs(id) ON DELETE CASCADE;
ALTER TABLE trading_rules ADD COLUMN IF NOT EXISTS rule_name        VARCHAR(100);
ALTER TABLE trading_rules ADD COLUMN IF NOT EXISTS direction        VARCHAR(10);
ALTER TABLE trading_rules ADD COLUMN IF NOT EXISTS odds             DECIMAL(5,2)  DEFAULT 1.95;
ALTER TABLE trading_rules ADD COLUMN IF NOT EXISTS min_bet          DECIMAL(18,8) DEFAULT 1.0;
ALTER TABLE trading_rules ADD COLUMN IF NOT EXISTS max_bet          DECIMAL(18,8) DEFAULT 10000.0;
ALTER TABLE trading_rules ADD COLUMN IF NOT EXISTS duration_seconds INTEGER       DEFAULT 60;
ALTER TABLE trading_rules ADD COLUMN IF NOT EXISTS is_active        BOOLEAN       DEFAULT true;

-- ─── trading_sessions ─────────────────────────────────────────────────────────
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS rule_id UUID REFERENCES trading_rules(id) ON DELETE SET NULL;

-- ─── binance_symbol_library ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS binance_symbol_library (
  id                      SERIAL PRIMARY KEY,
  symbol                  VARCHAR(50)  UNIQUE NOT NULL,
  base_asset              VARCHAR(20)  NOT NULL,
  quote_asset             VARCHAR(20)  NOT NULL,
  status                  VARCHAR(20)  DEFAULT 'TRADING',
  display_name            VARCHAR(100),
  is_spot_trading_allowed BOOLEAN      DEFAULT true,
  last_price              DECIMAL(24,8),
  price_change_24h        DECIMAL(10,4),
  synced_at               TIMESTAMPTZ  DEFAULT NOW(),
  created_at              TIMESTAMPTZ  DEFAULT NOW()
);
