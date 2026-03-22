-- Migration 1011: Add composite indexes for price_points queries
-- used by period-snapshot and auto-settle to speed up price lookups

-- Composite index: pair_id + timestamp DESC for range queries in period-snapshot and auto-settle
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_points_pair_timestamp
  ON price_points (pair_id, timestamp DESC);

-- Index for pending sessions (period-snapshot: status='pending', start_time ASC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_sessions_status_start_time
  ON trading_sessions (start_time ASC)
  WHERE status = 'pending';

-- Index for active sessions (auto-settle: status='active', end_time ASC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trading_sessions_status_end_time
  ON trading_sessions (end_time ASC)
  WHERE status = 'active';
