-- Migration 300: Enhance Groups Management
-- Date: 2026-03-04

-- Add country and language fields to authorized_groups
ALTER TABLE authorized_groups
  ADD COLUMN IF NOT EXISTS country VARCHAR(50),
  ADD COLUMN IF NOT EXISTS language VARCHAR(10),
  ADD COLUMN IF NOT EXISTS member_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_authorized_groups_country ON authorized_groups(country);
CREATE INDEX IF NOT EXISTS idx_authorized_groups_language ON authorized_groups(language);
CREATE INDEX IF NOT EXISTS idx_authorized_groups_is_active ON authorized_groups(is_active);
