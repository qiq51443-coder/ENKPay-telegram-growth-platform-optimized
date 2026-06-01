-- Add sort_order column to nft_products table
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Initialize sort_order based on current id order (higher id = higher sort_order)
UPDATE nft_products SET sort_order = id WHERE sort_order = 0;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_nft_products_sort_order ON nft_products(sort_order);
