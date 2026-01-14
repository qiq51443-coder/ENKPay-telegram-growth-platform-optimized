-- Migration: Admin Management System
-- Date: 2026-01-14
-- Description: Add audit logs, system settings, and enhance admin management

-- ============================================
-- Part 1: Admin Audit Logs
-- ============================================

-- Create admin audit logs table
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_user ON admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_resource ON admin_audit_logs(resource_type, resource_id);

-- ============================================
-- Part 2: System Settings
-- ============================================

-- Create system settings table
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  category VARCHAR(50),
  is_public BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Create index for system settings
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_is_public ON system_settings(is_public);

-- Insert default system settings
INSERT INTO system_settings (key, value, description, category, is_public) VALUES
  ('new_user_credits', '3', 'Default red packet credits for new users', 'rewards', false),
  ('invite_reward', '1', 'Reward amount for successful invitations', 'rewards', false),
  ('follow_channel_reward', '0.5', 'Reward for following the channel', 'rewards', false),
  ('join_group_reward', '0.5', 'Reward for joining the group', 'rewards', false),
  ('bind_platform_reward', '2', 'Reward for binding platform account', 'rewards', false),
  ('min_withdrawal_amount', '10', 'Minimum withdrawal amount', 'withdrawals', true),
  ('max_withdrawal_amount', '1000', 'Maximum withdrawal amount per transaction', 'withdrawals', true),
  ('withdrawal_fee_percent', '0', 'Withdrawal fee percentage', 'withdrawals', true),
  ('enable_registration', 'true', 'Enable new user registration', 'general', true),
  ('enable_withdrawals', 'true', 'Enable withdrawal functionality', 'general', true),
  ('enable_red_packets', 'true', 'Enable red packet functionality', 'general', true),
  ('enable_invitations', 'true', 'Enable invitation system', 'general', true),
  ('maintenance_mode', 'false', 'Enable maintenance mode', 'general', true),
  ('maintenance_message', '"System is under maintenance. Please try again later."', 'Maintenance mode message', 'general', true),
  ('bot_welcome_message_en', '"Welcome to Telegram Growth Platform! 🚀"', 'Bot welcome message (English)', 'messages', false),
  ('bot_welcome_message_zh', '"欢迎来到 Telegram 增长平台！🚀"', 'Bot welcome message (Chinese)', 'messages', false),
  ('admin_notification_email', '""', 'Email for admin notifications', 'notifications', false),
  ('enable_email_notifications', 'false', 'Enable email notifications', 'notifications', false),
  ('max_daily_withdrawals', '3', 'Maximum withdrawals per user per day', 'withdrawals', false),
  ('security_require_2fa', 'false', 'Require 2FA for admin users', 'security', false)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- Part 3: Bot Settings Enhancement
-- ============================================

-- Add webhook_secret column to bots table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'bots' AND column_name = 'webhook_secret') THEN
    ALTER TABLE bots ADD COLUMN webhook_secret TEXT;
  END IF;
END $$;

-- ============================================
-- Part 4: Ensure Admin Users Table Exists
-- ============================================

-- Create admin_users table if it doesn't exist (should already exist from schema.sql)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  full_name VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for admin_users
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON admin_users(is_active);

-- Insert default admin user if not exists (password: admin123)
INSERT INTO admin_users (username, password_hash, role, full_name, is_active)
VALUES (
  'admin',
  '$2b$10$1F3fL/6uWwrbBOQMnCIPlee0AETt8p36t/z/7b.GRfcinzJh9R29y',
  'super_admin',
  'System Administrator',
  true
) ON CONFLICT (username) DO NOTHING;

-- ============================================
-- Part 5: Update Triggers
-- ============================================

-- Ensure update_updated_at function exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update timestamp trigger for system_settings
DROP TRIGGER IF EXISTS trigger_update_system_settings_updated_at ON system_settings;
CREATE TRIGGER trigger_update_system_settings_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
