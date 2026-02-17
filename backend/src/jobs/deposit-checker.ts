import cron from 'node-cron';
import axios from 'axios';
import { query, transaction } from '../db';
import { decrypt } from '../services/deposit.service';

let isRunning = false;
let cronJob: cron.ScheduledTask | null = null;

/**
 * Check deposits for TRC20 (Tron) network
 * Note: This is a placeholder. In production, use TronGrid API or similar
 */
async function checkTronDeposits(network: any, addresses: string[]): Promise<void> {
  // TODO: Implement TronGrid API integration
  // Example endpoint: https://api.trongrid.io/v1/accounts/{address}/transactions/trc20
  console.log(`Checking Tron deposits for ${addresses.length} addresses...`);
  
  // Placeholder - in production, query TronGrid for each address
  // and detect new USDT transfers to these addresses
}

/**
 * Check deposits for ERC20/BEP20 (Ethereum/BSC) networks
 * Note: This is a placeholder. In production, use Etherscan/BscScan API
 */
async function checkEthDeposits(network: any, addresses: string[]): Promise<void> {
  // TODO: Implement Etherscan/BscScan API integration
  // Example: https://api.etherscan.io/api?module=account&action=tokentx&address={address}
  console.log(`Checking ${network.chain_name} deposits for ${addresses.length} addresses...`);
  
  // Placeholder - in production, query blockchain explorer API
}

/**
 * Process a detected deposit transaction
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
  await transaction(async (client) => {
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

  // TODO: Send notification to user via Bot
  // You can add a notification service call here
}

/**
 * Main deposit checking function
 */
export async function checkDeposits(): Promise<void> {
  if (isRunning) {
    console.log('Deposit checker already running, skipping...');
    return;
  }

  isRunning = true;

  try {
    // Get all active networks
    const networksResult = await query(
      `SELECT 
         id, network_name, chain_name, min_confirmations, 
         scan_interval_seconds, min_deposit_amount
       FROM deposit_networks
       WHERE is_active = true`
    );

    for (const network of networksResult.rows) {
      // Get all user addresses for this network
      const addressesResult = await query(
        `SELECT uda.user_id, uda.address
         FROM user_deposit_addresses uda
         WHERE uda.network_id = $1 AND uda.is_active = true`,
        [network.id]
      );

      if (addressesResult.rows.length === 0) {
        continue;
      }

      const addresses = addressesResult.rows.map((row) => row.address);
      const addressToUser = new Map(
        addressesResult.rows.map((row) => [row.address, row.user_id])
      );

      // Check deposits based on chain type
      if (network.chain_name === 'TRON') {
        await checkTronDeposits(network, addresses);
      } else if (network.chain_name === 'ETH' || network.chain_name === 'BSC') {
        await checkEthDeposits(network, addresses);
      }
    }

    // Auto-confirm old pending deposits after configured time
    const configResult = await query(
      `SELECT value FROM platform_config WHERE key = $1`,
      ['deposit_auto_confirm_minutes']
    );
    const autoConfirmMinutes = configResult.rows.length > 0 
      ? parseInt(configResult.rows[0].value) 
      : 3;

    const oldDepositsResult = await query(
      `SELECT id, user_id, amount
       FROM deposit_records
       WHERE status = 'confirmed' 
         AND created_at < NOW() - INTERVAL '1 minute' * $1
         AND credited_at IS NULL`,
      [autoConfirmMinutes]
    );

    for (const deposit of oldDepositsResult.rows) {
      await transaction(async (client) => {
        await creditDeposit(client, deposit.id, deposit.user_id, deposit.amount);
      });
    }
  } catch (error) {
    console.error('Error checking deposits:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the deposit checker cron job
 */
export function startDepositChecker(): void {
  if (cronJob) {
    console.log('Deposit checker already started');
    return;
  }

  // Run every 5 minutes (reduced from 30 seconds as webhooks are primary method)
  cronJob = cron.schedule('*/5 * * * *', async () => {
    await checkDeposits();
  });

  console.log('✓ Deposit checker started (running every 5 minutes as fallback)');

  // Run once immediately
  checkDeposits();
}

/**
 * Stop the deposit checker
 */
export function stopDepositChecker(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Deposit checker stopped');
  }
}
