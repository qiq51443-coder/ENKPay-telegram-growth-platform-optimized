-- Migration 1017: Fix open_price alignment and ensure unique session index
-- Safe to run multiple times (idempotent).

-- 1. Remove exact duplicates (same pair_id + duration_seconds + period_label),
--    keeping only the row with the lowest id (first created).
--    This cleans up duplicate sessions caused by the missing unique index.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_sessions' AND column_name = 'period_label'
  ) THEN
    DELETE FROM trading_sessions
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM trading_sessions
      WHERE period_label IS NOT NULL
      GROUP BY pair_id, duration_seconds, period_label
    )
    AND period_label IS NOT NULL
    AND status IN ('pending', 'active');
  END IF;
END $$;

-- 2. Ensure the unique partial index exists (prevents future duplicate sessions).
--    This is the prerequisite for ON CONFLICT (pair_id, duration_seconds, period_label) DO NOTHING
--    to work correctly in the application code.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trading_sessions' AND column_name = 'period_label'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_sessions_period_unique
      ON trading_sessions (pair_id, duration_seconds, period_label)
      WHERE period_label IS NOT NULL;
  END IF;
END $$;

-- 3. Optional: Refund users whose orders were settled as 'lose' due to misaligned open_price.
--    This block is commented out and must be reviewed + uncommented manually before applying.
--    Only affects orders settled in the last 24 hours where the session had no open_price
--    recorded at the time (indicating the old buggy kline fetch was used).
--
-- UPDATE users u
-- SET wallet_balance = wallet_balance + ABS(o.profit)
-- FROM trading_orders o
-- JOIN trading_sessions s ON s.id = o.session_id
-- WHERE o.result = 'lose'
--   AND o.settled_at >= NOW() - INTERVAL '24 hours'
--   AND s.open_price IS NULL
-- ;
