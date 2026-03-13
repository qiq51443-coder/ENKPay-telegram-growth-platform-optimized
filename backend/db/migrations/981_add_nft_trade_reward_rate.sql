-- Migration 981: Add daily_trade_reward_rate and max_trade_reward_days to nft_products
-- These columns are referenced by the backend NFT product creation/update/holdings API.

ALTER TABLE nft_products
  ADD COLUMN IF NOT EXISTS daily_trade_reward_rate DECIMAL(8,6) DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS max_trade_reward_days INTEGER DEFAULT 30;

-- Seed default trading rules for each duration so the mini-app can place orders
INSERT INTO trading_rules (odds, min_bet, max_bet, duration_seconds, is_active)
SELECT 1.95, 1.0, 10000.0, 60, true
WHERE NOT EXISTS (SELECT 1 FROM trading_rules WHERE duration_seconds = 60 LIMIT 1);

INSERT INTO trading_rules (odds, min_bet, max_bet, duration_seconds, is_active)
SELECT 1.95, 1.0, 10000.0, 120, true
WHERE NOT EXISTS (SELECT 1 FROM trading_rules WHERE duration_seconds = 120 LIMIT 1);

INSERT INTO trading_rules (odds, min_bet, max_bet, duration_seconds, is_active)
SELECT 1.95, 1.0, 10000.0, 300, true
WHERE NOT EXISTS (SELECT 1 FROM trading_rules WHERE duration_seconds = 300 LIMIT 1);
