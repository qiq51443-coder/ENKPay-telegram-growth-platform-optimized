-- Migration 900: Add missing columns to trading_pairs table
-- The original schema used `name` but the trading admin API expects `display_name`,
-- `binance_symbol`, `base_currency`, and `quote_currency`.
-- This migration adds these columns for compatibility.

ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS binance_symbol VARCHAR(20);
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS base_currency VARCHAR(20);
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS quote_currency VARCHAR(20);

-- Backfill display_name from existing name column
UPDATE trading_pairs SET display_name = name WHERE display_name IS NULL;

-- Add unique index on binance_symbol for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_pairs_binance_symbol
  ON trading_pairs(binance_symbol)
  WHERE binance_symbol IS NOT NULL;
