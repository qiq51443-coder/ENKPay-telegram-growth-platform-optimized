-- Add welcome image URL and official group/channel link fields to bot_settings
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS welcome_image_url TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS official_group_url TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS official_channel_url TEXT;
