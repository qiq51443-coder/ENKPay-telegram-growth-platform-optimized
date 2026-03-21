-- Migration 1009: Fix trading_sessions status CHECK constraint
-- The original constraint only allowed ('upcoming', 'open', 'closed', 'settled')
-- but the quick-session route uses 'active' and 'pending' status values.
-- This migration expands the constraint to include all used values.

-- Drop the old constraint and re-add with all needed values
ALTER TABLE trading_sessions DROP CONSTRAINT IF EXISTS trading_sessions_status_check;

ALTER TABLE trading_sessions
  ADD CONSTRAINT trading_sessions_status_check
  CHECK (status IN ('upcoming', 'open', 'closed', 'settled', 'active', 'pending', 'expired'));
