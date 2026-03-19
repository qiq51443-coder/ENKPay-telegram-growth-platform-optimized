-- Migration 992: Fix missing NFT product columns required by the admin API
-- This is a catch-all idempotent migration for columns that may be missing
-- after partial migration runs (e.g. on Render hosted DB).
-- Safe to run multiple times (uses ADD COLUMN IF NOT EXISTS).

-- Ensure description_i18n exists (added in 990_nft_product_enhancements)
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS description_i18n JSONB DEFAULT '{}';

-- Ensure display_holders_count exists (added in 990_nft_product_enhancements)
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS display_holders_count INTEGER DEFAULT 0;

-- Ensure listing_time exists (used by admin API and nft.ts routes)
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS listing_time TIMESTAMP;

-- Ensure settlement_description exists (added in 002_add_nft_settlement_fields)
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS settlement_description TEXT;

-- Ensure updated_at exists
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Ensure the status check constraint allows all values used by the admin API
ALTER TABLE nft_products DROP CONSTRAINT IF EXISTS nft_products_status_check;
ALTER TABLE nft_products ADD CONSTRAINT nft_products_status_check
  CHECK (status IN ('draft', 'active', 'on_sale', 'sold_out', 'off_shelf', 'inactive'));
