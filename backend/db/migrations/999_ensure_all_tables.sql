-- Migration 999: Ensure all platform tables exist (idempotent safety net)

-- Platform config (used by trading, withdrawal validation)
CREATE TABLE IF NOT EXISTS platform_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO platform_config (key, value, description) VALUES
  ('withdraw_min_amount',              '10',    'Minimum withdrawal amount USDT'),
  ('withdraw_fee_rate',                '0.02',  'Withdrawal fee rate (2%)'),
  ('deposit_min_amount',               '1',     'Minimum deposit amount USDT'),
  ('require_deposit_before_withdraw',  'false', 'Require deposit before withdrawal'),
  ('reward_trade_ratio',               '1.0',   'Trade volume required per reward USDT to unlock'),
  ('transfer_min_amount',              '1',     'Minimum transfer amount USDT')
ON CONFLICT (key) DO NOTHING;

-- Transfer records
CREATE TABLE IF NOT EXISTS transfer_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(50),
  from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount DECIMAL(18, 2) NOT NULL,
  fee DECIMAL(18, 2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'completed',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transfer_records_from ON transfer_records(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_to   ON transfer_records(to_user_id);

-- Invitation reward records
CREATE TABLE IF NOT EXISTS invitation_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID REFERENCES users(id) ON DELETE CASCADE,
  invitee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reward_type VARCHAR(50),
  amount DECIMAL(18, 2),
  status VARCHAR(20) DEFAULT 'paid',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions (unified ledger)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  balance_after DECIMAL(18, 2),
  description TEXT,
  reference_id TEXT,
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type    ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

-- Product holdings (for periodic NFT products)
CREATE TABLE IF NOT EXISTS product_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id INT REFERENCES nft_products(id) ON DELETE SET NULL,
  amount DECIMAL(18, 2) NOT NULL,
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'active',
  daily_credited_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_holdings_user   ON product_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_product_holdings_status ON product_holdings(status);

-- Authorized groups (for red packet broadcasts)
CREATE TABLE IF NOT EXISTS authorized_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  group_id BIGINT NOT NULL,
  group_name TEXT,
  country VARCHAR(50),
  language VARCHAR(10),
  member_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bot_id, group_id)
);

-- Orders table (trading orders)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID,
  pair_id UUID REFERENCES trading_pairs(id) ON DELETE SET NULL,
  direction VARCHAR(10) CHECK (direction IN ('up', 'down')),
  amount DECIMAL(18, 2) NOT NULL,
  entry_price DECIMAL(18, 8),
  exit_price DECIMAL(18, 8),
  odds DECIMAL(5, 2) DEFAULT 1.95,
  profit DECIMAL(18, 2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  result VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- Ensure nft_products has the columns used by the periodic products flow
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS name VARCHAR(200);
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS daily_yield_rate DECIMAL(10, 6) DEFAULT 0.005;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS term_days INT DEFAULT 30;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_holders INT;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS current_holders INT DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS is_purchase_limited BOOLEAN DEFAULT false;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_purchases_per_user INT DEFAULT 1;
-- Sync name from title if null
UPDATE nft_products SET name = title WHERE name IS NULL AND title IS NOT NULL;
