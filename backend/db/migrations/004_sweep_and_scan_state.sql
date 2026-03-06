-- Deposit scan state (track per-address last scanned block/timestamp)
CREATE TABLE IF NOT EXISTS deposit_scan_state (
  network_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  last_scanned_block BIGINT DEFAULT 0,
  last_scanned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (network_id, address)
);

-- Sweep records (history of fund consolidation operations)
CREATE TABLE IF NOT EXISTS sweep_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id INTEGER NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  tx_hash TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'broadcast', 'confirmed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sweep_records_status ON sweep_records(status);
CREATE INDEX IF NOT EXISTS idx_sweep_records_network ON sweep_records(network_id);
CREATE INDEX IF NOT EXISTS idx_sweep_records_created ON sweep_records(created_at DESC);
