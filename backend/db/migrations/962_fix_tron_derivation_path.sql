-- Migration 962: Fix TRON HD derivation path and clear stale derived addresses
-- Date: 2026-03-16
--
-- Root cause: TRON network was configured with coin_type=60 (ETH) derivation path
-- instead of coin_type=195 (TRON), causing derived addresses to differ from
-- TronLink and other standard TRON wallets using BIP44.
--
-- Fix:
--   1. Update hd_derivation_path to m/44'/195'/0'/0 for all TRON networks
--   2. Delete stale hd_derived addresses so they are regenerated correctly on next request
--   3. Ensure chain_name is uppercase TRON for consistent resolveChainType() matching

-- Step 1: Fix derivation path for TRON networks (coin_type 195, not 60)
UPDATE deposit_networks
SET
  hd_derivation_path = 'm/44''/195''/0''/0',
  updated_at = NOW()
WHERE
  (chain_name ILIKE 'tron' OR network_name ILIKE '%trc%' OR network_name ILIKE '%tron%')
  AND (hd_derivation_path IS DISTINCT FROM 'm/44''/195''/0''/0');

-- Step 2: Ensure chain_name is stored as uppercase 'TRON' for consistent matching
-- (resolveChainType() does toUpperCase() so this is not strictly required, but keeps data clean)
UPDATE deposit_networks
SET chain_name = 'TRON'
WHERE chain_name ILIKE 'tron' AND chain_name != 'TRON';

-- Step 3: Remove all hd_derived addresses for TRON networks
-- They will be re-derived correctly on the next user request using the fixed derivation path
DELETE FROM user_deposit_addresses
WHERE
  source = 'hd_derived'
  AND network_id IN (
    SELECT id FROM deposit_networks
    WHERE chain_name = 'TRON'
       OR network_name ILIKE '%trc%'
       OR network_name ILIKE '%tron%'
  );
