-- Migration 008: Ensure all required fields exist for withdrawal review, trading orders, and DB integrity
-- Run this script once against your PostgreSQL database.
-- All statements use IF NOT EXISTS / ON CONFLICT to be safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. users: ensure all balance fields exist (idempotent with 007)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reward_balance        NUMERIC(20,8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_unlock_traded  NUMERIC(20,8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_first_trade_done   BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS nft_balance           NUMERIC(20,8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_balance        NUMERIC(20,8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_transferred_out NUMERIC(20,8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_transferred_in  NUMERIC(20,8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_recharged       NUMERIC(20,8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_withdrawn       NUMERIC(20,8) DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. withdrawal_records: add review and audit fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE withdrawal_records
  ADD COLUMN IF NOT EXISTS reviewed_by INTEGER,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_note  TEXT,
  ADD COLUMN IF NOT EXISTS tx_hash     VARCHAR(100);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. trading_orders: ensure table exists for "no duplicate active order" check
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trading_orders (
  id               SERIAL PRIMARY KEY,
  session_id       INTEGER REFERENCES trading_sessions(id),
  user_id          INTEGER REFERENCES users(id),
  pair_id          INTEGER REFERENCES trading_pairs(id),
  direction        VARCHAR(10) NOT NULL CHECK (direction IN ('up', 'down')),
  amount           NUMERIC(20,8) NOT NULL,
  entry_price      NUMERIC(20,8),
  settlement_price NUMERIC(20,8),
  rule_id          INTEGER,
  odds             NUMERIC(10,4) DEFAULT 1.95,
  payout           NUMERIC(20,8) DEFAULT 0,
  status           VARCHAR(20)   DEFAULT 'active',
  created_at       TIMESTAMPTZ   DEFAULT CURRENT_TIMESTAMP,
  settled_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trading_orders_user_pair_status
  ON trading_orders(user_id, pair_id, status);
