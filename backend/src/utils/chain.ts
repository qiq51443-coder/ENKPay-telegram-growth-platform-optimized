/**
 * Shared chain type resolution utility.
 * Accepts common chain name aliases and returns a canonical chain type.
 */
export type ChainType = 'TRON' | 'BSC' | 'POLYGON' | 'ETH';

/**
 * Determine the canonical chain type from a chain_name string.
 * Accepts common aliases (e.g. ERC20 → ETH, BEP20 → BSC, TRC20 → TRON).
 * Returns 'TRON', 'BSC', 'POLYGON', or 'ETH'.
 */
export function resolveChainType(chainName: string): ChainType {
  const c = (chainName || '').toUpperCase();
  if (c === 'TRON' || c === 'TRC20' || c === 'TRC') return 'TRON';
  if (c === 'BSC' || c === 'BNB' || c === 'BEP20') return 'BSC';
  if (c === 'POLYGON' || c === 'MATIC') return 'POLYGON';
  // ETH / ETHEREUM / ERC20 and anything else EVM-compatible
  return 'ETH';
}

/**
 * Moralis Streams chain identifiers (EVM hex chain IDs).
 * Used when creating a Moralis Stream for a given chain type.
 */
export const MORALIS_CHAIN_IDS: Record<string, string> = {
  ETH: '0x1',
  BSC: '0x38',
  POLYGON: '0x89',
};
