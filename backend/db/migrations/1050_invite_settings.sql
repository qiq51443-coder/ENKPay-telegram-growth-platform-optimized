-- Migration: Invite Settings
-- Adds system_settings keys for invitation card, message, and reward configuration

INSERT INTO system_settings (key, value, description, category, is_public)
VALUES
  ('invite_card_image',    '""',    '邀请卡图片 URL',           'invite', true),
  ('invite_reward_enabled','true',  '是否启用邀请奖励',          'invite', false),
  ('invite_reward_amount', '2.00',  '每次邀请奖励金额 (USDT)',   'invite', false),
  ('invite_message',       '""',    '邀请语（默认）',            'invite', true),
  ('invite_message_zh',    '""',    '邀请语 - 中文',             'invite', true),
  ('invite_message_en',    '""',    '邀请语 - English',          'invite', true),
  ('invite_message_fr',    '""',    '邀请语 - Français',         'invite', true),
  ('invite_message_de',    '""',    '邀请语 - Deutsch',          'invite', true),
  ('invite_message_es',    '""',    '邀请语 - Español',          'invite', true),
  ('invite_message_ar',    '""',    '邀请语 - العربية',          'invite', true),
  ('invite_message_ja',    '""',    '邀请语 - 日本語',           'invite', true)
ON CONFLICT (key) DO NOTHING;
