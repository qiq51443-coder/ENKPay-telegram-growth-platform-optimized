-- Migration 983: Ensure symbol_library table exists for trading admin
CREATE TABLE IF NOT EXISTS symbol_library (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(30) NOT NULL UNIQUE,
  display_name VARCHAR(100),
  binance_symbol VARCHAR(30),
  base_currency VARCHAR(20),
  quote_currency VARCHAR(20),
  last_price DECIMAL(18, 8),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_symbol_library_symbol ON symbol_library(symbol);

CREATE TABLE IF NOT EXISTS price_points (
  id BIGSERIAL PRIMARY KEY,
  pair_id UUID REFERENCES trading_pairs(id) ON DELETE CASCADE,
  price DECIMAL(18, 8) NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_points_pair_timestamp ON price_points(pair_id, timestamp DESC);
