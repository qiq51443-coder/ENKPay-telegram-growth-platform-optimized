-- Migration 985: Seed mainstream crypto trading pairs
INSERT INTO trading_pairs (symbol, name, display_name, pair_type, base_currency, quote_currency, binance_symbol, is_active)
VALUES
  ('BTCUSDT',  'Bitcoin',         'BTC/USDT',   'real', 'BTC',   'USDT', 'BTCUSDT',   true),
  ('ETHUSDT',  'Ethereum',        'ETH/USDT',   'real', 'ETH',   'USDT', 'ETHUSDT',   true),
  ('BNBUSDT',  'BNB',             'BNB/USDT',   'real', 'BNB',   'USDT', 'BNBUSDT',   true),
  ('SOLUSDT',  'Solana',          'SOL/USDT',   'real', 'SOL',   'USDT', 'SOLUSDT',   true),
  ('XRPUSDT',  'XRP',             'XRP/USDT',   'real', 'XRP',   'USDT', 'XRPUSDT',   true),
  ('ADAUSDT',  'Cardano',         'ADA/USDT',   'real', 'ADA',   'USDT', 'ADAUSDT',   true),
  ('DOGEUSDT', 'Dogecoin',        'DOGE/USDT',  'real', 'DOGE',  'USDT', 'DOGEUSDT',  true),
  ('TRXUSDT',  'TRON',            'TRX/USDT',   'real', 'TRX',   'USDT', 'TRXUSDT',   true),
  ('ETCUSDT',  'Ethereum Classic','ETC/USDT',   'real', 'ETC',   'USDT', 'ETCUSDT',   true),
  ('LTCUSDT',  'Litecoin',        'LTC/USDT',   'real', 'LTC',   'USDT', 'LTCUSDT',   true),
  ('DOTUSDT',  'Polkadot',        'DOT/USDT',   'real', 'DOT',   'USDT', 'DOTUSDT',   true),
  ('MATICUSDT','Polygon',         'MATIC/USDT', 'real', 'MATIC', 'USDT', 'MATICUSDT', true),
  ('AVAXUSDT', 'Avalanche',       'AVAX/USDT',  'real', 'AVAX',  'USDT', 'AVAXUSDT',  true),
  ('LINKUSDT', 'Chainlink',       'LINK/USDT',  'real', 'LINK',  'USDT', 'LINKUSDT',  true),
  ('UNIUSDT',  'Uniswap',         'UNI/USDT',   'real', 'UNI',   'USDT', 'UNIUSDT',   true)
ON CONFLICT (symbol) DO UPDATE
  SET display_name   = EXCLUDED.display_name,
      binance_symbol = EXCLUDED.binance_symbol,
      is_active      = EXCLUDED.is_active;

-- Add default trading rules for each pair (60 s / 300 s / 600 s, odds 1.95)
INSERT INTO trading_rules (pair_id, duration_seconds, odds, min_bet, max_bet, is_active)
SELECT tp.id, dur.duration_seconds, 1.95, 1, 10000, true
FROM trading_pairs tp
CROSS JOIN (VALUES (60), (300), (600)) AS dur(duration_seconds)
ON CONFLICT DO NOTHING;
