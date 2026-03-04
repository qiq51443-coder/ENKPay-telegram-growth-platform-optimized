-- Migration: Add withdraw_password to users table and new system settings

-- Add withdraw_password field to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_password VARCHAR(4) DEFAULT NULL;

-- Add new system settings for support, invite, and rewards
INSERT INTO system_settings (key, value, description, category, is_public)
VALUES
  ('support_telegram', '', 'Customer support Telegram username', 'general', false),
  ('invite_share_text', '', 'Invite share text template', 'general', false),
  ('invite_button_text', '立即加入', 'Invite share card button text', 'general', false),
  ('follow_bot_reward', '0', 'Reward amount for following the bot', 'rewards', false),
  ('share_reward', '0', 'Reward amount for sharing', 'rewards', false)
ON CONFLICT (key) DO NOTHING;
