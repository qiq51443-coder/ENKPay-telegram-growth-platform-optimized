-- Migration 031: Add language column to users table
-- Safe to run multiple times (IF NOT EXISTS)
-- The auction service uses COALESCE(u.language, u.language_code, 'zh') to resolve
-- notification language. Without this column the query throws PostgreSQL error 42703.

ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_users_bot_id ON users(bot_id);
