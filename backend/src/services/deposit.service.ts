import crypto from 'crypto';
import axios from 'axios';
import { query, transaction } from '../db';
import { generateOrderId } from '../utils/orderId';

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

// Validate encryption key
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || '';
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  console.warn(`WARNING: WALLET_ENCRYPTION_KEY must be exactly 32 bytes (current length: ${ENCRYPTION_KEY?.length ?? 0}). Wallet features will be disabled.`);
}

// In-memory mnemonic cache: networkId → decrypted mnemonic
// Avoids repeated AES decryption on every address derivation request.
// Security note: mnemonics are already held in process memory during derivation;
// caching them reduces CPU overhead without introducing a meaningfully wider
// exposure window. Ensure the process is not core-dumped in production.
const mnemonicCache = new Map<number, string>();

/**
 * Clear the in-memory mnemonic cache.
 * Must be called whenever a network's hd_mnemonic is created or updated via the
 * admin panel so that the next address derivation picks up the fresh mnemonic.
 *
 * @param networkId - If provided, only that network's entry is cleared.
 *                    If omitted, the entire cache is cleared.
 */
export function clearMnemonicCache(networkId?: number): void {
  if (networkId !== undefined) {
    mnemonicCache.delete(networkId);
  } else {
    mnemonicCache.clear();
  }
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
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    throw new Error('WALLET_ENCRYPTION_KEY must be exactly 32 bytes (current length: ' + (ENCRYPTION_KEY?.length ?? 0) + ')');
  }
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8');
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
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    throw new Error('WALLET_ENCRYPTION_KEY must be exactly 32 bytes (current length: ' + (ENCRYPTION_KEY?.length ?? 0) + ')');
  }
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8');
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
    const path = `${derivationPath.replace(/\/+$/, '')}/${index}`;
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

  if (!ethers) {
    throw new Error(
      'Tron address derivation requires ethers.js. Install with: npm install ethers'
    );
  }

  try {
    const path = `${derivationPath.replace(/\/+$/, '')}/${index}`;
    const hdNode = ethers ? ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path) : null;
    
    if (!hdNode) {
      throw new Error('ethers.js required for HD derivation');
    }

    // Get private key and convert to Tron address
    const privateKey = hdNode.privateKey.slice(2); // Remove '0x' prefix
    const tronWeb = new TronWeb({
      fullHost: 'http://localhost', // fromPrivateKey is a local operation; no network request needed
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
  userId: number | string,
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

  // Decrypt mnemonic — use in-memory cache to avoid repeated AES decryption
  if (!network.hd_mnemonic_encrypted) {
    throw new Error(
      `HD mnemonic not configured for network ${network.network_name}. Please configure in admin panel.`
    );
  }

  let mnemonic = mnemonicCache.get(networkId);
  if (!mnemonic) {
    mnemonic = decrypt(network.hd_mnemonic_encrypted);
    mnemonicCache.set(networkId, mnemonic);
  }

  // HD-7: Validate mnemonic integrity after decryption
  if (ethers && !ethers.Mnemonic.isValidMnemonic(mnemonic)) {
    throw new Error('Decrypted mnemonic is invalid. Please reconfigure the HD mnemonic.');
  }

  // In a single transaction: acquire advisory lock → allocate index → derive address → insert
  const address = await transaction(async (client: any) => {
    // Acquire an advisory lock keyed by network_id to serialize index allocation
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [networkId]);

    // Double-check: another concurrent request may have inserted while we were waiting
    const doubleCheck = await client.query(
      `SELECT address FROM user_deposit_addresses
       WHERE user_id = $1 AND network_id = $2 AND is_active = true`,
      [userId, networkId]
    );
    if (doubleCheck.rows.length > 0) return doubleCheck.rows[0].address;

    // Atomically allocate the next HD index
    const indexResult = await client.query(
      `SELECT COALESCE(MAX(hd_index), -1) + 1 AS next_index
       FROM user_deposit_addresses
       WHERE network_id = $1 AND source = 'hd_derived'`,
      [networkId]
    );
    const hdIndex: number = indexResult.rows[0].next_index;

    // Derive address while holding the lock (HD derivation is typically < 100 ms)
    let derivedAddress: string;
    try {
      const chainUpper = network.chain_name?.toUpperCase();
      if (chainUpper === 'TRON' || chainUpper === 'TRC20') {
        derivedAddress = await deriveTronAddress(mnemonic, network.hd_derivation_path, hdIndex);
      } else if (chainUpper === 'ETH' || chainUpper === 'ETHEREUM' || chainUpper === 'ERC20') {
        derivedAddress = await deriveEthAddress(mnemonic, network.hd_derivation_path, hdIndex);
      } else if (chainUpper === 'BSC' || chainUpper === 'BNB' || chainUpper === 'BEP20') {
        derivedAddress = await deriveBnbAddress(mnemonic, network.hd_derivation_path, hdIndex);
      } else if (chainUpper === 'POLYGON' || chainUpper === 'MATIC') {
        derivedAddress = await deriveEthAddress(mnemonic, network.hd_derivation_path, hdIndex);
      } else {
        // Fallback: attempt ETH-style derivation for unknown EVM-compatible chains
        console.warn(`Unknown chain: ${network.chain_name}, attempting ETH derivation as fallback`);
        derivedAddress = await deriveEthAddress(mnemonic, network.hd_derivation_path, hdIndex);
      }
    } catch (error: any) {
      throw new Error(
        `Unable to generate deposit address: ${error.message}. ` +
        `Please install required crypto libraries (ethers, tronweb) and configure HD mnemonics.`
      );
    }

    // Insert atomically — index allocation and address write are in the same transaction
    await client.query(
      `INSERT INTO user_deposit_addresses
       (user_id, network_id, address, hd_index, source, is_active)
       VALUES ($1, $2, $3, $4, 'hd_derived', true)`,
      [userId, networkId, derivedAddress, hdIndex]
    );

    return derivedAddress;
  });

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
export async function getUserDepositAddresses(userId: number | string) {
  const result = await query(
    `SELECT 
       uda.id,
       uda.address,
       uda.source,
       uda.hd_index,
       uda.created_at,
       dn.id AS network_id,
       dn.network_name,
       dn.network_display,
       dn.chain_name,
       dn.currency,
       dn.explorer_url,
       dn.min_deposit_amount,
       dn.min_confirmations
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
  let shouldNotify = false;

  // Fetch network name before the transaction so it's available for notification in all code paths
  const networkNameResult = await query(
    `SELECT network_name FROM deposit_networks WHERE id = $1`,
    [networkId]
  );
  const networkName = networkNameResult.rows.length > 0 ? networkNameResult.rows[0].network_name : String(networkId);

  const depositOrderId = await generateOrderId('deposit_records');

  await transaction(async (client: any) => {
    // Check if transaction already exists
    const existingResult = await client.query(
      `SELECT id, status FROM deposit_records WHERE tx_hash = $1 AND network_id = $2`,
      [txHash, networkId]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];

      // Only skip records that are already credited or failed
      if (existing.status === 'credited' || existing.status === 'failed') {
        return;
      }

      // Update confirmations and status (handles pending → confirming → confirmed transitions)
      const newStatus = confirmations >= requiredConfirmations ? 'confirmed' : 'confirming';
      await client.query(
        `UPDATE deposit_records 
         SET confirmations = $1, status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [confirmations, newStatus, existing.id]
      );

      // Auto-credit if confirmed — re-query credited_at to handle concurrency safely
      if (confirmations >= requiredConfirmations) {
        const freshRecord = await client.query(
          `SELECT credited_at FROM deposit_records WHERE id = $1`,
          [existing.id]
        );
        if (freshRecord.rows.length > 0 && !freshRecord.rows[0].credited_at) {
          await creditDeposit(client, existing.id, userId, amount);
          shouldNotify = true;
        }
      }
      return;
    }

    // Create new deposit record
    const status =
      confirmations >= requiredConfirmations ? 'confirmed' : 'confirming';

    const insertResult = await client.query(
      `INSERT INTO deposit_records 
       (order_id, user_id, network_id, tx_hash, from_address, to_address, amount, actual_amount, 
        confirmations, required_confirmations, block_number, block_timestamp, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        depositOrderId,
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
      shouldNotify = true;
    }
  });

  // After transaction commits, asynchronously notify the user (failure must not affect deposit)
  if (shouldNotify) {
    notifyUserDeposit(userId, amount, networkName, txHash).catch((err) =>
      console.error('Deposit notification failed:', err)
    );
  }
}

/**
 * Send a Telegram notification to the user after a successful deposit credit.
 * Errors are caught and logged — notification failure must never affect the deposit.
 */
async function notifyUserDeposit(
  userId: number,
  amount: number,
  networkName: string,
  txHash: string
): Promise<void> {
  try {
    const userResult = await query(
      `SELECT u.telegram_id, u.language_code, u.wallet_balance, b.token AS bot_token
       FROM users u
       JOIN bots b ON u.bot_id = b.id
       WHERE u.id = $1 AND b.is_active = true`,
      [userId]
    );
    if (userResult.rows.length === 0) return;
    const { telegram_id, bot_token, language_code, wallet_balance } = userResult.rows[0];
    if (!telegram_id || !bot_token) return;

    const { getNotifyTemplate, formatNotification } = await import('../utils/notify');
    const template = getNotifyTemplate(language_code || 'en', 'deposit_credited_notify');
    const message = formatNotification(template, {
      amount: parseFloat(amount.toString()).toFixed(2),
      network: networkName,
      txHash,
      balance: parseFloat(wallet_balance || '0').toFixed(2),
    });

    await axios.post(`https://api.telegram.org/bot${bot_token}/sendMessage`, {
      chat_id: telegram_id,
      text: message,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error(`Failed to notify user ${userId} of deposit:`, err);
  }
}

/**
 * Credit deposit to user's wallet
 */
export async function creditDeposit(
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
