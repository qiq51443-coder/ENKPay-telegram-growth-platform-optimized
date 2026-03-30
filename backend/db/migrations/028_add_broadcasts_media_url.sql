-- Migration 028: Add media_url to broadcasts table
-- Note: content_translations and title_translations are handled by migration 027.
-- schema.sql also includes idempotent ALTER TABLE statements for all three columns
-- to ensure fresh-install environments get them as well.

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_url TEXT;
