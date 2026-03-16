BEGIN;

-- Add wagering_multiplier to red_packet_claims so each claim records its own unlock requirement
ALTER TABLE red_packet_claims ADD COLUMN IF NOT EXISTS wagering_multiplier NUMERIC(6,2) DEFAULT 2;

COMMIT;
