-- Migration 1052: Ensure invite message and card-image settings are marked
-- is_public = true so that the Bot-internal /bot/invite endpoint can read them.
--
-- Background: the GET /api/admin/system-settings/bot/invite endpoint queries
--   WHERE category = 'invite' AND is_public = true
-- invite_card_image and invite_message_* must be public for the Bot to work.
-- Reward-related keys (invite_reward_amount, invite_reward_enabled) intentionally
-- remain is_public = false as they are admin-only configuration.

UPDATE system_settings
SET is_public = true
WHERE category = 'invite'
  AND key IN (
    'invite_card_image',
    'invite_message',
    'invite_message_zh',
    'invite_message_en',
    'invite_message_fr',
    'invite_message_de',
    'invite_message_es',
    'invite_message_ar',
    'invite_message_ja'
  );
