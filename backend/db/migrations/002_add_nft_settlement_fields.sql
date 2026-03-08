-- Migration 002: Add settlement_description and compatibility columns to nft_products
-- Idempotent: safe to run multiple times (uses IF NOT EXISTS)

-- Add settlement_description if not exists (settlement_type already exists from migration 100)
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS settlement_description TEXT;

-- Add name column if not exists (compatibility with admin API which uses 'name' instead of 'title')
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS name VARCHAR(200);
UPDATE nft_products SET name = title WHERE name IS NULL AND title IS NOT NULL;

-- Add image_url column if not exists (compatibility with admin API which uses 'image_url' instead of 'cover_image_url')
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS image_url TEXT;
UPDATE nft_products SET image_url = cover_image_url WHERE image_url IS NULL AND cover_image_url IS NOT NULL;

-- Add stock column if not exists (used by admin panel instead of total_supply)
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0;
UPDATE nft_products SET stock = total_supply WHERE stock IS NULL AND total_supply IS NOT NULL;

-- Add duration_days column if not exists (used by periodic products)
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS duration_days INT;
UPDATE nft_products SET duration_days = term_days WHERE duration_days IS NULL AND term_days IS NOT NULL;

-- Ensure status CHECK constraint includes 'active'
ALTER TABLE nft_products DROP CONSTRAINT IF EXISTS nft_products_status_check;
ALTER TABLE nft_products ADD CONSTRAINT nft_products_status_check
  CHECK (status IN ('draft', 'active', 'on_sale', 'sold_out', 'off_shelf', 'inactive'));
