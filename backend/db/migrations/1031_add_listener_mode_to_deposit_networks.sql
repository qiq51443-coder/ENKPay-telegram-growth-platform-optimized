-- 为 deposit_networks 添加监听模式字段（Moralis Streams / TronGrid Webhook 双模式支持）
ALTER TABLE deposit_networks
  ADD COLUMN IF NOT EXISTS listener_mode VARCHAR(20) NOT NULL DEFAULT 'polling',
  ADD COLUMN IF NOT EXISTS moralis_stream_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS webhook_api_key_encrypted TEXT;

-- listener_mode: 'polling' | 'stream'
-- moralis_stream_id: 由 Moralis Streams API 返回，自动填写
-- webhook_api_key_encrypted: 加密存储 Moralis API Key 或 TronGrid Pro Key
