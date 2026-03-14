-- Migration 984: Ensure withdrawal_records table has all required columns
CREATE TABLE IF NOT EXISTS withdrawal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(50),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  network_id INT REFERENCES deposit_networks(id) ON DELETE SET NULL,
  amount DECIMAL(18, 2) NOT NULL,
  fee DECIMAL(18, 2) DEFAULT 0,
  actual_amount DECIMAL(18, 2),
  to_address VARCHAR(255) NOT NULL,
  tx_hash VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE withdrawal_records ADD COLUMN IF NOT EXISTS order_id VARCHAR(50);
ALTER TABLE withdrawal_records ADD COLUMN IF NOT EXISTS fee DECIMAL(18, 2) DEFAULT 0;
ALTER TABLE withdrawal_records ADD COLUMN IF NOT EXISTS actual_amount DECIMAL(18, 2);
ALTER TABLE withdrawal_records ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255);
ALTER TABLE withdrawal_records ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE withdrawal_records ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE withdrawal_records ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE withdrawal_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_withdrawal_records_user_id ON withdrawal_records(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_records_status ON withdrawal_records(status);
