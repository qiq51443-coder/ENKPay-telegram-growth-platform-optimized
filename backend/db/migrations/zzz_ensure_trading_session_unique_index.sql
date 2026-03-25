-- Safety-net migration: ensure the unique partial index on trading_sessions exists.
-- This index is required by ON CONFLICT (pair_id, duration_seconds, period_label)
-- in the quick-session order placement endpoint.
-- Uses IF NOT EXISTS for full idempotency — safe to run multiple times.

-- Step 1: Remove duplicate period_label rows, keeping the earliest created one.
-- This must run before the UNIQUE index is created to avoid constraint violations.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_sessions' AND column_name = 'period_label'
  ) THEN
    -- Delete duplicates, keeping earliest created_at per (pair_id, duration_seconds, period_label).
    -- Uses NOT EXISTS with a subquery (consistent with migration 1015) to avoid NOT IN
    -- performance pitfalls on large tables.
    DELETE FROM trading_sessions ts
    WHERE period_label IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT DISTINCT ON (pair_id, duration_seconds, period_label) id
          FROM trading_sessions
          WHERE period_label IS NOT NULL
          ORDER BY pair_id, duration_seconds, period_label, created_at ASC
        ) keepers
        WHERE keepers.id = ts.id
      );
  END IF;
END $$;

-- Step 2: Create the unique partial index if it does not already exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_sessions' AND column_name = 'period_label'
  ) THEN
    -- Attempt to create index only if column exists
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_sessions_period_unique
        ON trading_sessions (pair_id, duration_seconds, period_label)
        WHERE period_label IS NOT NULL
    $idx$;
  END IF;
END $$;
