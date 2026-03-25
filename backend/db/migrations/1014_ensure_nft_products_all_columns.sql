-- Migration 1014: Ensure nft_products has ALL columns required by the current API
-- Idempotent – safe to run multiple times.

-- Core columns used by GET /nft/products
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS name VARCHAR(200);
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS category_id INT REFERENCES nft_categories(id) ON DELETE SET NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS total_supply INT DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS sold_count INT DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) DEFAULT 'instant';
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS description_i18n JSONB DEFAULT '{}';
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS display_holders_count INTEGER DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS daily_trade_reward_rate DECIMAL(10,6) DEFAULT 0.01;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_trade_reward_days INT DEFAULT 30;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS original_price DECIMAL(18,2) DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS term_days INT DEFAULT 30;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS daily_yield_rate DECIMAL(10,6) DEFAULT 0.005;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_holders INT DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS current_holders INT DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS is_purchase_limited BOOLEAN DEFAULT false;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_purchases_per_user INT DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS rarity VARCHAR(20) DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS listing_time TIMESTAMP DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS settlement_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS settlement_description TEXT DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Ensure nft_holdings table exists (referenced by total_holders_count join)
CREATE TABLE IF NOT EXISTS nft_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES nft_products(id) ON DELETE CASCADE,
  purchase_price DECIMAL(18,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  total_income DECIMAL(20,8) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT nft_holdings_status_check CHECK (status IN ('active', 'expired', 'cancelled'))
);

-- Ensure product_holdings table exists (referenced by total_holders_count join)
CREATE TABLE IF NOT EXISTS product_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id INT REFERENCES nft_products(id) ON DELETE SET NULL,
  amount DECIMAL(18,2) NOT NULL,
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'active',
  daily_credited_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix status CHECK constraint to include both old and new allowed values
DO $$
DECLARE v_constraint TEXT;
BEGIN
  FOR v_constraint IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class cls ON con.conrelid = cls.oid
    WHERE cls.relname = 'nft_products' AND con.contype = 'c' AND con.conname LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE nft_products DROP CONSTRAINT ' || quote_ident(v_constraint);
  END LOOP;
END $$;

ALTER TABLE nft_products
  ADD CONSTRAINT nft_products_status_check
  CHECK (status IN ('draft', 'on_sale', 'sold_out', 'off_shelf', 'active', 'inactive'));

-- Backfill: sync name from title for existing rows that have no name yet
UPDATE nft_products SET name = title WHERE name IS NULL AND title IS NOT NULL;
-- Backfill: set status = 'active' for rows where status is NULL
UPDATE nft_products SET status = 'active' WHERE status IS NULL;
-- Backfill: stock from remaining_supply or total_supply where stock is missing
UPDATE nft_products
SET stock = COALESCE(remaining_supply, total_supply, 0)
WHERE (stock IS NULL OR stock = 0) AND (remaining_supply IS NOT NULL OR total_supply IS NOT NULL);
