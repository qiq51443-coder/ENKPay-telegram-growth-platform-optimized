-- =====================================================================
-- WARNING: THIS OPERATION IS IRREVERSIBLE.
-- It permanently clears user financial flow data and resets user balances.
-- Please back up the database before running this script.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  numeric_columns TEXT[] := ARRAY[
    'balance',
    'wallet_balance',
    'reward_balance',
    'frozen_balance',
    'total_recharged',
    'total_withdrawn',
    'total_traded',
    'total_transferred_out',
    'total_transferred_in',
    'reward_unlock_traded'
  ];
  target_column_name TEXT;
  set_clauses TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN;
  END IF;

  FOREACH target_column_name IN ARRAY numeric_columns LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = target_column_name
    ) THEN
      set_clauses := array_append(set_clauses, format('%I = 0', target_column_name));
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'is_first_trade_done'
  ) THEN
    set_clauses := array_append(set_clauses, 'is_first_trade_done = false');
  END IF;

  IF array_length(set_clauses, 1) IS NOT NULL THEN
    EXECUTE 'UPDATE public.users SET ' || array_to_string(set_clauses, ', ');
  END IF;
END $$;

DO $$
DECLARE
  tables_to_truncate TEXT[] := ARRAY[
    'public.transactions',
    'public.orders',
    'public.deposit_records',
    'public.withdrawal_records',
    'public.transfer_records',
    'public.red_packet_claims',
    'public.red_packets',
    'public.balance_adjustments',
    'public.trading_orders',
    'public.trading_sessions',
    'public.nft_yield_logs',
    'public.user_nft_holdings',
    'public.auction_entries',
    'public.lucky_auction_participants',
    'public.lucky_auction_results',
    'public.lucky_auctions'
  ];
  target_table_name TEXT;
BEGIN
  FOREACH target_table_name IN ARRAY tables_to_truncate LOOP
    IF to_regclass(target_table_name) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE %s RESTART IDENTITY CASCADE', target_table_name);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.nft_products') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'nft_products'
         AND column_name = 'remaining_supply'
     )
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'nft_products'
         AND column_name = 'total_supply'
     ) THEN
    EXECUTE 'UPDATE public.nft_products SET remaining_supply = total_supply';
  END IF;
END $$;

DO $$
DECLARE
  set_clauses TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.auctions') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'auctions'
      AND column_name = 'sold_shares'
  ) THEN
    set_clauses := array_append(set_clauses, 'sold_shares = 0');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'auctions'
      AND column_name = 'winner_id'
  ) THEN
    set_clauses := array_append(set_clauses, 'winner_id = NULL');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'auctions'
      AND column_name = 'winning_share_number'
  ) THEN
    set_clauses := array_append(set_clauses, 'winning_share_number = NULL');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'auctions'
      AND column_name = 'draw_seed'
  ) THEN
    set_clauses := array_append(set_clauses, 'draw_seed = NULL');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'auctions'
      AND column_name = 'status'
  ) THEN
    set_clauses := array_append(set_clauses, 'status = ''upcoming''');
  END IF;

  IF array_length(set_clauses, 1) IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'auctions'
         AND column_name = 'status'
     ) THEN
    EXECUTE
      'UPDATE public.auctions SET '
      || array_to_string(set_clauses, ', ')
      || ' WHERE status IN (''finished'', ''drawing'')';
  END IF;
END $$;

COMMIT;

SELECT 'Data cleared successfully' AS status;
