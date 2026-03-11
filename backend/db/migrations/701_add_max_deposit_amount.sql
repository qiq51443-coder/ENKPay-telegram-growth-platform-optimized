-- Migration 701: Add max_deposit_amount column to deposit_networks
-- Date: 2026-03-11
--
-- The admin POST /networks route accepts max_deposit_amount in the request body
-- but previously could not persist it because the column was missing.

ALTER TABLE deposit_networks
  ADD COLUMN IF NOT EXISTS max_deposit_amount NUMERIC(18,8);
