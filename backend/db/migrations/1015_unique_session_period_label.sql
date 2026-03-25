-- Migration 1015: Add unique constraint on (pair_id, duration_seconds, period_label)
-- to prevent duplicate sessions from race conditions in the quick-session endpoint.

-- First remove duplicate sessions keeping only the earliest created one per unique key.
-- Uses a CTE with NOT EXISTS to avoid NOT IN performance/NULL pitfalls on large tables.
WITH keepers AS (
  SELECT DISTINCT ON (pair_id, duration_seconds, period_label) id
  FROM trading_sessions
  WHERE period_label IS NOT NULL
  ORDER BY pair_id, duration_seconds, period_label, created_at ASC
)
DELETE FROM trading_sessions ts
WHERE ts.period_label IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM keepers k WHERE k.id = ts.id);

-- Add unique partial index (only for rows where period_label IS NOT NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_sessions_period_unique
  ON trading_sessions (pair_id, duration_seconds, period_label)
  WHERE period_label IS NOT NULL;
