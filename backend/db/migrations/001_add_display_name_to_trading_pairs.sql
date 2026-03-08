-- Migration 001: Add display_name column to trading_pairs
-- Idempotent: safe to run multiple times (uses IF NOT EXISTS)
-- Also handled by migration 901, but included here for explicit tracking.

ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS display_name VARCHAR(200);
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS binance_symbol VARCHAR(50);
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS base_currency VARCHAR(20);
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS quote_currency VARCHAR(20);

-- Backfill display_name from name, falling back to symbol
UPDATE trading_pairs SET display_name = name   WHERE display_name IS NULL AND name   IS NOT NULL;
UPDATE trading_pairs SET display_name = symbol WHERE display_name IS NULL AND symbol IS NOT NULL;
