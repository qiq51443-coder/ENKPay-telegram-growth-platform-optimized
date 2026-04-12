-- Migration 1036: Sync is_active field with status field for nft_products
-- Ensures existing records with status='active' or 'on_sale' have is_active=true

ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Sync is_active = true for active/on_sale products
UPDATE nft_products
SET is_active = true
WHERE status IN ('active', 'on_sale') AND (is_active IS NULL OR is_active = false);

-- Sync is_active = false for inactive products
UPDATE nft_products
SET is_active = false
WHERE status NOT IN ('active', 'on_sale') AND is_active = true;
