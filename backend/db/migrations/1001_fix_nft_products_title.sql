-- Migration 1001: Fix nft_products title column
-- Allow title to be nullable so that existing rows and new inserts
-- that omit title do not break. The application layer always sets
-- title = name when creating/updating products.

ALTER TABLE nft_products
  ALTER COLUMN title DROP NOT NULL;

-- Back-fill any existing rows where title is NULL
DO $$
DECLARE
  rows_updated INT;
BEGIN
  UPDATE nft_products
    SET title = name
  WHERE title IS NULL;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RAISE NOTICE 'Back-filled title for % row(s)', rows_updated;
END $$;
