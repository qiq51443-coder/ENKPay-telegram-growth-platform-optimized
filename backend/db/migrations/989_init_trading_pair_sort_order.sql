-- Migration 989: Ensure icon_url and sort_order on trading_pairs, initialise sort values
-- Idempotent: safe to run multiple times

ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS icon_url TEXT;
ALTER TABLE trading_pairs ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- Initialise sort_order for any rows that still have the default 0 so that
-- the ordering is deterministic.  Newest pair gets sort_order=1 so it
-- appears first, matching the previous ORDER BY created_at DESC behaviour.
UPDATE trading_pairs
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
  FROM trading_pairs
  WHERE sort_order = 0
) sub
WHERE trading_pairs.id = sub.id;

CREATE INDEX IF NOT EXISTS idx_trading_pairs_sort_order ON trading_pairs(sort_order);
