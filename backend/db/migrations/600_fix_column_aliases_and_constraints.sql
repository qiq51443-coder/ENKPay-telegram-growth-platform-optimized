-- Migration 600: Fix column type mismatch and CHECK constraint issues
-- Date: 2026-03-07

-- Fix 1: lucky_auctions.product_id type mismatch (UUID vs INT)
-- nft_products.id is SERIAL (INT), not UUID
ALTER TABLE lucky_auctions DROP CONSTRAINT IF EXISTS lucky_auctions_product_id_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lucky_auctions' AND column_name = 'product_id'
    AND data_type = 'uuid'
  ) THEN
    -- UUID values cannot map to INT IDs, so NULL is the correct conversion value.
    -- Any pre-existing UUID product_id entries are invalid references and must be cleared.
    ALTER TABLE lucky_auctions ALTER COLUMN product_id TYPE INT USING NULL;
  END IF;
END $$;

ALTER TABLE lucky_auctions ADD CONSTRAINT lucky_auctions_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES nft_products(id) ON DELETE SET NULL;

-- Fix 2: Add 'active' status to nft_products CHECK constraint
ALTER TABLE nft_products DROP CONSTRAINT IF EXISTS nft_products_status_check;
ALTER TABLE nft_products ADD CONSTRAINT nft_products_status_check
  CHECK (status IN ('draft', 'active', 'on_sale', 'sold_out', 'off_shelf'));
