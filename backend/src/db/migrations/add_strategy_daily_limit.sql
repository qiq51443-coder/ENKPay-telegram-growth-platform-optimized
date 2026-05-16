-- Add daily send limit to strategy configs
-- 0 = no limit; positive integer = max sends per UTC day
ALTER TABLE strategy_configs ADD COLUMN IF NOT EXISTS daily_send_limit INT DEFAULT 0;
