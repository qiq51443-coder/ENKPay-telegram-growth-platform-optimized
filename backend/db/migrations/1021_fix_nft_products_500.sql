-- Migration 1021: 综合修复 GET /api/nft/products 500 错误
-- 修复内容：
--   1. product_holdings.product_id 类型由 UUID → INT（若尚未修复）
--   2. 确保 nft_holdings 和 product_holdings 表存在且结构正确
--   3. 清理并重建 nft_products status CHECK 约束（包含所有合法值）
--   4. 确保 display_holders_count 列存在（fallback query 依赖此列）
--   5. 补全 nft_products 所有必需列
-- 幂等 – 可安全重复执行

-- ─── 1. 修复 product_holdings.product_id (UUID → INT) ─────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name  = 'product_holdings'
      AND column_name = 'product_id'
      AND udt_name    IN ('uuid', 'text')
  ) THEN
    ALTER TABLE product_holdings
      DROP CONSTRAINT IF EXISTS product_holdings_product_id_fkey;
    -- NOTE: UUID values cannot be automatically mapped to INT IDs.
    -- Existing product_id references are cleared intentionally to avoid type
    -- cast errors. Holdings that had invalid UUID product_id values are
    -- already non-functional due to the type mismatch.
    UPDATE product_holdings SET product_id = NULL;
    ALTER TABLE product_holdings
      ALTER COLUMN product_id TYPE INT USING NULL;
    BEGIN
      ALTER TABLE product_holdings
        ADD CONSTRAINT product_holdings_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES nft_products(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- ─── 2. 确保 product_holdings 有 total_income 列（nft-daily-settle.ts 用到） ──
ALTER TABLE product_holdings ADD COLUMN IF NOT EXISTS total_income DECIMAL(20, 8) DEFAULT 0;

-- ─── 3. 确保 nft_holdings 表存在且包含 total_income 列 ─────────────────────────
CREATE TABLE IF NOT EXISTS nft_holdings (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id     INT           NOT NULL REFERENCES nft_products(id) ON DELETE CASCADE,
  purchase_price DECIMAL(18,2) NOT NULL,
  status         VARCHAR(20)   DEFAULT 'active',
  expires_at     TIMESTAMPTZ,
  total_income   DECIMAL(20,8) DEFAULT 0,
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nft_holdings_user_id    ON nft_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_nft_holdings_product_id ON nft_holdings(product_id);
CREATE INDEX IF NOT EXISTS idx_nft_holdings_status     ON nft_holdings(status);

-- 修复 nft_holdings status CHECK 约束（若已有约束可能不含所有值）
ALTER TABLE nft_holdings DROP CONSTRAINT IF EXISTS nft_holdings_status_check;
ALTER TABLE nft_holdings
  ADD CONSTRAINT nft_holdings_status_check
  CHECK (status IN ('active', 'expired', 'cancelled'));

-- ─── 4. 补全 nft_products 所有必需列 ──────────────────────────────────────────
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS name VARCHAR(200);
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS stock INT DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS sold_count INT DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS total_supply INT DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) DEFAULT 'instant';
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS original_price DECIMAL(18,2) DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS duration_days INT DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS term_days INT DEFAULT 30;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS daily_yield_rate DECIMAL(10,6) DEFAULT 0.005;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS daily_trade_reward_rate DECIMAL(10,6) DEFAULT 0.01;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_trade_reward_days INT DEFAULT 30;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_holders INT DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS current_holders INT DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS is_purchase_limited BOOLEAN DEFAULT false;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS max_purchases_per_user INT DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS rarity VARCHAR(20) DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS listing_time TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS settlement_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS settlement_description TEXT DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS description_i18n JSONB DEFAULT '{}';
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS display_holders_count INTEGER DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS nft_balance DECIMAL(18,2) DEFAULT 0;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE nft_products ADD COLUMN IF NOT EXISTS category_id INT;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nft_categories') THEN
    BEGIN
      ALTER TABLE nft_products
        ADD CONSTRAINT nft_products_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES nft_categories(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 数据回填
UPDATE nft_products SET name = title WHERE name IS NULL AND title IS NOT NULL;
UPDATE nft_products SET image_url = cover_image_url WHERE image_url IS NULL AND cover_image_url IS NOT NULL;
UPDATE nft_products SET status = 'active' WHERE status IS NULL;

-- ─── 5. 彻底重建 nft_products status CHECK 约束 ────────────────────────────────
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  FOR v_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cls ON con.conrelid = cls.oid
    WHERE cls.relname = 'nft_products'
      AND con.contype = 'c'
      AND con.conname LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE nft_products DROP CONSTRAINT ' || quote_ident(v_constraint);
  END LOOP;
END $$;

ALTER TABLE nft_products
  ADD CONSTRAINT nft_products_status_check
  CHECK (status IN ('draft', 'on_sale', 'sold_out', 'off_shelf', 'active', 'inactive'));

-- ─── 6. 确保 users 有 nft_balance 列 ──────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS nft_balance DECIMAL(18, 2) DEFAULT 0;
