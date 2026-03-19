-- NFT Product Enhancements Migration
-- Adds display_holders_count, description_i18n, nft_balance, expires_at, total_income, and nft_income_records

-- 1. Add display_holders_count to nft_products (admin-configurable virtual holders)
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS display_holders_count INTEGER DEFAULT 0;

-- 2. Add description_i18n JSONB for multi-language descriptions
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS description_i18n JSONB DEFAULT '{}';

-- 3. Add nft_balance to users (locked funds from NFT purchases)
ALTER TABLE users ADD COLUMN IF NOT EXISTS nft_balance DECIMAL(20,8) DEFAULT 0;

-- 4. Add expires_at and total_income to nft_holdings
ALTER TABLE nft_holdings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE nft_holdings ADD COLUMN IF NOT EXISTS total_income DECIMAL(20,8) DEFAULT 0;

-- 5. Create nft_income_records table for daily income tracking
CREATE TABLE IF NOT EXISTS nft_income_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id INTEGER NOT NULL REFERENCES nft_holdings(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  amount DECIMAL(20,8) NOT NULL,
  income_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (holding_id, income_date)
);

CREATE INDEX IF NOT EXISTS idx_nft_income_records_user_id ON nft_income_records(user_id);
CREATE INDEX IF NOT EXISTS idx_nft_income_records_holding_id ON nft_income_records(holding_id);
CREATE INDEX IF NOT EXISTS idx_nft_holdings_expires_at ON nft_holdings(expires_at);
