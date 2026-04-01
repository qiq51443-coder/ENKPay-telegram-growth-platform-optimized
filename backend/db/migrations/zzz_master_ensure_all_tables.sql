-- Migration zzz_master_ensure_all_tables: Idempotent safety net
-- Runs LAST (zzz_ prefix) to ensure all critical tables exist regardless of migration order.
-- All statements use IF NOT EXISTS / ON CONFLICT DO NOTHING for full idempotency.

-- trading_pairs (required by price-generator, real-price-snapshot, trading services)
CREATE TABLE IF NOT EXISTS trading_pairs (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  display_name VARCHAR(50),
  base_currency VARCHAR(10),
  quote_currency VARCHAR(10),
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  price_source VARCHAR(20) DEFAULT 'binance',
  pair_type VARCHAR(10) DEFAULT 'real' CHECK (pair_type IN ('real', 'custom')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- trading_sessions (required by auto-settle, period-snapshot jobs)
CREATE TABLE IF NOT EXISTS trading_sessions (
  id SERIAL PRIMARY KEY,
  pair_id INT REFERENCES trading_pairs(id) ON DELETE CASCADE,
  duration_seconds INT NOT NULL DEFAULT 60,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'settled')),
  open_price DECIMAL(18,8),
  close_price DECIMAL(18,8),
  period_label VARCHAR(50),
  start_at TIMESTAMPTZ DEFAULT NOW(),
  end_at TIMESTAMPTZ,
  rule_id INT,
  result_direction VARCHAR(10),
  settlement_price DECIMAL(20,8),
  settlement_price_source VARCHAR(20),  -- 'binance_mark' | 'internal'
  total_bet_amount DECIMAL(18,2) DEFAULT 0,
  total_payout DECIMAL(18,2) DEFAULT 0,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- trading_rules (required by trading settlement logic)
CREATE TABLE IF NOT EXISTS trading_rules (
  id SERIAL PRIMARY KEY,
  pair_id INT REFERENCES trading_pairs(id) ON DELETE CASCADE,
  name VARCHAR(100),
  duration_seconds INT NOT NULL DEFAULT 60,
  min_bet DECIMAL(18,2) DEFAULT 1,
  max_bet DECIMAL(18,2) DEFAULT 10000,
  odds DECIMAL(5,2) DEFAULT 1.95,
  force_result VARCHAR(10) CHECK (force_result IN ('up', 'down', NULL)),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- trading_orders (required by trading order placement and settlement)
CREATE TABLE IF NOT EXISTS trading_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id INT REFERENCES trading_sessions(id) ON DELETE SET NULL,
  pair_id INT REFERENCES trading_pairs(id) ON DELETE SET NULL,
  direction VARCHAR(10) CHECK (direction IN ('up', 'down')),
  amount DECIMAL(18,2) NOT NULL,
  entry_price DECIMAL(18,8),
  entry_price_source VARCHAR(20),  -- 'binance_mark' | 'internal'
  leverage DECIMAL(5,2) DEFAULT 1.0,
  exit_price DECIMAL(18,8),
  odds DECIMAL(5,2) DEFAULT 1.95,
  profit DECIMAL(18,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  result VARCHAR(10) CHECK (result IN ('win', 'lose', 'pending')),
  rule_id INT,
  settlement_price DECIMAL(18,8),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- price_points (required by price-generator and real-price-snapshot)
CREATE TABLE IF NOT EXISTS price_points (
  id BIGSERIAL PRIMARY KEY,
  pair_id INT REFERENCES trading_pairs(id) ON DELETE CASCADE,
  price DECIMAL(18,8) NOT NULL,
  source VARCHAR(20) DEFAULT 'generated',  -- 'binance_mark', 'internal', 'generated'
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- deposit_networks (required by deposit-checker job and withdrawal flow)
CREATE TABLE IF NOT EXISTS deposit_networks (
  id SERIAL PRIMARY KEY,
  network_name VARCHAR(20) NOT NULL UNIQUE,
  network_display VARCHAR(50),
  chain_name VARCHAR(30),
  min_deposit_amount DECIMAL(18,2) DEFAULT 1.0,
  max_deposit_amount DECIMAL(18,2),
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- withdrawal_records (referenced by schema indexes and withdrawal API)
CREATE TABLE IF NOT EXISTS withdrawal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  network_id INT REFERENCES deposit_networks(id) ON DELETE SET NULL,
  amount DECIMAL(18,2) NOT NULL,
  fee DECIMAL(18,2) DEFAULT 0,
  address VARCHAR(200),
  tx_hash VARCHAR(200),
  status VARCHAR(20) DEFAULT 'pending',
  order_id VARCHAR(11) UNIQUE,
  admin_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- deposit_records (referenced by schema indexes and deposit-checker job)
CREATE TABLE IF NOT EXISTS deposit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  network_id INT REFERENCES deposit_networks(id) ON DELETE SET NULL,
  address VARCHAR(200),
  amount DECIMAL(18,2) NOT NULL,
  tx_hash VARCHAR(200) UNIQUE,
  status VARCHAR(20) DEFAULT 'pending',
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- system_settings (required by admin login and platform configuration)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  is_public BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- admin_users (required by admin panel login)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email TEXT,
  role VARCHAR(20) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- lucky_auctions (required by lucky auction feature)
CREATE TABLE IF NOT EXISTS lucky_auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  image_url TEXT,
  ticket_price DECIMAL(18,2) NOT NULL DEFAULT 1,
  max_tickets INT,
  sold_tickets INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
  winner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  preset_winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  draw_at TIMESTAMPTZ,
  drawn_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  show_in_mini_app BOOLEAN NOT NULL DEFAULT false
);
-- Ensure show_in_mini_app column exists on lucky_auctions
ALTER TABLE lucky_auctions ADD COLUMN IF NOT EXISTS show_in_mini_app BOOLEAN NOT NULL DEFAULT false;

-- lucky_auction_entries (required by lucky auction participation)
CREATE TABLE IF NOT EXISTS lucky_auction_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID REFERENCES lucky_auctions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tickets INT DEFAULT 1,
  amount_paid DECIMAL(18,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- nft_products (required by NFT purchase and yield flows)
CREATE TABLE IF NOT EXISTS nft_products (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200),
  name VARCHAR(200),
  description TEXT,
  image_url TEXT,
  price DECIMAL(18,2) NOT NULL DEFAULT 0,
  daily_yield_rate DECIMAL(10,6) DEFAULT 0.005,
  term_days INT DEFAULT 30,
  max_holders INT,
  current_holders INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_purchase_limited BOOLEAN DEFAULT false,
  max_purchases_per_user INT DEFAULT 1,
  description_i18n JSONB DEFAULT '{}',
  display_holders_count INTEGER DEFAULT 0,
  cover_image_url TEXT,
  listing_time TIMESTAMP,
  settlement_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- nft_purchases (required by NFT purchase flow)
CREATE TABLE IF NOT EXISTS nft_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  product_id INT REFERENCES nft_products(id) ON DELETE SET NULL,
  amount DECIMAL(18,2) NOT NULL,
  purchase_price DECIMAL(18,2),
  status VARCHAR(20) DEFAULT 'active',
  reference_id UUID,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default trading pairs seed data (idempotent)
INSERT INTO trading_pairs (symbol, display_name, base_currency, quote_currency, is_active, sort_order, price_source)
VALUES
  ('BTCUSDT', 'BTC/USDT', 'BTC', 'USDT', true, 1, 'binance'),
  ('ETHUSDT', 'ETH/USDT', 'ETH', 'USDT', true, 2, 'binance'),
  ('BNBUSDT', 'BNB/USDT', 'BNB', 'USDT', true, 3, 'binance')
ON CONFLICT (symbol) DO NOTHING;
