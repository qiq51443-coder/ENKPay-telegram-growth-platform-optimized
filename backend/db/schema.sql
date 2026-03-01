-- Telegram Growth Platform Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Bots table
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  username TEXT,
  is_active BOOLEAN DEFAULT true,
  webhook_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code VARCHAR(10) DEFAULT 'en',
  robot_user_id TEXT UNIQUE, -- Permanent Bot ID
  invite_code TEXT UNIQUE,
  invited_by UUID REFERENCES users(id),
  balance DECIMAL(10, 2) DEFAULT 0,
  platform_username TEXT,
  platform_bound BOOLEAN DEFAULT false,
  platform_status VARCHAR(20) DEFAULT 'unbound', -- unbound, pending, active, suspended
  account_status VARCHAR(20) DEFAULT 'active', -- active, inactive, banned
  channel_followed BOOLEAN DEFAULT false,
  group_joined BOOLEAN DEFAULT false,
  follow_reward_unlocked BOOLEAN DEFAULT false,
  bind_reward_unlocked BOOLEAN DEFAULT false,
  red_packet_credits INT DEFAULT 3, -- Red packet claiming credits
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bot_id, telegram_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_robot_user_id ON users(robot_user_id);
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);

-- Platform bindings table
CREATE TABLE IF NOT EXISTS platform_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  platform_username TEXT NOT NULL,
  screenshot_file_id TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  admin_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- follow_channel, join_group, bind_platform, invite
  title TEXT NOT NULL,
  description TEXT,
  reward_amount DECIMAL(10, 2) DEFAULT 0,
  target_id TEXT, -- Channel/Group ID
  is_required BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User tasks completion
CREATE TABLE IF NOT EXISTS user_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  reward_claimed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, task_id)
);

-- Invitations tracking
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID REFERENCES users(id) ON DELETE CASCADE,
  invitee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reward_amount DECIMAL(10, 2) DEFAULT 0,
  reward_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inviter_id, invitee_id)
);

-- Red packets table
CREATE TABLE IF NOT EXISTS red_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  message_id BIGINT,
  title TEXT,
  total_amount DECIMAL(10, 2) NOT NULL,
  total_count INT NOT NULL,
  claimed_count INT DEFAULT 0,
  claimed_amount DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active', -- active, expired, finished
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Red packet claims
CREATE TABLE IF NOT EXISTS red_packet_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  red_packet_id UUID REFERENCES red_packets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(red_packet_id, user_id)
);

-- Earnings screenshots table (NEW)
CREATE TABLE IF NOT EXISTS earnings_screenshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  group_id BIGINT,
  message_id BIGINT,
  file_id TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  admin_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Broadcasts table (NEW)
CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  target_type VARCHAR(20) DEFAULT 'all', -- all, active, bound
  status VARCHAR(20) DEFAULT 'draft', -- draft, sending, sent, failed
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exchanges table (NEW)
CREATE TABLE IF NOT EXISTS exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_zh TEXT,
  logo_url TEXT,
  register_url TEXT,
  tutorial_content JSONB, -- {en: "...", zh: "...", fr: "...", es: "...", ar: "..."}
  is_active BOOLEAN DEFAULT true,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- reward, red_packet, invite, withdrawal
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  description TEXT,
  reference_id UUID, -- Reference to related record
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email TEXT,
  role VARCHAR(20) DEFAULT 'admin', -- admin, super_admin
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bot settings (for real-time sync)
CREATE TABLE IF NOT EXISTS bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE UNIQUE,
  platform_name TEXT,
  platform_url TEXT,
  platform_register_url TEXT,
  required_channel_id TEXT,
  required_group_id TEXT,
  screenshot_group_id TEXT,
  follow_reward DECIMAL(10, 2) DEFAULT 50,
  bind_reward DECIMAL(10, 2) DEFAULT 100,
  invite_reward DECIMAL(10, 2) DEFAULT 25,
  new_user_credits INT DEFAULT 3,
  screenshot_reward_credits INT DEFAULT 1,
  welcome_message JSONB, -- Multi-language welcome messages
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create function to generate unique robot_user_id
CREATE OR REPLACE FUNCTION generate_robot_user_id()
RETURNS TEXT AS $$
DECLARE
  new_id TEXT;
  done BOOLEAN := false;
BEGIN
  WHILE NOT done LOOP
    new_id := 'BOT' || LPAD(FLOOR(RANDOM() * 999999999)::TEXT, 9, '0');
    IF NOT EXISTS (SELECT 1 FROM users WHERE robot_user_id = new_id) THEN
      done := true;
    END IF;
  END LOOP;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate unique invite_code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  done BOOLEAN := false;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Excluding similar looking characters
BEGIN
  WHILE NOT done LOOP
    new_code := '';
    FOR i IN 1..8 LOOP
      new_code := new_code || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INT, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM users WHERE invite_code = new_code) THEN
      done := true;
    END IF;
  END LOOP;
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate robot_user_id and invite_code
CREATE OR REPLACE FUNCTION set_user_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.robot_user_id IS NULL THEN
    NEW.robot_user_id := generate_robot_user_id();
  END IF;
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_invite_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_user_ids
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION set_user_ids();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bots_updated_at
BEFORE UPDATE ON bots
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_platform_bindings_updated_at
BEFORE UPDATE ON platform_bindings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_update_bot_settings_updated_at
BEFORE UPDATE ON bot_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Add new fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS unique_id VARCHAR(7) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT false;

-- Add new fields to bots table  
ALTER TABLE bots ADD COLUMN IF NOT EXISTS default_language VARCHAR(5) DEFAULT 'en';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS welcome_message TEXT;

-- Add new fields to red_packets table
ALTER TABLE red_packets ADD COLUMN IF NOT EXISTS is_random BOOLEAN DEFAULT true;
ALTER TABLE red_packets ADD COLUMN IF NOT EXISTS balance_expiry_hours INTEGER;

-- Add balance_expires_at to red_packet_claims
ALTER TABLE red_packet_claims ADD COLUMN IF NOT EXISTS balance_expires_at TIMESTAMPTZ;

-- Create unique_id index
CREATE INDEX IF NOT EXISTS idx_users_unique_id ON users(unique_id);

-- Authorized groups table
CREATE TABLE IF NOT EXISTS authorized_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  group_id BIGINT NOT NULL,
  group_name TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bot_id, group_id)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(11) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('transfer', 'deposit', 'withdrawal', 'red_packet')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- Announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images TEXT[] DEFAULT '{}',
  targets VARCHAR[] DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_pinned BOOLEAN DEFAULT false,
  show_on_app_launch BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Charity activities table
CREATE TABLE IF NOT EXISTS charity_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  target_amount DECIMAL(10, 2) DEFAULT 0,
  current_amount DECIMAL(10, 2) DEFAULT 0,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Charity applications table
CREATE TABLE IF NOT EXISTS charity_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES charity_activities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  amount DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- Balance adjustments log
CREATE TABLE IF NOT EXISTS balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES admin_users(id),
  amount DECIMAL(10, 2) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('add', 'subtract')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generate unique_id for existing users without one
CREATE OR REPLACE FUNCTION generate_unique_id()
RETURNS TEXT AS $$
DECLARE
  new_id TEXT;
  attempts INT := 0;
  letters TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
BEGIN
  WHILE attempts <= 100 LOOP
    new_id := SUBSTR(letters, FLOOR(RANDOM() * LENGTH(letters) + 1)::INT, 1) ||
              LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    IF NOT EXISTS (SELECT 1 FROM users WHERE unique_id = new_id) THEN
      RETURN new_id;
    END IF;
    attempts := attempts + 1;
  END LOOP;
  RAISE EXCEPTION 'Failed to generate unique_id after 100 attempts';
END;
$$ LANGUAGE plpgsql;

-- Update trigger to also set unique_id
CREATE OR REPLACE FUNCTION set_user_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.robot_user_id IS NULL THEN
    NEW.robot_user_id := generate_robot_user_id();
  END IF;
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := generate_invite_code();
  END IF;
  IF NEW.unique_id IS NULL THEN
    NEW.unique_id := generate_unique_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for orders updated_at
CREATE TRIGGER trigger_update_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
