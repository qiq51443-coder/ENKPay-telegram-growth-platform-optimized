-- Migration 999: Restore performance indexes that were removed from schema.sql
-- These indexes reference tables created in migration 100+ and cannot live in
-- schema.sql (which runs in a single transaction before those tables exist).
-- All statements use IF NOT EXISTS for full idempotency.

-- user_deposit_addresses: used to look up a user's address for a given network
CREATE INDEX IF NOT EXISTS idx_user_deposit_addresses_user_network ON user_deposit_addresses(user_id, network_id);

-- deposit_records: admin and job queries filter by status; tx_hash for dedup
CREATE INDEX IF NOT EXISTS idx_deposit_records_status ON deposit_records(status);
CREATE INDEX IF NOT EXISTS idx_deposit_records_tx_hash ON deposit_records(tx_hash);

-- transfer_records: both directions are queried (wallet history, balance rollup)
CREATE INDEX IF NOT EXISTS idx_transfer_records_from_user ON transfer_records(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_to_user ON transfer_records(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_records_from_user_created ON transfer_records(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_records_to_user_created ON transfer_records(to_user_id, created_at DESC);

-- withdrawal_records: status-based admin queries and per-user history
CREATE INDEX IF NOT EXISTS idx_withdrawal_records_user_id ON withdrawal_records(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_records_status ON withdrawal_records(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_records_user_created ON withdrawal_records(user_id, created_at DESC);

-- deposit_records: per-user history with time ordering
CREATE INDEX IF NOT EXISTS idx_deposit_records_user_created ON deposit_records(user_id, created_at DESC);
