-- Migration 1000: Fix core NFT product and purchase issues
-- Idempotent – safe to run multiple times.

-- 1. Add nft_balance to users (used by purchase route when product_type = 'fixed_term')
ALTER TABLE users ADD COLUMN IF NOT EXISTS nft_balance DECIMAL(18, 2) DEFAULT 0;

-- 2. Add sold_count to nft_products (used by purchase route to check sold-out)
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS sold_count INT DEFAULT 0;
-- Back-fill sold_count from (total_supply - stock) for existing products
UPDATE nft_products
SET sold_count = GREATEST(0, COALESCE(total_supply, 0) - COALESCE(stock, 0))
WHERE sold_count = 0 AND total_supply IS NOT NULL;

-- 3. Fix nft_products status CHECK constraint to include 'active' and 'inactive'
--    (the backend uses 'active' as default and sets 'inactive' on delete)
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  -- Drop ALL existing status CHECK constraints (handles any auto-generated name)
  FOR v_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON con.conrelid = cls.oid
    WHERE cls.relname = 'nft_products'
      AND con.contype = 'c'
      AND con.conname LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE nft_products DROP CONSTRAINT ' || quote_ident(v_constraint);
  END LOOP;
END $$;

ALTER TABLE nft_products
  ADD CONSTRAINT nft_products_status_check
  CHECK (status IN ('draft', 'on_sale', 'sold_out', 'off_shelf', 'active', 'inactive'));

-- 4. Create nft_holdings table (the name used by current route code)
--    This is separate from user_nft_holdings (old migration) and product_holdings (999)
CREATE TABLE IF NOT EXISTS nft_holdings (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id     INT         NOT NULL REFERENCES nft_products(id) ON DELETE CASCADE,
  purchase_price DECIMAL(18, 2) NOT NULL,
  status         VARCHAR(20) DEFAULT 'active',
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT nft_holdings_status_check CHECK (status IN ('active', 'expired', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_nft_holdings_user_id    ON nft_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_nft_holdings_product_id ON nft_holdings(product_id);
CREATE INDEX IF NOT EXISTS idx_nft_holdings_status     ON nft_holdings(status);
