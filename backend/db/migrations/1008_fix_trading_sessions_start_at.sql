-- Migration 1008: Fix trading_sessions column naming inconsistency
-- The code uses start_time/end_time but schema has start_at/end_at NOT NULL
-- This migration:
-- 1. Ensures start_time/end_time columns exist
-- 2. Backfills start_time/end_time from start_at/end_at for existing rows
-- 3. Backfills start_at/end_at from start_time/end_time for existing rows
-- 4. Drops NOT NULL constraints from start_at/end_at (old columns, no longer used by code)
-- 5. Makes start_time/end_time NOT NULL (the columns used by current code)
-- 6. Updates indexes accordingly

-- Step 1: Ensure start_time/end_time columns exist (they may already from migration 1004)
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMP;
ALTER TABLE trading_sessions
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;

-- Step 2: Backfill start_time/end_time from start_at/end_at for existing rows
UPDATE trading_sessions
SET start_time = start_at
WHERE start_time IS NULL AND start_at IS NOT NULL;

UPDATE trading_sessions
SET end_time = end_at
WHERE end_time IS NULL AND end_at IS NOT NULL;

-- Step 3: Backfill start_at/end_at from start_time/end_time for existing rows
UPDATE trading_sessions
SET start_at = start_time
WHERE start_at IS NULL AND start_time IS NOT NULL;

UPDATE trading_sessions
SET end_at = end_time
WHERE end_at IS NULL AND end_time IS NOT NULL;

-- Step 4: Drop NOT NULL from start_at/end_at (old columns, no longer used by code)
ALTER TABLE trading_sessions
  ALTER COLUMN start_at DROP NOT NULL;
ALTER TABLE trading_sessions
  ALTER COLUMN end_at DROP NOT NULL;

-- Step 5: Make start_time/end_time NOT NULL (the columns used by current code)
-- First set a default for any remaining nulls
UPDATE trading_sessions SET start_time = created_at WHERE start_time IS NULL;
UPDATE trading_sessions SET end_time = created_at + (COALESCE(duration_seconds, 60) * interval '1 second') WHERE end_time IS NULL;

ALTER TABLE trading_sessions
  ALTER COLUMN start_time SET NOT NULL;
ALTER TABLE trading_sessions
  ALTER COLUMN end_time SET NOT NULL;

-- Step 6: Update any indexes that referenced start_at
DROP INDEX IF EXISTS idx_trading_sessions_start_at;
CREATE INDEX IF NOT EXISTS idx_trading_sessions_start_time ON trading_sessions(start_time);
