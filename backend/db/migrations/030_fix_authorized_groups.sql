-- Migration: Fix authorized_groups table missing columns
-- This is idempotent and safe to re-run

ALTER TABLE authorized_groups ADD COLUMN IF NOT EXISTS group_type VARCHAR(20) DEFAULT 'group';
ALTER TABLE authorized_groups ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE authorized_groups ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE authorized_groups ADD COLUMN IF NOT EXISTS member_count INTEGER;
ALTER TABLE authorized_groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE authorized_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
