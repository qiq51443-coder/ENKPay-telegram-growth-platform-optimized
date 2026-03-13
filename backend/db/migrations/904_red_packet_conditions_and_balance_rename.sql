-- Migration 904: Red packet claim conditions and balance field rename
-- Ensures claim_condition column exists (may already be added by 980)
-- and documents the semantic change from red_packet_credits → red_packet_balance

-- Add claim_condition to red_packets if not already present
ALTER TABLE red_packets ADD COLUMN IF NOT EXISTS claim_condition VARCHAR(30) DEFAULT 'all_users';

-- Ensure valid constraint for claim_condition values
-- Canonical list of valid values is also maintained in:
--   backend/src/routes/redpackets.ts (claim validation logic)
--   admin-panel/src/pages/RedPackets.tsx (UI dropdown options)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'red_packets_claim_condition_check'
      AND table_name = 'red_packets'
  ) THEN
    ALTER TABLE red_packets
      ADD CONSTRAINT red_packets_claim_condition_check
      CHECK (claim_condition IN ('all_users', 'first_follow', 'has_recharged', 'trade_volume_100', 'trade_volume_200', 'deposited'));
  END IF;
END $$;

-- Index for fast claim condition filtering
CREATE INDEX IF NOT EXISTS idx_red_packets_claim_condition ON red_packets(claim_condition);

-- Note: The red_packet_credits column in users table is the canonical storage.
-- All API responses now expose it as red_packet_balance for frontend consistency.
-- No column rename is needed in the DB; the alias is handled at the API layer.
