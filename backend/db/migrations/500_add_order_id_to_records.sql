-- Migration 500: Add order_id to transfer_records, withdrawal_records, deposit_records
-- Date: 2026-03-06

ALTER TABLE transfer_records ADD COLUMN IF NOT EXISTS order_id VARCHAR(11) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_transfer_records_order_id ON transfer_records(order_id);

ALTER TABLE withdrawal_records ADD COLUMN IF NOT EXISTS order_id VARCHAR(11) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_withdrawal_records_order_id ON withdrawal_records(order_id);

ALTER TABLE deposit_records ADD COLUMN IF NOT EXISTS order_id VARCHAR(11) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_deposit_records_order_id ON deposit_records(order_id);
