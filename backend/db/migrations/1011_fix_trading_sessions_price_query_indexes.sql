-- PR-03: 优化 price_points 和 trading_sessions 查询索引
-- 确保 period-snapshot 和 auto-settle job 的价格查询不走全表扫描

-- 1. price_points 复合索引（pair_id + timestamp DESC）
CREATE INDEX IF NOT EXISTS idx_price_points_pair_timestamp
  ON price_points (pair_id, timestamp DESC);

-- 2. pending sessions 索引（period-snapshot 查询优化）
CREATE INDEX IF NOT EXISTS idx_trading_sessions_pending_start
  ON trading_sessions (start_time ASC)
  WHERE status = 'pending';

-- 3. active sessions 索引（auto-settle 查询优化）
CREATE INDEX IF NOT EXISTS idx_trading_sessions_active_end
  ON trading_sessions (end_time ASC)
  WHERE status = 'active';
