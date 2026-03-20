-- Migration 1004: Fix trading_sessions open_price constraint
-- The quick-session route now provides open_price on INSERT, but other code paths
-- (e.g. admin session creation) do not supply open_price, so allow NULL for those cases.

-- Make open_price nullable to support session creation flows that don't set an open price
ALTER TABLE trading_sessions 
  ALTER COLUMN open_price DROP NOT NULL;

-- Add start_time/end_time columns if they don't exist (for the quick-session route)
ALTER TABLE trading_sessions 
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMP;
ALTER TABLE trading_sessions 
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;

-- Backfill start_time/end_time from start_at/end_at if those exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'trading_sessions' AND column_name = 'start_at'
  ) THEN
    UPDATE trading_sessions SET start_time = start_at WHERE start_time IS NULL;
    UPDATE trading_sessions SET end_time = end_at WHERE end_time IS NULL;
  END IF;
END $$;
