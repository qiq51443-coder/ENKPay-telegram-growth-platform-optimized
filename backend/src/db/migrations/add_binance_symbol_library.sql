-- 币安交易对库缓存表
CREATE TABLE IF NOT EXISTS binance_symbol_library (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(30) NOT NULL UNIQUE,       -- 如 BTCUSDT
  base_asset VARCHAR(20) NOT NULL,           -- 如 BTC
  quote_asset VARCHAR(20) NOT NULL,          -- 如 USDT
  status VARCHAR(20) NOT NULL DEFAULT 'TRADING',  -- TRADING / BREAK / HALT
  display_name VARCHAR(50),                  -- 如 BTC/USDT
  last_price DECIMAL(20, 8),                 -- 最新价格（可选）
  price_change_24h DECIMAL(10, 4),           -- 24h涨幅百分比（可选）
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_binance_symbol_library_symbol ON binance_symbol_library(symbol);
CREATE INDEX IF NOT EXISTS idx_binance_symbol_library_base_asset ON binance_symbol_library(base_asset);
CREATE INDEX IF NOT EXISTS idx_binance_symbol_library_status ON binance_symbol_library(status);
