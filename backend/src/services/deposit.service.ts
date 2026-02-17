import crypto from 'crypto';
import { query, transaction } from '../db';

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

// Validate encryption key
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || '';
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.warn('WARNING: WALLET_ENCRYPTION_KEY is not set or too short. Wallet features will be disabled.');
}

// Try to import crypto libraries
let ethers: any = null;
let TronWeb: any = null;

try {
  ethers = require('ethers');
} catch (error) {
  console.warn('ethers library not installed. ETH/BSC address derivation will not work.');
}

try {
  TronWeb = require('tronweb');
} catch (error) {
  console.warn('tronweb library not installed. Tron address derivation will not work.');
}

/**
 * Encrypt sensitive data (private keys, mnemonics)
 */
export function encrypt(text: string): string {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    throw new Error('WALLET_ENCRYPTION_KEY not configured');
  }
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
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    throw new Error('WALLET_ENCRYPTION_KEY not configured');
  }
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
 */
export async function deriveEthAddress(
  mnemonic: string,
  derivationPath: string,
  index: number
): Promise<string> {
  if (!ethers) {
    throw new Error(
      'ETH/BSC address derivation requires ethers.js. Install with: npm install ethers'
    );
  }

  try {
    const path = `${derivationPath}/${index}`;
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
    return wallet.address;
  } catch (error: any) {
    throw new Error(`Failed to derive ETH address: ${error.message}`);
  }
}

/**
 * Derive Tron address from HD wallet
 */
export async function deriveTronAddress(
  mnemonic: string,
  derivationPath: string,
  index: number
): Promise<string> {
  if (!TronWeb) {
    throw new Error(
      'Tron address derivation requires tronweb. Install with: npm install tronweb'
    );
  }

  try {
    const path = `${derivationPath}/${index}`;
    const hdNode = ethers ? ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path) : null;
    
    if (!hdNode) {
      throw new Error('ethers.js required for HD derivation');
    }

    // Get private key and convert to Tron address
    const privateKey = hdNode.privateKey.slice(2); // Remove '0x' prefix
    const tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
    });
    
    const address = tronWeb.address.fromPrivateKey(privateKey);
    return address;
  } catch (error: any) {
    throw new Error(`Failed to derive Tron address: ${error.message}`);
  }
}

/**
 * Derive BNB address (same as ETH since BSC uses same address format)
 */
export async function deriveBnbAddress(
  mnemonic: string,
  derivationPath: string,
  index: number
): Promise<string> {
  // BSC uses the same address format as Ethereum
  return deriveEthAddress(mnemonic, derivationPath, index);
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
    } else if (network.chain_name === 'ETH') {
      address = await deriveEthAddress(mnemonic, derivationPath, hdIndex);
    } else if (network.chain_name === 'BSC') {
      address = await deriveBnbAddress(mnemonic, derivationPath, hdIndex);
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

/**
 * Process a deposit (called by webhook or polling)
 */
export async function processDeposit(
  userId: number,
  networkId: number,
  txHash: string,
  fromAddress: string,
  toAddress: string,
  amount: number,
  confirmations: number,
  requiredConfirmations: number,
  blockNumber: number,
  blockTimestamp: Date
): Promise<void> {
  await transaction(async (client: any) => {
    // Check if transaction already exists
    const existingResult = await client.query(
      `SELECT id, status FROM deposit_records WHERE tx_hash = $1 AND network_id = $2`,
      [txHash, networkId]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      
      // Update confirmations if still pending/confirming
      if (existing.status === 'pending' || existing.status === 'confirming') {
        await client.query(
          `UPDATE deposit_records 
           SET confirmations = $1, status = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [
            confirmations,
            confirmations >= requiredConfirmations ? 'confirmed' : 'confirming',
            existing.id,
          ]
        );

        // Auto-credit if confirmed and not yet credited
        if (confirmations >= requiredConfirmations && existing.status !== 'credited') {
          await creditDeposit(client, existing.id, userId, amount);
        }
      }
      return;
    }

    // Create new deposit record
    const status =
      confirmations >= requiredConfirmations ? 'confirmed' : 'confirming';

    const insertResult = await client.query(
      `INSERT INTO deposit_records 
       (user_id, network_id, tx_hash, from_address, to_address, amount, actual_amount, 
        confirmations, required_confirmations, block_number, block_timestamp, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        userId,
        networkId,
        txHash,
        fromAddress,
        toAddress,
        amount,
        amount, // actual_amount same as amount (no deposit fee)
        confirmations,
        requiredConfirmations,
        blockNumber,
        blockTimestamp,
        status,
      ]
    );

    const depositId = insertResult.rows[0].id;

    // Auto-credit if confirmed
    if (confirmations >= requiredConfirmations) {
      await creditDeposit(client, depositId, userId, amount);
    }
  });
}

/**
 * Credit deposit to user's wallet
 */
async function creditDeposit(
  client: any,
  depositId: number,
  userId: number,
  amount: number
): Promise<void> {
  // Update user balance
  await client.query(
    `UPDATE users 
     SET wallet_balance = wallet_balance + $1,
         total_recharged = total_recharged + $1
     WHERE id = $2`,
    [amount, userId]
  );

  // Mark deposit as credited
  await client.query(
    `UPDATE deposit_records 
     SET status = 'credited', 
         credited_at = CURRENT_TIMESTAMP, 
         auto_credited = true,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [depositId]
  );

  console.log(`Credited ${amount} USDT to user ${userId} from deposit ${depositId}`);
}
