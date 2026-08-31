-- Add generic webhook/provider fields to deposit_networks so we can support multiple providers (Moralis, QuickNode, etc.)
ALTER TABLE deposit_networks
  ADD COLUMN IF NOT EXISTS webhook_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS webhook_id VARCHAR(200);

-- Keep webhook_api_key_encrypted column (already exists in earlier migration)
