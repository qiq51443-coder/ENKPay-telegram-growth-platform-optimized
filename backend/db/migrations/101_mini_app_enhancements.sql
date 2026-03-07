-- Mini-App Enhancements Migration
-- Adds support for periodic products, charity banners, and user agreement

-- Periodic products new fields
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS is_purchase_limited BOOLEAN DEFAULT FALSE;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_purchases_per_user INT DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS daily_yield_rate DECIMAL(8,6) DEFAULT 0.005;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS term_days INT DEFAULT 30;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS current_holders INT DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_holders INT DEFAULT 100;

-- Product holdings table
CREATE TABLE IF NOT EXISTS product_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL,
  amount DECIMAL(18,8) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  total_yield DECIMAL(18,8) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_holdings_user_id ON product_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_product_holdings_product_id ON product_holdings(product_id);
CREATE INDEX IF NOT EXISTS idx_product_holdings_status ON product_holdings(status);
CREATE INDEX IF NOT EXISTS idx_product_holdings_end_date ON product_holdings(end_date);

-- Charity ambassador field and active flag
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS ambassador_telegram TEXT;
ALTER TABLE charity_projects ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Charity banners table
CREATE TABLE IF NOT EXISTS charity_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  title TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User agreement setting
INSERT INTO system_settings (key, value, description, category, is_public)
VALUES ('user_agreement', '""', '用户协议内容', 'general', true)
ON CONFLICT (key) DO NOTHING;
