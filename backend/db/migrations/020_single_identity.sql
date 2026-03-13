-- ============================================================
-- Migration 020: Single identity per Telegram user
-- One account per telegram_id across all bots
-- ============================================================

BEGIN;

-- Step 1: Drop the old compound unique constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_bot_id_telegram_id_key;

-- Step 2: Add UNIQUE constraint on telegram_id alone
-- First remove any duplicate telegram_ids by keeping only the oldest record
-- (merge balances before deleting duplicates)
DO $$
DECLARE
  dup RECORD;
  canon_id UUID;
BEGIN
  FOR dup IN
    SELECT telegram_id
    FROM users
    GROUP BY telegram_id
    HAVING COUNT(*) > 1
  LOOP
    -- Find canonical (oldest) record
    SELECT id INTO canon_id
    FROM users
    WHERE telegram_id = dup.telegram_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- Merge balances from all duplicates into canonical
    UPDATE users
    SET
      wallet_balance      = (SELECT COALESCE(SUM(wallet_balance), 0)      FROM users WHERE telegram_id = dup.telegram_id),
      reward_balance      = (SELECT COALESCE(SUM(reward_balance), 0)      FROM users WHERE telegram_id = dup.telegram_id),
      red_packet_credits  = (SELECT COALESCE(SUM(red_packet_credits), 0)  FROM users WHERE telegram_id = dup.telegram_id),
      nft_balance         = (SELECT COALESCE(SUM(nft_balance), 0)         FROM users WHERE telegram_id = dup.telegram_id),
      frozen_balance      = (SELECT COALESCE(SUM(frozen_balance), 0)      FROM users WHERE telegram_id = dup.telegram_id)
    WHERE id = canon_id;

    -- Re-parent all FK references to canonical
    UPDATE deposit_records    SET user_id = canon_id WHERE user_id IN (SELECT id FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id);
    UPDATE withdrawal_records SET user_id = canon_id WHERE user_id IN (SELECT id FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id);
    UPDATE transfer_records   SET from_user_id = canon_id WHERE from_user_id IN (SELECT id FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id);
    UPDATE transfer_records   SET to_user_id   = canon_id WHERE to_user_id   IN (SELECT id FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id);
    UPDATE transactions       SET user_id = canon_id WHERE user_id IN (SELECT id FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id);
    UPDATE orders             SET user_id = canon_id WHERE user_id IN (SELECT id FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id);
    UPDATE red_packet_claims  SET user_id = canon_id WHERE user_id IN (SELECT id FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id);
    UPDATE user_deposit_addresses SET user_id = canon_id WHERE user_id IN (SELECT id FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id);
    UPDATE invitations        SET inviter_id = canon_id WHERE inviter_id IN (SELECT id FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id);
    UPDATE invitations        SET invitee_id = canon_id WHERE invitee_id IN (SELECT id FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id);

    -- Delete duplicates
    DELETE FROM users WHERE telegram_id = dup.telegram_id AND id <> canon_id;
  END LOOP;
END $$;

-- Step 3: Now safe to add unique constraint
ALTER TABLE users ADD CONSTRAINT users_telegram_id_key UNIQUE (telegram_id);

-- Step 4: Make bot_id nullable (it now records which bot the user first registered with)
-- bot_id is kept for historical reference, but is no longer the identity key
ALTER TABLE users ALTER COLUMN bot_id DROP NOT NULL;

-- Step 5: Add a user_bot_memberships table to track which bots a user has interacted with
CREATE TABLE IF NOT EXISTS user_bot_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, bot_id)
);

CREATE INDEX IF NOT EXISTS idx_user_bot_memberships_user_id ON user_bot_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bot_memberships_bot_id ON user_bot_memberships(bot_id);

COMMIT;
