-- Migration: Enhance tutorials and admin management
-- Date: 2026-01-11
-- Prerequisites: This migration requires the base schema to be applied first (schema.sql)
--                which includes the update_updated_at() function

-- ============================================
-- Part 1: Tutorial Categories
-- ============================================

-- Create tutorial categories table
CREATE TABLE IF NOT EXISTS tutorial_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE, -- kyc, 2fa, buy_sell, transfer, receive
  name_en TEXT,
  name_zh TEXT,
  icon TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default tutorial categories
INSERT INTO tutorial_categories (name, name_en, name_zh, icon, order_index) 
VALUES
  ('kyc', 'KYC Verification', '身份认证', '🪪', 1),
  ('2fa', '2FA Setup', '两步验证设置', '🔐', 2),
  ('buy_sell', 'Buy/Sell USDT', '购买/出售USDT', '💱', 3),
  ('transfer', 'Transfer', '转账', '📤', 4),
  ('receive', 'Receive', '收款', '📥', 5)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- Part 2: Enhanced Tutorials Table
-- ============================================

-- Create tutorials table if not exists
CREATE TABLE IF NOT EXISTS tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID REFERENCES exchanges(id) ON DELETE CASCADE,
  category_id UUID REFERENCES tutorial_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  title_zh TEXT,
  description TEXT,
  description_zh TEXT,
  is_active BOOLEAN DEFAULT true,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns to existing tutorials table if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tutorials' AND column_name = 'category_id') THEN
    ALTER TABLE tutorials ADD COLUMN category_id UUID REFERENCES tutorial_categories(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'tutorials' AND column_name = 'exchange_id') THEN
    ALTER TABLE tutorials ADD COLUMN exchange_id UUID REFERENCES exchanges(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================
-- Part 3: Tutorial Steps
-- ============================================

-- Create tutorial steps table if not exists
CREATE TABLE IF NOT EXISTS tutorial_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutorial_id UUID REFERENCES tutorials(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  title TEXT NOT NULL,
  title_zh TEXT,
  description TEXT,
  description_zh TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create tutorial step images table
CREATE TABLE IF NOT EXISTS tutorial_step_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID REFERENCES tutorial_steps(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  caption_zh TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Part 4: Enhanced Admin Users Table
-- ============================================

-- Add new columns to admin_users table if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'admin_users' AND column_name = 'full_name') THEN
    ALTER TABLE admin_users ADD COLUMN full_name TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'admin_users' AND column_name = 'created_by') THEN
    ALTER TABLE admin_users ADD COLUMN created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'admin_users' AND column_name = 'updated_at') THEN
    ALTER TABLE admin_users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  
  -- Update role column to support reviewer role if it exists
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'admin_users' AND column_name = 'role') THEN
    -- No need to change the column type, VARCHAR(20) is sufficient
    EXECUTE 'COMMENT ON COLUMN admin_users.role IS ''super_admin, admin, or reviewer''';
  END IF;
END $$;

-- ============================================
-- Part 5: Indexes for Performance
-- ============================================

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_tutorials_exchange_id ON tutorials(exchange_id);
CREATE INDEX IF NOT EXISTS idx_tutorials_category_id ON tutorials(category_id);
CREATE INDEX IF NOT EXISTS idx_tutorial_steps_tutorial_id ON tutorial_steps(tutorial_id);
CREATE INDEX IF NOT EXISTS idx_tutorial_step_images_step_id ON tutorial_step_images(step_id);

-- ============================================
-- Part 6: Triggers
-- ============================================

-- Update timestamp trigger for tutorials
DROP TRIGGER IF EXISTS trigger_update_tutorials_updated_at ON tutorials;
CREATE TRIGGER trigger_update_tutorials_updated_at
BEFORE UPDATE ON tutorials
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Update timestamp trigger for admin_users
DROP TRIGGER IF EXISTS trigger_update_admin_users_updated_at ON admin_users;
CREATE TRIGGER trigger_update_admin_users_updated_at
BEFORE UPDATE ON admin_users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
