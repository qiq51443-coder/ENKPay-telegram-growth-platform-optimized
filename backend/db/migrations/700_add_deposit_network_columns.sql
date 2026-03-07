-- Migration 700: Add contract_address and decimals columns to deposit_networks
-- Date: 2026-03-07

ALTER TABLE deposit_networks 
  ADD COLUMN IF NOT EXISTS contract_address TEXT,
  ADD COLUMN IF NOT EXISTS decimals INT DEFAULT 18;

-- Update token decimals for known networks.
-- These refer to the ERC-20/TRC-20/BEP-20 token (e.g. USDT) decimals, not native chain decimals.
-- USDT on TRON (TRC-20): 6 decimals
UPDATE deposit_networks SET decimals = 6 WHERE chain_name = 'TRON';
-- USDT on Ethereum (ERC-20): 6 decimals
UPDATE deposit_networks SET decimals = 6 WHERE chain_name = 'ETH';
-- USDT on BSC (BEP-20): 18 decimals
UPDATE deposit_networks SET decimals = 18 WHERE chain_name = 'BSC';
