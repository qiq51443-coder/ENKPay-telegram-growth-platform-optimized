-- Migration 982: Add red_packet_balance column as alias for red_packet_credits
-- Some legacy code may still reference red_packet_balance; this ensures those queries
-- don't fail with a missing-column error while the code is being updated.
ALTER TABLE users ADD COLUMN IF NOT EXISTS red_packet_balance DECIMAL(18,2) DEFAULT 0;

-- Backfill all rows: red_packet_balance mirrors red_packet_credits for every user
UPDATE users
SET red_packet_balance = COALESCE(red_packet_credits, 0);
