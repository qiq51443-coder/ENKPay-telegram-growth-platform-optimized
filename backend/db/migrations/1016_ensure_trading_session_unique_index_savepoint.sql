-- Migration 1016: Ensure the unique partial index on trading_sessions exists.
-- This index is required for ON CONFLICT (pair_id, duration_seconds, period_label).
-- Safe to run multiple times (uses IF NOT EXISTS).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_sessions' AND column_name = 'period_label'
  ) THEN
    -- Remove duplicates first (keeps earliest created_at per group)
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

    -- Create unique index if missing
    EXECUTE $idx$
      CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_sessions_period_unique
        ON trading_sessions (pair_id, duration_seconds, period_label)
        WHERE period_label IS NOT NULL
    $idx$;
  END IF;
END $$;
