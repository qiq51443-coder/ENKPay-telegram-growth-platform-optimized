-- Migration 960: Add wallet_tip_message to system_settings and balance_adjustments table safeguard

-- Ensure balance_adjustments table exists (used by admin adjust-balance endpoint)
CREATE TABLE IF NOT EXISTS balance_adjustments (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  amount DECIMAL(18, 2) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('add', 'subtract')),
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default wallet_tip_message system setting if not already present
INSERT INTO system_settings (key, value, description, category, is_public)
VALUES (
  'wallet_tip_message',
  '',
  '钱包页提示语 / Wallet page tip message',
  'general',
  false
) ON CONFLICT (key) DO NOTHING;
