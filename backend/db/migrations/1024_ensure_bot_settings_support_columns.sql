-- Migration 1024: Ensure all bot_settings columns added after initial deployment exist.
-- These columns were appended to schema.sql after the first deploy and therefore
-- never ran on existing databases. This migration is the canonical fix.

ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS welcome_image_url TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS official_group_url TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS official_channel_url TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS support_telegram TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS wallet_tip_message TEXT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS transfer_min_amount DECIMAL(10,2);
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS withdraw_min_amount DECIMAL(10,2);
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS withdraw_fee_rate DECIMAL(6,5);
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS deposit_confirm_blocks INT;
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS official_group_urls TEXT[] DEFAULT '{}';
ALTER TABLE bot_settings ADD COLUMN IF NOT EXISTS official_channel_urls TEXT[] DEFAULT '{}';
