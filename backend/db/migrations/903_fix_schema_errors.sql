-- Migration 903: Fix production schema errors found in Render logs
-- Date: 2026-03-11
-- This migration is fully idempotent.

-- ─── Fix 1: trading_pairs.name NOT NULL causes INSERT failure ─────────────────
-- The trading-admin API inserts pairs without providing 'name', but the column
-- was defined as NOT NULL in the original schema. Make it nullable and backfill.
ALTER TABLE trading_pairs ALTER COLUMN name DROP NOT NULL;
UPDATE trading_pairs SET name = COALESCE(display_name, symbol) WHERE name IS NULL;

-- ─── Fix 2: users.nft_balance column does not exist ──────────────────────────
-- miniapp.ts and bot-manager.service.ts both SELECT nft_balance from users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS nft_balance DECIMAL(18,2) DEFAULT 0;

-- ─── Fix 3: charity_projects missing columns ──────────────────────────────────
-- CREATE TABLE IF NOT EXISTS skips if the table exists, leaving old columns absent.
CREATE TABLE IF NOT EXISTS charity_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  goal_amount DECIMAL(10,2) DEFAULT 0,
  raised_amount DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  organization TEXT,
  website_url TEXT,
  ambassador_telegram TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Then add columns that might be missing if table already existed before
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS goal_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS raised_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS ambassador_telegram TEXT;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Also ensure charity_donations and charity_banners exist
CREATE TABLE IF NOT EXISTS charity_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES charity_projects(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  message TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS charity_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  title TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
