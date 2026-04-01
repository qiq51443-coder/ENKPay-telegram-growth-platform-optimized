import crypto from 'crypto';
import axios from 'axios';
import { query, transaction } from '../db';
import { generateOrderId } from '../utils/orderId';

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

// Validate encryption key presence at startup
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || '';
if (!ENCRYPTION_KEY) {
  console.warn('WARNING: WALLET_ENCRYPTION_KEY is not set. Calling encrypt() or decrypt() will throw an error.');
}

/**
 * Derive a fixed 32-byte AES key from WALLET_ENCRYPTION_KEY using SHA-256.
 * This allows keys of any length to be used safely with AES-256-CBC.
 *
 * NOTE: This is backward-incompatible with data encrypted using a key that was
 * exactly 32 bytes long (previously used directly without hashing).
 * If you have existing encrypted mnemonics stored with a 32-byte key, you will
 * need to re-encrypt them after this change.
 * For keys that were NOT exactly 32 bytes (e.g., 44-byte base64 keys),
 * this is the first successful encryption — no migration needed.
 */
function getEncryptionKeyBuffer(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error('WALLET_ENCRYPTION_KEY is not configured. Please set it in environment variables.');
  }
  return crypto.createHash('sha256').update(ENCRYPTION_KEY, 'utf8').digest();
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
  console.warn('tronweb library not installed. Tron sweep operations will not work.');
}

/**
 * Encrypt sensitive data (private keys, mnemonics)
 */
export function encrypt(text: string): string {
  const key = getEncryptionKeyBuffer();
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
  const key = getEncryptionKeyBuffer();
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
 * Derive Tron address from HD wallet using pure ethers.js.
 *
 * This implementation follows the exact same algorithm used by TronLink and
 * other standard Tron wallets (BIP44, coin_type=195):
 *
 *   1. Derive secp256k1 private key at path m/44'/195'/0'/0/{index}
 *   2. Get the uncompressed public key (65 bytes, 0x04 prefix)
 *   3. Strip the 0x04 prefix → 64 bytes
 *   4. Keccak256 hash of the 64 bytes → 32 bytes
 *   5. Take the last 20 bytes
 *   6. Prepend Tron mainnet byte 0x41 → 21 bytes
 *   7. Compute double-SHA256 checksum → take first 4 bytes
 *   8. Append checksum → 25 bytes total
 *   9. Base58 encode → Tron address (always starts with 'T')
 *
 * NOTE: We do NOT use tronweb.address.fromPrivateKey() here because tronweb v5.x
 * requires a valid fullHost to initialise, which causes unpredictable behaviour
 * in offline/local environments and can produce wrong addresses.
 */
export async function deriveTronAddress(
  mnemonic: string,
  derivationPath: string,
  index: number
): Promise<string> {
  if (!ethers) {
    throw new Error(
      'Tron address derivation requires ethers.js. Install with: npm install ethers'
    );
  }

  try {
    const path = `${derivationPath.replace(/\/+$/, '')}/${index}`;
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);

    // Steps 2-4: uncompressed public key → Keccak256
    // wallet.signingKey.publicKey returns the COMPRESSED key (0x02/0x03 + 32 bytes).
    // TRON (like Ethereum) requires the UNCOMPRESSED key (0x04 + 64 bytes) as input to Keccak256.
    const compressedKey = wallet.signingKey.publicKey;
    const publicKeyUncompressed = ethers.SigningKey.computePublicKey(compressedKey, false); // 0x04 + 64 bytes
    const pubBytes = ethers.getBytes(publicKeyUncompressed).slice(1); // remove 0x04 prefix → 64 bytes
    const addressHash = ethers.keccak256(pubBytes); // 32-byte hex

    // Step 5: last 20 bytes of the hash
    const last20Bytes = ethers.getBytes(addressHash).slice(12);

    // Step 6: prepend Tron mainnet prefix 0x41
    const tronAddressBytes = new Uint8Array(21);
    tronAddressBytes[0] = 0x41;
    tronAddressBytes.set(last20Bytes, 1);

    // Step 7: double SHA256 checksum
    const hash1 = ethers.getBytes(ethers.sha256(tronAddressBytes));
    const hash2 = ethers.getBytes(ethers.sha256(hash1));
    const checksum = hash2.slice(0, 4);

    // Step 8: full 25-byte payload
    const fullBytes = new Uint8Array(25);
    fullBytes.set(tronAddressBytes, 0);
    fullBytes.set(checksum, 21);

    // Step 9: Base58 encode
    const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let num = BigInt('0x' + Buffer.from(fullBytes).toString('hex'));
    let encoded = '';
    while (num > 0n) {
      const remainder = num % 58n;
      num = num / 58n;
      encoded = BASE58_ALPHABET[Number(remainder)] + encoded;
    }
    for (const byte of fullBytes) {
      if (byte === 0) encoded = '1' + encoded;
      else break;
    }

    return encoded;
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
      if (chainUpper === 'TRON' || chainUpper === 'TRC20' || chainUpper === 'TRC') {
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
