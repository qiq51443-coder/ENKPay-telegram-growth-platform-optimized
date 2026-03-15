BEGIN;

-- Add wagering tracking column for red_packet_balance
ALTER TABLE users ADD COLUMN IF NOT EXISTS red_packet_wagered NUMERIC(18,8) DEFAULT 0;

-- Add wagering_multiplier to red_packets table
ALTER TABLE red_packets ADD COLUMN IF NOT EXISTS wagering_multiplier INTEGER DEFAULT 2;

-- Add wagering_multiplier to platform_config if not exists
INSERT INTO platform_config (key, value, description)
VALUES ('red_packet_wager_multiplier', '2', 'Red packet wagering multiplier (1x, 2x, 4x)')
ON CONFLICT (key) DO NOTHING;

-- Bot groups tracking (records bots added to Telegram groups/supergroups)
CREATE TABLE IF NOT EXISTS bot_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  chat_title TEXT,
  chat_type TEXT DEFAULT 'group',
  is_active BOOLEAN DEFAULT true,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bot_id, chat_id)
);

COMMIT;
