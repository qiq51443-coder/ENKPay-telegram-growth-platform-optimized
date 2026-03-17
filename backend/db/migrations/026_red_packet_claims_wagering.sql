-- Migration 026: Add wagering_multiplier column to red_packet_claims
-- Records the wagering requirement multiplier at the time of each claim,
-- enabling per-claim wagering tracking for future improvements.
ALTER TABLE red_packet_claims 
ADD COLUMN IF NOT EXISTS wagering_multiplier NUMERIC(10,2);
