-- Migration 986: Link deposit networks/addresses to specific bots
-- NULL allowed_bot_ids means available to all bots; non-null array restricts to listed bot IDs
ALTER TABLE deposit_networks ADD COLUMN IF NOT EXISTS allowed_bot_ids UUID[] DEFAULT NULL;

-- Junction table for bot <-> deposit_network assignments
CREATE TABLE IF NOT EXISTS bot_deposit_networks (
  id SERIAL PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  network_id INT NOT NULL REFERENCES deposit_networks(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bot_id, network_id)
);
CREATE INDEX IF NOT EXISTS idx_bot_deposit_networks_bot     ON bot_deposit_networks(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_deposit_networks_network ON bot_deposit_networks(network_id);
