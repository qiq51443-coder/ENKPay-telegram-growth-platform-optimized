-- Migration 1012: Fix transactions.reference_id (UUID → TEXT) and
--                  product_holdings.product_id (UUID → INT)
-- Idempotent – safe to run multiple times.

-- ─── Fix transactions.reference_id (UUID → TEXT) ─────────────────────────────
-- The Mini-App purchase route inserts an integer product ID (e.g. "10") into
-- reference_id.  If the column is still UUID (from an older schema run), the
-- cast fails with "invalid input syntax for type uuid".  Convert it to TEXT.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'transactions'
      AND column_name = 'reference_id'
      AND udt_name    = 'uuid'
  ) THEN
    ALTER TABLE transactions
      ALTER COLUMN reference_id TYPE TEXT USING reference_id::TEXT;
  END IF;
END $$;

-- ─── Fix product_holdings.product_id (UUID → INT) ────────────────────────────
-- Migration 101_mini_app_enhancements.sql defined product_id as UUID, but
-- nft_products.id is SERIAL (INT).  The 999_ensure_all_tables.sql already
-- defines it as INT for fresh installs; this block repairs existing databases
-- where 101 ran first and left a UUID column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'product_holdings'
      AND column_name = 'product_id'
      AND udt_name    = 'uuid'
  ) THEN
    -- Drop any FK referencing this column first
    ALTER TABLE product_holdings
      DROP CONSTRAINT IF EXISTS product_holdings_product_id_fkey;

    -- UUID values stored here were inserted by migration 101 using the wrong
    -- column type.  nft_products.id is SERIAL (INT), so no valid integer IDs
    -- were ever written into this UUID column — they cannot be converted.
    -- Null them out before the type change to avoid a failed USING cast.
    UPDATE product_holdings SET product_id = NULL;

    ALTER TABLE product_holdings
      ALTER COLUMN product_id TYPE INT USING NULL;

    BEGIN
      ALTER TABLE product_holdings
        ADD CONSTRAINT product_holdings_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES nft_products(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;
