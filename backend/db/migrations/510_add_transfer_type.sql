-- Migration 510: Add transfer_type column to transfer_records
-- Distinguishes between regular transfer ('transfer') and QR scan transfer ('scan_transfer')

ALTER TABLE transfer_records ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(20) DEFAULT 'transfer';
CREATE INDEX IF NOT EXISTS idx_transfer_records_type ON transfer_records(transfer_type);

-- All existing records default to 'transfer' as no prior marker exists to distinguish scan transfers

COMMENT ON COLUMN transfer_records.transfer_type IS 'Type of transfer: transfer (regular) or scan_transfer (QR scan)';
