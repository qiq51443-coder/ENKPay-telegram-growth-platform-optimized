-- Migration 029: Ensure all extended broadcasts columns exist
-- Safe to run multiple times (IF NOT EXISTS)
-- Covers columns that were previously only added in schema.sql ALTER TABLE section
-- (target_users, pin_message) and mirrors 027/028 for completeness on environments
-- where those migrations may not have run.

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS target_users TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS pin_message BOOLEAN DEFAULT false;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS content_translations JSONB DEFAULT '{}';
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS title_translations JSONB DEFAULT '{}';
