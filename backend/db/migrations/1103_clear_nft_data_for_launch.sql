-- =====================================================================
-- WARNING: THIS OPERATION IS IRREVERSIBLE.
-- It permanently clears NFT test holdings, balances, and income records.
-- Please back up the database before running this script.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  tables_to_clear TEXT[] := ARRAY[
    'public.nft_income_records',
    'public.nft_yield_logs',
    'public.nft_holdings',
    'public.user_nft_holdings',
    'public.product_holdings',
    'public.nft_orders'
  ];
  target_table_name TEXT;
BEGIN
  FOREACH target_table_name IN ARRAY tables_to_clear LOOP
    IF to_regclass(target_table_name) IS NOT NULL THEN
      EXECUTE format('DELETE FROM %s', target_table_name);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.transactions') IS NOT NULL THEN
    EXECUTE $sql$
      DELETE FROM public.transactions
      WHERE type IN (
        'nft_purchase',
        'nft_income',
        'nft_principal_return',
        'product_purchase',
        'product_yield',
        'product_refund'
      )
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'users'
         AND column_name = 'nft_balance'
     ) THEN
    EXECUTE 'UPDATE public.users SET nft_balance = 0 WHERE nft_balance IS NOT NULL AND nft_balance != 0';
  END IF;
END $$;

DO $$
DECLARE
  set_clauses TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.nft_products') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nft_products'
      AND column_name = 'total_supply'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nft_products'
      AND column_name = 'remaining_supply'
  ) THEN
    set_clauses := array_append(set_clauses, 'remaining_supply = total_supply');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nft_products'
      AND column_name = 'current_holders'
  ) THEN
    set_clauses := array_append(set_clauses, 'current_holders = 0');
  END IF;

  IF array_length(set_clauses, 1) IS NOT NULL THEN
    EXECUTE
      'UPDATE public.nft_products SET '
      || array_to_string(set_clauses, ', ')
      || ' WHERE total_supply IS NOT NULL';
  END IF;
END $$;

COMMIT;

SELECT 'NFT test data cleared for launch' AS status;
