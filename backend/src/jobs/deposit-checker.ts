import cron from 'node-cron';
import axios from 'axios';
import { query, transaction } from '../db';
import { decrypt, processDeposit, creditDeposit } from '../services/deposit.service';

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
