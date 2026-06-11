-- Add ignore_reward flag to invitations table for admin manual management
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS ignore_reward BOOLEAN NOT NULL DEFAULT FALSE;
