import crypto from 'crypto';
import { query } from '../db';

// Note: For production, install these packages:
// npm install ethers tronweb
// Then import: import { ethers } from 'ethers'; import TronWeb from 'tronweb';

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || 'default-key-change-in-production-32b';

/**
 * Encrypt sensitive data (private keys, mnemonics)
 */
export function encrypt(text: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encryptedText: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Derive Ethereum/BSC address from HD wallet
 * Note: This is a placeholder. Install ethers.js and implement properly:
 * 
 * const wallet = ethers.Wallet.fromMnemonic(mnemonic, `${derivationPath}/${index}`);
 * return wallet.address;
 */
export async function deriveEthAddress(
  mnemonic: string,
  derivationPath: string,
  index: number
): Promise<string> {
  // TODO: Implement with ethers.js
  // For now, return a placeholder that indicates this needs implementation
  throw new Error(
    'ETH/BSC address derivation requires ethers.js. Install with: npm install ethers'
  );
}

/**
 * Derive Tron address from HD wallet
 * Note: This is a placeholder. Install tronweb and implement properly:
 * 
 * const wallet = TronWeb.utils.accounts.generateAccountWithMnemonic(mnemonic, `${derivationPath}/${index}`);
 * return wallet.address;
 */
export async function deriveTronAddress(
  mnemonic: string,
  derivationPath: string,
  index: number
): Promise<string> {
  // TODO: Implement with TronWeb
  throw new Error(
    'Tron address derivation requires tronweb. Install with: npm install tronweb'
  );
}

/**
 * Generate a unique deposit address for a user
 */
export async function generateUserDepositAddress(
  userId: number,
  networkId: number
): Promise<string> {
  // Check if address already exists
  const existingResult = await query(
    `SELECT address FROM user_deposit_addresses 
     WHERE user_id = $1 AND network_id = $2 AND is_active = true`,
    [userId, networkId]
  );

  if (existingResult.rows.length > 0) {
    return existingResult.rows[0].address;
  }

  // Get network details
  const networkResult = await query(
    `SELECT 
       network_name,
       chain_name,
       hd_derivation_path,
       hd_mnemonic_encrypted
     FROM deposit_networks
     WHERE id = $1 AND is_active = true`,
    [networkId]
  );

  if (networkResult.rows.length === 0) {
    throw new Error('Deposit network not found or inactive');
  }

  const network = networkResult.rows[0];

  // Get next available HD index for this network
  const indexResult = await query(
    `SELECT COALESCE(MAX(hd_index), -1) + 1 as next_index
     FROM user_deposit_addresses
     WHERE network_id = $1 AND source = 'hd_derived'`,
    [networkId]
  );
  const hdIndex = indexResult.rows[0].next_index;

  // Generate address based on chain type
  let address: string;
  
  try {
    if (!network.hd_mnemonic_encrypted) {
      throw new Error(
        `HD mnemonic not configured for network ${network.network_name}. Please configure in admin panel.`
      );
    }

    const mnemonic = decrypt(network.hd_mnemonic_encrypted);
    const derivationPath = network.hd_derivation_path;

    if (network.chain_name === 'TRON') {
      address = await deriveTronAddress(mnemonic, derivationPath, hdIndex);
    } else if (network.chain_name === 'ETH' || network.chain_name === 'BSC') {
      address = await deriveEthAddress(mnemonic, derivationPath, hdIndex);
    } else {
      throw new Error(`Unsupported chain: ${network.chain_name}`);
    }
  } catch (error: any) {
    // If crypto libraries not installed, provide helpful error
    throw new Error(
      `Unable to generate deposit address: ${error.message}. ` +
      `Please install required crypto libraries (ethers, tronweb) and configure HD mnemonics.`
    );
  }

  // Save address to database
  await query(
    `INSERT INTO user_deposit_addresses 
     (user_id, network_id, address, hd_index, source, is_active)
     VALUES ($1, $2, $3, $4, 'hd_derived', true)`,
    [userId, networkId, address, hdIndex]
  );

  return address;
}

/**
 * Manually add a deposit address (for admin use)
 */
export async function addManualDepositAddress(
  userId: number,
  networkId: number,
  address: string
): Promise<void> {
  await query(
    `INSERT INTO user_deposit_addresses 
     (user_id, network_id, address, source, is_active)
     VALUES ($1, $2, $3, 'manual', true)
     ON CONFLICT (user_id, network_id) 
     DO UPDATE SET address = $3, source = 'manual', is_active = true`,
    [userId, networkId, address]
  );
}

/**
 * Get all deposit addresses for a user
 */
export async function getUserDepositAddresses(userId: number) {
  const result = await query(
    `SELECT 
       uda.id,
       uda.address,
       uda.source,
       dn.network_name,
       dn.network_display,
       dn.chain_name,
       dn.currency,
       dn.explorer_url
     FROM user_deposit_addresses uda
     JOIN deposit_networks dn ON uda.network_id = dn.id
     WHERE uda.user_id = $1 AND uda.is_active = true
     ORDER BY dn.sort_order`,
    [userId]
  );

  return result.rows;
}
