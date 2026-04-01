-- Migration 1030: Fix system_settings value column type
-- Convert value column from JSONB to TEXT if needed, to avoid json parse errors

DO $$
BEGIN
  -- If value column is JSONB, convert to TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_settings'
      AND column_name = 'value'
      AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE system_settings ALTER COLUMN value TYPE TEXT USING value::text;
  END IF;
END $$;

-- Ensure value column has a default of empty JSON string
ALTER TABLE system_settings ALTER COLUMN value SET DEFAULT '""';

-- Fix any NULL or empty values
UPDATE system_settings SET value = '""' WHERE value IS NULL OR value = '';
