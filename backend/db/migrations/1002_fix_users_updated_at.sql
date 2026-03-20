-- Migration 1002_fix_users_updated_at.sql
-- Defensive: add updated_at column to users if it does not exist.
-- The primary fix is in miniapp-shared.ts (use last_active_at instead),
-- but this migration ensures any legacy references to updated_at do not crash.

-- Ensure the trigger function exists (already created in 010, but guard here too)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Backfill from last_active_at or created_at
UPDATE users SET updated_at = COALESCE(last_active_at, created_at) WHERE updated_at IS NULL;

-- Add trigger so updated_at stays in sync going forward
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_users_updated_at'
  ) THEN
    CREATE TRIGGER trigger_update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
