-- Migration 951: Fix charity_projects column names to match charity.ts routes
-- The routes expect: target_amount, start_at, end_at, show_in_app
-- Migration 950 may have created wrong names: goal_amount, start_date, end_date

-- Rename goal_amount -> target_amount (if goal_amount exists and target_amount doesn't)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'charity_projects' AND column_name = 'goal_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'charity_projects' AND column_name = 'target_amount'
  ) THEN
    ALTER TABLE charity_projects RENAME COLUMN goal_amount TO target_amount;
  END IF;
END $$;

-- Add target_amount if neither column exists
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS target_amount DECIMAL(10, 2) DEFAULT 0 CHECK (target_amount >= 0);

-- Rename start_date -> start_at (if start_date exists and start_at doesn't)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'charity_projects' AND column_name = 'start_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'charity_projects' AND column_name = 'start_at'
  ) THEN
    ALTER TABLE charity_projects RENAME COLUMN start_date TO start_at;
  END IF;
END $$;

-- Add start_at if neither column exists
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;

-- Rename end_date -> end_at (if end_date exists and end_at doesn't)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'charity_projects' AND column_name = 'end_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'charity_projects' AND column_name = 'end_at'
  ) THEN
    ALTER TABLE charity_projects RENAME COLUMN end_date TO end_at;
  END IF;
END $$;

-- Add end_at if neither column exists
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;

-- Add show_in_app if missing (this column is required by charity.ts)
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS show_in_app BOOLEAN NOT NULL DEFAULT true;

-- Ensure raised_amount column exists
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS raised_amount DECIMAL(10, 2) DEFAULT 0 CHECK (raised_amount >= 0);

-- Ensure other required columns exist
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS ambassador_telegram TEXT;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
