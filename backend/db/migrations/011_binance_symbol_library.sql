-- Migration 011: Ensure binance_symbol_library table exists
-- This is an idempotent safety-net migration; the table is also created in
-- migration 901_fix_trading_schema.sql, so this script is safe to run multiple times.

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

CREATE INDEX IF NOT EXISTS idx_binance_symbol_library_symbol
  ON binance_symbol_library (symbol);
