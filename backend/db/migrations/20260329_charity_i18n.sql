-- Add i18n JSONB columns to charity_projects
ALTER TABLE charity_projects
  ADD COLUMN IF NOT EXISTS title_i18n JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description_i18n JSONB NOT NULL DEFAULT '{}';

-- Add i18n JSONB column to charity_banners
ALTER TABLE charity_banners
  ADD COLUMN IF NOT EXISTS title_i18n JSONB NOT NULL DEFAULT '{}';

-- GIN indexes for fast JSONB lookups
CREATE INDEX IF NOT EXISTS idx_charity_projects_title_i18n ON charity_projects USING GIN (title_i18n);
CREATE INDEX IF NOT EXISTS idx_charity_projects_description_i18n ON charity_projects USING GIN (description_i18n);
