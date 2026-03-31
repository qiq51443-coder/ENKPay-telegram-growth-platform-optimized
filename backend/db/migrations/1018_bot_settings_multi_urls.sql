-- Add multi-URL array columns to bot_settings (idempotent)
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS official_group_urls TEXT[] DEFAULT '{}';
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS official_channel_urls TEXT[] DEFAULT '{}';
