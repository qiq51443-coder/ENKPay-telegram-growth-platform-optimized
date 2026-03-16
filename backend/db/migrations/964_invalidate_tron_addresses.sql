-- Migration 964: Invalidate incorrectly derived TRON deposit addresses
-- All existing TRON hd_derived addresses were computed with the compressed public key (wrong).
-- ethers.js v6 wallet.signingKey.publicKey returns a compressed key (0x02/0x03 + 32 bytes),
-- but TRON address derivation requires the uncompressed key (0x04 + 64 bytes).
-- Mark them inactive so they will be re-derived correctly on the next deposit request.
UPDATE user_deposit_addresses uda
SET is_active = false
FROM deposit_networks dn
WHERE uda.network_id = dn.id
  AND (dn.chain_name ILIKE 'tron' OR dn.chain_name ILIKE 'trc20')
  AND uda.source = 'hd_derived';
