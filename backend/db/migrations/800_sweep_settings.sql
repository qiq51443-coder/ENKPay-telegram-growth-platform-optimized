-- Migration 800: Add sweep hot wallet settings to system_settings
INSERT INTO system_settings (key, value, description, category, is_public)
VALUES
  ('sweep_hot_wallet_eth', '""', 'ETH/BSC 平台热钱包地址', 'sweep', false),
  ('sweep_hot_wallet_tron', '""', 'TRON 平台热钱包地址', 'sweep', false),
  ('sweep_min_amount', '1', '归集最小金额 (USDT)', 'sweep', false)
ON CONFLICT (key) DO NOTHING;
