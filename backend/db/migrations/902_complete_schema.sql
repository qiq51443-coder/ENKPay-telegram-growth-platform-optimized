-- Migration 902: Complete Schema – ensure all tables/columns required by bot-manager and wallet flows exist
-- This migration is fully idempotent (uses IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix withdraw_password column size (migration 400 used VARCHAR(4) which is
--    too small for a bcrypt hash; bcrypt hashes are ~60 chars).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'withdraw_password'
      AND character_maximum_length IS NOT NULL
      AND character_maximum_length < 128
  ) THEN
    ALTER TABLE users ALTER COLUMN withdraw_password TYPE VARCHAR(128);
  END IF;
END $$;

-- Ensure the column exists even if migration 400 was not run
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_password VARCHAR(128) DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add missing users columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_password_set BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unique_id VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(18,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reward_balance DECIMAL(18,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_balance DECIMAL(18,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_transferred_out DECIMAL(18,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_transferred_in DECIMAL(18,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_unique_id ON users(unique_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Bot-settings table (queried by bot-manager.service.ts on every request)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_settings (
  id SERIAL PRIMARY KEY,
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE UNIQUE,
  new_user_credits INT DEFAULT 3,
  webapp_url TEXT,
  welcome_message TEXT,
  support_telegram VARCHAR(100),
  invite_share_text TEXT,
  invite_button_text VARCHAR(200),
  bot_username VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Bots table – add missing columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE bots ADD COLUMN IF NOT EXISTS default_language VARCHAR(10) DEFAULT 'en';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS username VARCHAR(100);
ALTER TABLE bots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Deposit networks – ensure default networks exist
-- ─────────────────────────────────────────────────────────────────────────────
-- The main schema creates deposit_networks; we just ensure default rows exist.
-- On conflict (duplicate network_name) we do nothing.
INSERT INTO deposit_networks
  (network_name, network_display, chain_name, min_deposit_amount, is_active, sort_order)
VALUES
  ('TRC', 'TRC20 (USDT)', 'TRON', 1.0,  true, 1),
  ('BSC', 'BSC (BEP20)',  'BSC',  1.0,  true, 2),
  ('ETH', 'ETH (ERC20)',  'ETH',  10.0, true, 3)
ON CONFLICT (network_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. user_deposit_addresses – ensure table and index exist
--    (the main schema already creates this; kept here for safety)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_deposit_addresses (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  network_id INT REFERENCES deposit_networks(id) ON DELETE CASCADE,
  address VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, network_id)
);
CREATE INDEX IF NOT EXISTS idx_user_deposit_addresses_user_id ON user_deposit_addresses(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. withdrawal_records – add order_id column (also in migration 500, kept
--    here with IF NOT EXISTS for safety)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE withdrawal_records ADD COLUMN IF NOT EXISTS order_id VARCHAR(11) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_withdrawal_records_order_id ON withdrawal_records(order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. transfer_records – add order_id column
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE transfer_records ADD COLUMN IF NOT EXISTS order_id VARCHAR(11) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_transfer_records_order_id ON transfer_records(order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Announcements table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  images JSONB,
  status VARCHAR(20) DEFAULT 'draft',
  is_pinned BOOLEAN DEFAULT false,
  show_on_app_launch BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. System settings – add invite and webapp entries
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO system_settings (key, value, description, category, is_public)
VALUES
  ('invite_enabled',              'true',     'Enable invitation system',                      'invite',  false),
  ('invite_reward_amount',        '1.0',      'Reward amount for inviter (USDT)',               'invite',  false),
  ('invite_reward_type',          '"balance"','Reward type: balance or redpacket',              'invite',  false),
  ('mini_app_url',                '""',       'Mini App WebApp URL shown in bot buttons',       'general', true),
  ('min_withdrawal_amount',       '10',       'Minimum withdrawal amount (USDT)',               'wallet',  false),
  ('max_withdrawal_amount',       '50000',    'Maximum withdrawal amount (USDT)',               'wallet',  false),
  ('transfer_fee_rate',           '0',        'Transfer fee rate (0 = free)',                   'wallet',  false),
  ('redpacket_validity_days',     '7',        'Red packet validity period in days',             'redpacket', false),
  ('redpacket_claim_condition',   '"all"',    'Who can claim: all / new_users / trade_volume',  'redpacket', false),
  ('redpacket_wagering_multiplier','3',       'Trading volume multiplier to unlock red packet', 'redpacket', false)
ON CONFLICT (key) DO NOTHING;
