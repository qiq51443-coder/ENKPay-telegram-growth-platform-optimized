-- Migration 998: Fix missing columns in nft_products required by the admin API
-- These columns are referenced in nft.ts routes but were never added to the schema.
-- Safe to run multiple times (uses ADD COLUMN IF NOT EXISTS).

-- metadata: arbitrary JSONB payload stored per-product
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- daily_trade_reward_rate: daily reward rate for trade-type products
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS daily_trade_reward_rate DECIMAL(10,6) DEFAULT 0.01;

-- max_trade_reward_days: maximum number of days trade rewards are paid
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_trade_reward_days INT DEFAULT 30;

-- stock: available units for sale (mirrors total_supply at creation)
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0;

-- duration_days: optional fixed duration in days for time-limited products
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT NULL;

-- Back-fill stock from remaining_supply or total_supply for existing rows
-- Only update rows where stock is NULL (not where it is legitimately 0 / sold out)
UPDATE nft_products
SET stock = COALESCE(remaining_supply, total_supply, 0)
WHERE stock IS NULL;
