-- Migration 1051: Add reward_amount column to invitations table
-- Tracks the actual USDT amount rewarded per invitation event

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS reward_amount DECIMAL(10,2) DEFAULT 0;

-- Backfill: set reward_amount for already-rewarded invitations using the
-- current system_settings value (default 2.00 if not configured)
UPDATE invitations
SET reward_amount = COALESCE(
  (
    SELECT CAST(
      CASE
        WHEN value ~ '^[0-9]+(\.[0-9]+)?$' THEN value
        WHEN value ~ '^"[0-9]+(\.[0-9]+)?"$' THEN TRIM(BOTH '"' FROM value)
        ELSE '2.00'
      END AS DECIMAL(10,2)
    )
    FROM system_settings
    WHERE key = 'invite_reward_amount'
    LIMIT 1
  ),
  2.00
)
WHERE reward_paid = true
  AND (reward_amount IS NULL OR reward_amount = 0);

-- Ensure invite_reward_amount exists in system_settings
INSERT INTO system_settings (key, value, description, category, is_public)
VALUES ('invite_reward_amount', '2.00', '每次邀请奖励金额 (USDT)', 'invite', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_settings (key, value, description, category, is_public)
VALUES ('invite_reward_enabled', 'true', '是否启用邀请奖励', 'invite', false)
ON CONFLICT (key) DO NOTHING;
