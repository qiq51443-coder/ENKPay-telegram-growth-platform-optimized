-- Add period_label column to trading_sessions for fixed time-boundary period identification
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS period_label VARCHAR(32);
CREATE INDEX IF NOT EXISTS idx_trading_sessions_period_label ON trading_sessions(pair_id, duration_seconds, period_label);
