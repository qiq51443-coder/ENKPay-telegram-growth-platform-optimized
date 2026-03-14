-- Migration 987: Fix price_points and price_presets tables with correct pair_id type
-- price_points.pair_id must be INTEGER to match trading_pairs.id (SERIAL)

-- Drop the incorrectly typed price_points table if it exists (from failed migration 983)
DROP TABLE IF EXISTS price_points;

CREATE TABLE IF NOT EXISTS price_points (
  id BIGSERIAL PRIMARY KEY,
  pair_id INTEGER REFERENCES trading_pairs(id) ON DELETE CASCADE,
  price DECIMAL(18, 8) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_points_pair_timestamp ON price_points(pair_id, timestamp DESC);

-- Create price_presets table used by trading-admin.ts preset endpoints
CREATE TABLE IF NOT EXISTS price_presets (
  id BIGSERIAL PRIMARY KEY,
  pair_id INTEGER REFERENCES trading_pairs(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price_sequence JSONB NOT NULL,
  interval_seconds INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT false,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_presets_pair_id ON price_presets(pair_id);
