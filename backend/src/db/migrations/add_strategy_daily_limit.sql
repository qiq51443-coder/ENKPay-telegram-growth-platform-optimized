ALTER TABLE strategy_configs ADD COLUMN IF NOT EXISTS daily_send_limit INT DEFAULT 0;
COMMENT ON COLUMN strategy_configs.daily_send_limit IS '每日最大发送期数，0表示不限制';
