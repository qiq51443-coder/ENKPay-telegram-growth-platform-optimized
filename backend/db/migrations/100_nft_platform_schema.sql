-- NFT Platform Schema Migration
-- This migration transforms the platform into an NFT digital collectibles interactive platform

-- ============================================================================
-- 1. Extend Users Table with Wallet Fields
-- ============================================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_balance DECIMAL(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_balance DECIMAL(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_recharged DECIMAL(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_withdrawn DECIMAL(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_traded DECIMAL(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_transferred_out DECIMAL(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_transferred_in DECIMAL(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_unlock_traded DECIMAL(18, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_first_trade_done BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_level1_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invite_level2_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vip_level INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hd_wallet_index INT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ============================================================================
-- 2. Enhance Red Packets Table
-- ============================================================================
ALTER TABLE red_packets
  ADD COLUMN IF NOT EXISTS auto_follow_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_followers_count INT DEFAULT 0;

ALTER TABLE red_packet_claims
  ADD COLUMN IF NOT EXISTS is_new_user BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'group';

-- ============================================================================
-- 3. Enhance Invitations Table (2-level support)
-- ============================================================================
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS level INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS invitee_recharged BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS invitee_first_trade BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_reward_paid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade_reward_paid BOOLEAN DEFAULT false;

-- ============================================================================
-- 4. NFT Categories Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS nft_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  name_zh VARCHAR(100),
  description TEXT,
  icon_url TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 5. NFT Products Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS nft_products (
  id SERIAL PRIMARY KEY,
  category_id INT REFERENCES nft_categories(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  title_zh VARCHAR(200),
  description TEXT,
  description_zh TEXT,
  cover_image_url TEXT,
  pixel_art_url TEXT,
  pixel_art_data JSONB,
  gallery_images JSONB,
  product_type VARCHAR(20) CHECK (product_type IN ('fixed_term', 'instant', 'limited')),
  price DECIMAL(18, 2) NOT NULL,
  original_price DECIMAL(18, 2),
  term_days INT,
  annual_yield_rate DECIMAL(5, 2),
  settlement_type VARCHAR(20),
  total_supply INT,
  remaining_supply INT,
  max_per_user INT,
  attributes JSONB,
  rarity VARCHAR(20),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'on_sale', 'sold_out', 'off_shelf')),
  sale_start_at TIMESTAMP,
  sale_end_at TIMESTAMP,
  creator_name VARCHAR(100),
  collection_name VARCHAR(100),
  sort_order INT DEFAULT 0,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. User NFT Holdings Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_nft_holdings (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES nft_products(id) ON DELETE CASCADE,
  purchase_price DECIMAL(18, 2) NOT NULL,
  purchase_quantity INT DEFAULT 1,
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  term_start_at TIMESTAMP,
  term_end_at TIMESTAMP,
  accumulated_yield DECIMAL(18, 2) DEFAULT 0,
  last_yield_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'holding' CHECK (status IN ('holding', 'matured', 'redeemed')),
  redeemed_at TIMESTAMP,
  redeem_amount DECIMAL(18, 2),
  serial_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_nft_holdings_user_id ON user_nft_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_nft_holdings_product_id ON user_nft_holdings(product_id);
CREATE INDEX IF NOT EXISTS idx_user_nft_holdings_status ON user_nft_holdings(status);

-- ============================================================================
-- 7. NFT Yield Logs Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS nft_yield_logs (
  id SERIAL PRIMARY KEY,
  holding_id INT NOT NULL REFERENCES user_nft_holdings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  yield_date DATE NOT NULL,
  yield_amount DECIMAL(18, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(holding_id, yield_date)
);

CREATE INDEX IF NOT EXISTS idx_nft_yield_logs_holding_id ON nft_yield_logs(holding_id);
CREATE INDEX IF NOT EXISTS idx_nft_yield_logs_user_id ON nft_yield_logs(user_id);

-- ============================================================================
-- 8. Auctions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS auctions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  title_zh VARCHAR(200),
  description TEXT,
  description_zh TEXT,
  image_url TEXT,
  prize_type VARCHAR(20) CHECK (prize_type IN ('nft', 'usdt', 'physical', 'custom')),
  prize_value DECIMAL(18, 2),
  prize_product_id INT REFERENCES nft_products(id) ON DELETE SET NULL,
  prize_description TEXT,
  share_price DECIMAL(18, 2) NOT NULL,
  total_shares INT NOT NULL,
  sold_shares INT DEFAULT 0,
  max_shares_per_user INT,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  draw_at TIMESTAMP,
  winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  winning_share_number INT,
  draw_method VARCHAR(20),
  draw_seed VARCHAR(100),
  status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'drawing', 'finished', 'cancelled')),
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_start_at ON auctions(start_at);

-- ============================================================================
-- 9. Auction Entries Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS auction_entries (
  id SERIAL PRIMARY KEY,
  auction_id INT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shares_count INT NOT NULL,
  share_numbers INT[],
  total_cost DECIMAL(18, 2) NOT NULL,
  is_winner BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auction_entries_auction_id ON auction_entries(auction_id);
CREATE INDEX IF NOT EXISTS idx_auction_entries_user_id ON auction_entries(user_id);

-- ============================================================================
-- 10. Trading Pairs Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS trading_pairs (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  name_zh VARCHAR(100),
  icon_url TEXT,
  pair_type VARCHAR(10) CHECK (pair_type IN ('real', 'custom')),
  external_symbol VARCHAR(20),
  price_source VARCHAR(20) CHECK (price_source IN ('binance', 'coingecko', 'custom')),
  custom_initial_price DECIMAL(18, 8),
  custom_description TEXT,
  min_trade_amount DECIMAL(18, 2) DEFAULT 10,
  max_trade_amount DECIMAL(18, 2),
  payout_ratio DECIMAL(5, 2) DEFAULT 0.95,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  current_price DECIMAL(18, 8),
  price_change_24h DECIMAL(10, 4),
  last_price_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trading_pairs_symbol ON trading_pairs(symbol);
CREATE INDEX IF NOT EXISTS idx_trading_pairs_is_active ON trading_pairs(is_active);

-- ============================================================================
-- 11. Custom Price Points Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS custom_price_points (
  id SERIAL PRIMARY KEY,
  pair_id INT NOT NULL REFERENCES trading_pairs(id) ON DELETE CASCADE,
  price DECIMAL(18, 8) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  open_price DECIMAL(18, 8),
  high_price DECIMAL(18, 8),
  low_price DECIMAL(18, 8),
  close_price DECIMAL(18, 8),
  volume DECIMAL(18, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_price_points_pair_id ON custom_price_points(pair_id);
CREATE INDEX IF NOT EXISTS idx_custom_price_points_timestamp ON custom_price_points(timestamp);

-- ============================================================================
-- 12. Custom Price Presets Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS custom_price_presets (
  id SERIAL PRIMARY KEY,
  pair_id INT NOT NULL REFERENCES trading_pairs(id) ON DELETE CASCADE,
  preset_name VARCHAR(100),
  price_data JSONB NOT NULL,
  duration_seconds INT NOT NULL,
  start_price DECIMAL(18, 8),
  end_price DECIMAL(18, 8),
  is_active BOOLEAN DEFAULT false,
  activated_at TIMESTAMP,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_price_presets_pair_id ON custom_price_presets(pair_id);

-- ============================================================================
-- 13. Trading Sessions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS trading_sessions (
  id SERIAL PRIMARY KEY,
  pair_id INT NOT NULL REFERENCES trading_pairs(id) ON DELETE CASCADE,
  duration_seconds INT NOT NULL,
  open_price DECIMAL(18, 8) NOT NULL,
  close_price DECIMAL(18, 8),
  high_price DECIMAL(18, 8),
  low_price DECIMAL(18, 8),
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  settled_at TIMESTAMP,
  result VARCHAR(10) CHECK (result IN ('up', 'down', 'draw')),
  status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'open', 'closed', 'settled')),
  total_up_amount DECIMAL(18, 2) DEFAULT 0,
  total_down_amount DECIMAL(18, 2) DEFAULT 0,
  total_orders INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trading_sessions_pair_id ON trading_sessions(pair_id);
CREATE INDEX IF NOT EXISTS idx_trading_sessions_status ON trading_sessions(status);
CREATE INDEX IF NOT EXISTS idx_trading_sessions_start_at ON trading_sessions(start_at);

-- ============================================================================
-- 14. Trading Orders Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS trading_orders (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pair_id INT NOT NULL REFERENCES trading_pairs(id) ON DELETE CASCADE,
  direction VARCHAR(10) CHECK (direction IN ('up', 'down')),
  amount DECIMAL(18, 2) NOT NULL,
  is_settled BOOLEAN DEFAULT false,
  is_win BOOLEAN,
  payout DECIMAL(18, 2),
  profit DECIMAL(18, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trading_orders_session_id ON trading_orders(session_id);
CREATE INDEX IF NOT EXISTS idx_trading_orders_user_id ON trading_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_trading_orders_pair_id ON trading_orders(pair_id);

-- ============================================================================
-- 15. Price History Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  pair_id INT NOT NULL REFERENCES trading_pairs(id) ON DELETE CASCADE,
  open_price DECIMAL(18, 8) NOT NULL,
  high_price DECIMAL(18, 8) NOT NULL,
  low_price DECIMAL(18, 8) NOT NULL,
  close_price DECIMAL(18, 8) NOT NULL,
  volume DECIMAL(18, 2),
  interval VARCHAR(10) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  UNIQUE(pair_id, interval, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_price_history_pair_id ON price_history(pair_id);
CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp);

-- ============================================================================
-- 16. Charity Projects Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS charity_projects (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  title_zh VARCHAR(200),
  description TEXT,
  description_zh TEXT,
  image_url TEXT,
  media_urls JSONB,
  target_amount DECIMAL(18, 2) NOT NULL,
  raised_amount DECIMAL(18, 2) DEFAULT 0,
  donor_count INT DEFAULT 0,
  beneficiary_name VARCHAR(100),
  beneficiary_info JSONB,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'closed')),
  start_at TIMESTAMP,
  end_at TIMESTAMP,
  progress_updates JSONB,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_charity_projects_status ON charity_projects(status);

-- ============================================================================
-- 17. Charity Donations Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS charity_donations (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES charity_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL,
  message TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  certificate_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_charity_donations_project_id ON charity_donations(project_id);
CREATE INDEX IF NOT EXISTS idx_charity_donations_user_id ON charity_donations(user_id);

-- ============================================================================
-- 18. Deposit Networks Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS deposit_networks (
  id SERIAL PRIMARY KEY,
  network_name VARCHAR(20) NOT NULL UNIQUE,
  network_display VARCHAR(50) NOT NULL,
  chain_name VARCHAR(20) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USDT',
  master_address TEXT,
  master_private_key_encrypted TEXT,
  hd_derivation_path VARCHAR(50),
  hd_mnemonic_encrypted TEXT,
  min_confirmations INT DEFAULT 1,
  scan_interval_seconds INT DEFAULT 30,
  min_deposit_amount DECIMAL(18, 2) DEFAULT 10,
  deposit_fee DECIMAL(18, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  explorer_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default deposit networks
INSERT INTO deposit_networks (network_name, network_display, chain_name, hd_derivation_path, explorer_url, sort_order)
VALUES 
  ('TRC20', 'Tron (TRC20)', 'TRON', 'm/44''/195''/0''/0/', 'https://tronscan.org/#/transaction/', 1),
  ('ERC20', 'Ethereum (ERC20)', 'ETH', 'm/44''/60''/0''/0/', 'https://etherscan.io/tx/', 2),
  ('BEP20', 'BSC (BEP20)', 'BSC', 'm/44''/60''/0''/0/', 'https://bscscan.com/tx/', 3)
ON CONFLICT (network_name) DO NOTHING;

-- ============================================================================
-- 19. User Deposit Addresses Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_deposit_addresses (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network_id INT NOT NULL REFERENCES deposit_networks(id) ON DELETE CASCADE,
  address VARCHAR(100) NOT NULL,
  hd_index INT,
  source VARCHAR(20) DEFAULT 'hd_derived' CHECK (source IN ('hd_derived', 'manual')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, network_id),
  UNIQUE(address, network_id)
);

CREATE INDEX IF NOT EXISTS idx_user_deposit_addresses_user_id ON user_deposit_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_deposit_addresses_address ON user_deposit_addresses(address);

-- ============================================================================
-- 20. Deposit Records Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS deposit_records (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network_id INT NOT NULL REFERENCES deposit_networks(id) ON DELETE CASCADE,
  tx_hash VARCHAR(100) NOT NULL,
  from_address VARCHAR(100),
  to_address VARCHAR(100) NOT NULL,
  amount DECIMAL(18, 2) NOT NULL,
  actual_amount DECIMAL(18, 2) NOT NULL,
  confirmations INT DEFAULT 0,
  required_confirmations INT DEFAULT 1,
  block_number BIGINT,
  block_timestamp TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirming', 'confirmed', 'credited', 'failed')),
  credited_at TIMESTAMP,
  auto_credited BOOLEAN DEFAULT false,
  admin_note TEXT,
  reviewed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tx_hash, network_id)
);

CREATE INDEX IF NOT EXISTS idx_deposit_records_user_id ON deposit_records(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_records_status ON deposit_records(status);
CREATE INDEX IF NOT EXISTS idx_deposit_records_tx_hash ON deposit_records(tx_hash);

-- ============================================================================
-- 21. Withdrawal Records Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS withdrawal_records (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network_id INT NOT NULL REFERENCES deposit_networks(id) ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL,
  fee DECIMAL(18, 2) NOT NULL,
  actual_amount DECIMAL(18, 2) NOT NULL,
  to_address VARCHAR(100) NOT NULL,
  tx_hash VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'rejected', 'cancelled')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_records_user_id ON withdrawal_records(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_records_status ON withdrawal_records(status);

-- ============================================================================
-- 22. Transfer Records Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS transfer_records (
  id SERIAL PRIMARY KEY,
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(18, 2) NOT NULL,
  fee DECIMAL(18, 2) NOT NULL,
  actual_received DECIMAL(18, 2) NOT NULL,
  to_bot_username VARCHAR(100),
  to_telegram_id BIGINT,
  memo TEXT,
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'reversed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transfer_records_from_user_id ON transfer_records(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_to_user_id ON transfer_records(to_user_id);

-- ============================================================================
-- 23. Platform Config Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_config (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  category VARCHAR(50),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default platform configuration
INSERT INTO platform_config (key, value, description, category) VALUES
  ('follow_reward_usdt', '5', 'Reward for following the bot (USDT)', 'rewards'),
  ('trade_reward_usdt', '5', 'Reward for invitee completing first trade (USDT)', 'rewards'),
  ('invite_max_levels', '2', 'Maximum invitation levels (1 or 2)', 'invitations'),
  ('transfer_fee_rate', '0.02', 'Transfer fee rate (2%)', 'fees'),
  ('transfer_min_amount', '10', 'Minimum transfer amount (USDT)', 'limits'),
  ('withdraw_min_amount', '10', 'Minimum withdrawal amount (USDT)', 'limits'),
  ('deposit_min_amount', '10', 'Minimum deposit amount (USDT)', 'limits'),
  ('reward_trade_ratio', '1.0', 'Trading volume ratio required to unlock rewards (100%)', 'rewards'),
  ('withdraw_fee_rate', '0.02', 'Withdrawal fee rate (2%)', 'fees'),
  ('deposit_auto_confirm_minutes', '3', 'Auto-confirm deposit after N minutes', 'automation'),
  ('auction_platform_fee_rate', '0.05', 'Platform fee rate for auctions (5%)', 'fees'),
  ('trading_enabled', 'true', 'Enable/disable trading feature', 'features')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- Migration Complete
-- ============================================================================
