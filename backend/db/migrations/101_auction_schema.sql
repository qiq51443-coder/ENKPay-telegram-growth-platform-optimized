-- 竞拍（幸运夺宝）功能数据库表

-- 竞拍表
CREATE TABLE IF NOT EXISTS lucky_auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id INT REFERENCES nft_products(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  product_value DECIMAL(10, 2) NOT NULL,
  participant_count INT NOT NULL,
  per_person_cost DECIMAL(10, 2) NOT NULL,
  max_purchases_per_user INT DEFAULT 1,
  platform_fee_percent DECIMAL(5, 2) DEFAULT 30,
  winner_payout DECIMAL(10, 2) NOT NULL,
  current_participants INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  winner_id UUID REFERENCES users(id),
  winner_unique_id VARCHAR(7),
  drawn_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  notify_channels BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lucky_auctions_status ON lucky_auctions(status);
CREATE INDEX IF NOT EXISTS idx_lucky_auctions_expires_at ON lucky_auctions(expires_at);

-- 竞拍参与记录表
CREATE TABLE IF NOT EXISTS lucky_auction_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES lucky_auctions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity INT DEFAULT 1,
  amount DECIMAL(10, 2) NOT NULL,
  is_winner BOOLEAN DEFAULT false,
  refunded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(auction_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lucky_auction_participants_auction_id ON lucky_auction_participants(auction_id);
CREATE INDEX IF NOT EXISTS idx_lucky_auction_participants_user_id ON lucky_auction_participants(user_id);

-- 竞拍结果/中奖记录表
CREATE TABLE IF NOT EXISTS lucky_auction_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES lucky_auctions(id) ON DELETE CASCADE,
  winner_id UUID NOT NULL REFERENCES users(id),
  winner_unique_id VARCHAR(7),
  product_title TEXT,
  product_value DECIMAL(10, 2),
  payout_amount DECIMAL(10, 2),
  charity_amount DECIMAL(10, 2),
  total_participants INT,
  is_redeemed BOOLEAN DEFAULT false,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
