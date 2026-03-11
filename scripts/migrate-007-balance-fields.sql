-- Migration 007: Add missing balance fields and ensure table completeness
-- Run this script once against your PostgreSQL database.
-- All statements use IF NOT EXISTS / ON CONFLICT to be safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. trading_pairs: price change and last-update timestamp
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE trading_pairs
  ADD COLUMN IF NOT EXISTS price_change_24h     NUMERIC(10,4)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_price_updated_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. transfer_records: ensure table exists with all required columns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_records (
  id              SERIAL PRIMARY KEY,
  order_id        VARCHAR(50)    UNIQUE NOT NULL,
  from_user_id    INTEGER        REFERENCES users(id),
  to_user_id      INTEGER        REFERENCES users(id),
  amount          NUMERIC(20,8)  NOT NULL,
  fee             NUMERIC(20,8)  DEFAULT 0,
  actual_received NUMERIC(20,8)  NOT NULL,
  memo            TEXT,
  to_bot_username VARCHAR(100),
  to_telegram_id  BIGINT,
  status          VARCHAR(20)    DEFAULT 'completed',
  created_at      TIMESTAMPTZ    DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transfer_records_from_user ON transfer_records(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_to_user   ON transfer_records(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_order_id  ON transfer_records(order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. users: reward / unlock / balance tracking fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reward_balance        NUMERIC(20,8)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_unlock_traded  NUMERIC(20,8)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_first_trade_done   BOOLEAN        DEFAULT false,
  ADD COLUMN IF NOT EXISTS nft_balance           NUMERIC(20,8)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_balance        NUMERIC(20,8)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_transferred_out NUMERIC(20,8)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_transferred_in  NUMERIC(20,8)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_recharged       NUMERIC(20,8)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_withdrawn       NUMERIC(20,8)  DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. platform_config: insert missing default values
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO platform_config (key, value, description) VALUES
  ('reward_trade_ratio',             '1.0',   '红包打码倍率，默认1倍'),
  ('require_trade_before_transfer',  'false',  '转账前是否需要完成交易'),
  ('require_deposit_before_withdraw','false',  '提现前是否需要充值')
ON CONFLICT (key) DO NOTHING;
