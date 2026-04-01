-- Migration 1025: Fix system_settings table schema mismatch
-- Adds missing updated_by column and fixes id/key primary key conflict

-- Step 1: Add updated_by column if missing (this is the column causing the 500 error)
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL;

-- Step 2: Ensure value column is NOT NULL with default (some versions created it as nullable TEXT)
ALTER TABLE system_settings ALTER COLUMN value SET DEFAULT '';
UPDATE system_settings SET value = '' WHERE value IS NULL;
ALTER TABLE system_settings ALTER COLUMN value SET NOT NULL;

-- Step 3: Drop the incorrect id SERIAL PRIMARY KEY if it exists alongside key
-- (When zzz_ created the table with id SERIAL, the key column exists but is NOT the PK)
DO $$
BEGIN
  -- Check if 'id' column exists on system_settings (from incorrect zzz_ schema)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_settings' AND column_name = 'id'
  ) THEN
    -- Drop id column if key already has a unique constraint (safe to remove id)
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.table_name = 'system_settings'
        AND tc.constraint_type = 'UNIQUE'
        AND ccu.column_name = 'key'
    ) THEN
      -- Make key the primary key if it isn't already
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'system_settings'
          AND tc.constraint_type = 'PRIMARY KEY'
          AND ccu.column_name = 'key'
      ) THEN
        ALTER TABLE system_settings DROP CONSTRAINT IF EXISTS system_settings_pkey;
        ALTER TABLE system_settings ADD PRIMARY KEY (key);
      END IF;
      ALTER TABLE system_settings DROP COLUMN IF EXISTS id;
    END IF;
  END IF;
END $$;

-- Step 4: Create indexes if missing
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_is_public ON system_settings(is_public);

-- Step 5: Seed default user_agreement keys if missing (for user agreement feature)
INSERT INTO system_settings (key, value, description, category, is_public) VALUES
  ('user_agreement_zh', '', '用户协议 - 中文', 'general', true),
  ('user_agreement_en', '', 'User Agreement - English', 'general', true),
  ('user_agreement_ru', '', 'User Agreement - Russian', 'general', true),
  ('user_agreement_ar', '', 'User Agreement - Arabic', 'general', true),
  ('user_agreement_es', '', 'User Agreement - Spanish', 'general', true),
  ('user_agreement_fr', '', 'User Agreement - French', 'general', true),
  ('user_agreement_de', '', 'User Agreement - German', 'general', true),
  ('user_agreement_ja', '', 'User Agreement - Japanese', 'general', true)
ON CONFLICT (key) DO NOTHING;
