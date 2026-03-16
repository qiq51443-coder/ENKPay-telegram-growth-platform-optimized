-- Migration 963: Add missing columns to invitations table
-- Date: 2026-03-16
--
-- The invitations table in schema.sql only has: inviter_id, invitee_id, reward_amount, reward_paid
-- Several service files reference additional columns that don't exist yet:
--   - follow_reward_paid (used by redpackets.ts claim logic)
--   - invitee_first_interaction (used by redpackets.ts claim logic)
--   - trade_reward_paid (used by invitation-reward.service.ts)
--   - trade_reward_paid_l2 (used by invitation-reward.service.ts)
--   - invitee_first_trade (used by invitation-reward.service.ts)

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS follow_reward_paid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS invitee_first_interaction TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trade_reward_paid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade_reward_paid_l2 BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS invitee_first_trade TIMESTAMPTZ;
