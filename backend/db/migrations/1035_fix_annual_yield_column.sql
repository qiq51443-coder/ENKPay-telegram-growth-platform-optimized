-- Migration 1035: Ensure annual_yield_rate column exists in nft_products
-- Fixes /api/landing/config 500 error caused by missing column

DO $$
BEGIN
  -- Add annual_yield_rate if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nft_products' AND column_name = 'annual_yield_rate'
  ) THEN
    ALTER TABLE nft_products ADD COLUMN annual_yield_rate DECIMAL(5,2) DEFAULT 0;
    -- Populate from daily_yield_rate if available
    UPDATE nft_products
    SET annual_yield_rate = LEAST(daily_yield_rate * 365, 999.99)  -- cap at DECIMAL(5,2) max value
    WHERE daily_yield_rate IS NOT NULL AND daily_yield_rate > 0;
  END IF;
END $$;
