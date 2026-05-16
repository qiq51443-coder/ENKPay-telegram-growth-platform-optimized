-- Strategy bot tables (zzz_ prefix = runs on every startup, fully idempotent)
-- This ensures the tables exist even on databases where the original
-- add_strategy_bot.sql migration failed silently (migrate.ts does not retry
-- failed migrations, so tables may be missing on production deployments).

CREATE TABLE IF NOT EXISTS strategy_bots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_token   TEXT NOT NULL UNIQUE,
  bot_name    TEXT,
  username    TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_bot_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_bot_id UUID REFERENCES strategy_bots(id) ON DELETE CASCADE,
  chat_id         TEXT NOT NULL,
  chat_title      TEXT,
  language        TEXT,
  is_active       BOOLEAN DEFAULT true,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(strategy_bot_id, chat_id)
);

CREATE TABLE IF NOT EXISTS strategy_configs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_bot_id             UUID REFERENCES strategy_bots(id) ON DELETE CASCADE,
  name                        TEXT NOT NULL,
  is_active                   BOOLEAN DEFAULT true,
  auto_send_daily             BOOLEAN DEFAULT false,
  coin_rotation               JSONB NOT NULL DEFAULT '[]',
  send_times                  JSONB NOT NULL DEFAULT '[]',
  custom_text                 TEXT,
  custom_text_translations    JSONB,
  media_url                   TEXT,
  media_telegram_file_id      TEXT,
  target_group_ids            JSONB NOT NULL DEFAULT '[]',
  current_coin_index          INT DEFAULT 0,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_configs_bot_id ON strategy_configs(strategy_bot_id);
CREATE INDEX IF NOT EXISTS idx_strategy_configs_active_auto ON strategy_configs(is_active, auto_send_daily);
CREATE INDEX IF NOT EXISTS idx_strategy_bot_groups_bot_id ON strategy_bot_groups(strategy_bot_id);
