-- Migration 970: Add security and sweep tracking fields
--
-- 1. Withdraw password brute-force protection fields on users table
-- 2. Sweep failure tracking on user_deposit_addresses
-- 3. Strengthen withdraw_password minimum length requirement (enforced in application layer)

-- Withdraw password attempt counter and lockout timestamp
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_password_attempts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_password_locked_until TIMESTAMP DEFAULT NULL;

-- Sweep failure counter: used to trigger [ALERT] after repeated failures
ALTER TABLE user_deposit_addresses ADD COLUMN IF NOT EXISTS sweep_failure_count INT DEFAULT 0;
