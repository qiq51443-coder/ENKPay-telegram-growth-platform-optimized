-- Migration 1013: Add total_income to nft_holdings and ensure nft_income_records exists
-- Idempotent – safe to run multiple times.

-- nft-daily-settle.ts updates total_income on nft_holdings rows.
-- This column was not included in the original 1000_fix_nft_core_issues.sql CREATE TABLE.
ALTER TABLE nft_holdings ADD COLUMN IF NOT EXISTS total_income DECIMAL(18, 2) DEFAULT 0;

-- nft-daily-settle.ts inserts into nft_income_records to deduplicate daily settle runs.
-- Create the table if it doesn't already exist (e.g. on databases that skipped 100_nft_platform_schema).
CREATE TABLE IF NOT EXISTS nft_income_records (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id  UUID        NOT NULL,
  user_id     UUID        NOT NULL,
  product_id  INT         NOT NULL,
  amount      DECIMAL(18, 8) NOT NULL,
  income_date DATE        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT nft_income_records_holding_date_uniq UNIQUE (holding_id, income_date)
);
CREATE INDEX IF NOT EXISTS idx_nft_income_records_holding_id ON nft_income_records(holding_id);
CREATE INDEX IF NOT EXISTS idx_nft_income_records_user_id    ON nft_income_records(user_id);
