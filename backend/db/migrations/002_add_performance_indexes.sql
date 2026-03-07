-- =====================================================
-- Database Performance Indexes Migration
-- =====================================================
-- This migration adds comprehensive indexes to improve query performance
-- All indexes use IF NOT EXISTS to prevent errors on re-run

-- =====================================================
-- 用户表索引 (Users table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
CREATE INDEX IF NOT EXISTS idx_users_robot_user_id ON users(robot_user_id);
CREATE INDEX IF NOT EXISTS idx_users_invited_by ON users(invited_by);
CREATE INDEX IF NOT EXISTS idx_users_registered_at ON users(registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_platform_status ON users(platform_status);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
CREATE INDEX IF NOT EXISTS idx_users_bot_telegram ON users(bot_id, telegram_id);

-- =====================================================
-- 交易表索引 (Transactions table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at DESC);

-- =====================================================
-- 红包表索引 (Red packets table indexes)
-- =====================================================
-- Ensure columns exist before indexing (they may not be present in the base schema)
ALTER TABLE red_packets ADD COLUMN IF NOT EXISTS bot_id UUID REFERENCES bots(id) ON DELETE CASCADE;
ALTER TABLE red_packets ADD COLUMN IF NOT EXISTS group_id BIGINT;
ALTER TABLE red_packets ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_red_packets_bot_id ON red_packets(bot_id);
CREATE INDEX IF NOT EXISTS idx_red_packets_group_id ON red_packets(group_id);
CREATE INDEX IF NOT EXISTS idx_red_packets_status ON red_packets(status);
CREATE INDEX IF NOT EXISTS idx_red_packets_expires_at ON red_packets(expires_at);
CREATE INDEX IF NOT EXISTS idx_red_packets_created_at ON red_packets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_red_packets_creator_id ON red_packets(creator_id);

-- =====================================================
-- 红包领取记录索引 (Red packet claims table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_red_packet_claims_user_id ON red_packet_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_red_packet_claims_packet_id ON red_packet_claims(red_packet_id);
CREATE INDEX IF NOT EXISTS idx_red_packet_claims_user_packet ON red_packet_claims(user_id, red_packet_id);
CREATE INDEX IF NOT EXISTS idx_red_packet_claims_claimed_at ON red_packet_claims(claimed_at DESC);

-- =====================================================
-- 绑定请求索引 (Platform bindings table indexes)
-- =====================================================
-- Minimal table definition to ensure indexes can be created even if the full
-- table definition lives in a later migration. Columns will be extended later.
CREATE TABLE IF NOT EXISTS platform_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_bindings_user_id ON platform_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_bindings_status ON platform_bindings(status);
CREATE INDEX IF NOT EXISTS idx_platform_bindings_created_at ON platform_bindings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_bindings_status_created ON platform_bindings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_bindings_bot_id ON platform_bindings(bot_id);

-- =====================================================
-- 截图表索引 (Earnings screenshots table indexes)
-- =====================================================
-- Ensure status column exists
ALTER TABLE earnings_screenshots ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_earnings_screenshots_user_id ON earnings_screenshots(user_id);
CREATE INDEX IF NOT EXISTS idx_earnings_screenshots_status ON earnings_screenshots(status);
CREATE INDEX IF NOT EXISTS idx_earnings_screenshots_created_at ON earnings_screenshots(created_at DESC);

-- =====================================================
-- Bot 表索引 (Bots table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_bots_is_active ON bots(is_active);
CREATE INDEX IF NOT EXISTS idx_bots_username ON bots(username);
CREATE INDEX IF NOT EXISTS idx_bots_created_at ON bots(created_at DESC);

-- =====================================================
-- 广播表索引 (Broadcasts table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_broadcasts_bot_id ON broadcasts(bot_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at ON broadcasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled_at ON broadcasts(scheduled_at);

-- =====================================================
-- 教程表索引 (Tutorials table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_tutorials_exchange_id ON tutorials(exchange_id);
CREATE INDEX IF NOT EXISTS idx_tutorials_category_id ON tutorials(category_id);
CREATE INDEX IF NOT EXISTS idx_tutorials_is_active ON tutorials(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tutorials_order_index ON tutorials(order_index);
CREATE INDEX IF NOT EXISTS idx_tutorials_created_at ON tutorials(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tutorial_steps_tutorial_id ON tutorial_steps(tutorial_id);
CREATE INDEX IF NOT EXISTS idx_tutorial_steps_order ON tutorial_steps(tutorial_id, step_number);

CREATE INDEX IF NOT EXISTS idx_tutorial_categories_order_index ON tutorial_categories(order_index);

-- =====================================================
-- 管理员表索引 (Admin users table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON admin_users(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_users_created_at ON admin_users(created_at DESC);

-- =====================================================
-- 审计日志索引 (Audit logs table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON admin_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_action ON admin_audit_logs(admin_user_id, action);

-- =====================================================
-- 系统设置索引 (System settings table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_is_public ON system_settings(is_public);
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON system_settings(updated_at DESC);

-- =====================================================
-- 任务表索引 (Tasks table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_tasks_bot_id ON tasks(bot_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_is_active ON tasks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tasks_order_index ON tasks(order_index);

CREATE INDEX IF NOT EXISTS idx_user_tasks_user_id ON user_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_task_id ON user_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_completed ON user_tasks(completed);
CREATE INDEX IF NOT EXISTS idx_user_tasks_user_completed ON user_tasks(user_id, completed);

-- =====================================================
-- 邀请表索引 (Invitations table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_invitations_inviter_id ON invitations(inviter_id);
CREATE INDEX IF NOT EXISTS idx_invitations_invitee_id ON invitations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON invitations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_reward_paid ON invitations(reward_paid);

-- =====================================================
-- 交易所表索引 (Exchanges table indexes)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_exchanges_is_active ON exchanges(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_exchanges_order_index ON exchanges(order_index);

-- =====================================================
-- Performance optimization comments
-- =====================================================
-- These indexes are designed to optimize the following common queries:
-- 1. User lookups by telegram_id, invite_code, robot_user_id
-- 2. Transaction history and filtering by user/type/status
-- 3. Red packet claims and status tracking
-- 4. Pending bindings and withdrawals review (status + created_at)
-- 5. Screenshot review queue
-- 6. Tutorial and content management
-- 7. Admin user authentication and audit log queries
-- 8. Task completion tracking
-- 9. Invitation tree traversal

-- Note: Indexes on foreign keys improve JOIN performance
-- Note: Composite indexes (status, created_at) optimize admin dashboards
-- Note: Partial indexes (WHERE is_active = true) reduce index size
