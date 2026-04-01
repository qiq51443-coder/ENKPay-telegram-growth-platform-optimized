import cron from 'node-cron';
import axios from 'axios';
import { query, transaction } from '../db';
import { decrypt, processDeposit, creditDeposit } from '../services/deposit.service';
import { resolveChainType } from '../utils/chain';

let isRunning = false;
let cronJob: cron.ScheduledTask | null = null;

/**
 * Ensure scan state row exists for a given network + address, returning its current state.
 */
async function getScanState(
  networkId: number,
  address: string
): Promise<{ last_scanned_block: number; last_scanned_at: Date }> {
  await query(
    `INSERT INTO deposit_scan_state (network_id, address)
     VALUES ($1, $2)
     ON CONFLICT (network_id, address) DO NOTHING`,
    [networkId, address]
  );
  const result = await query(
    `SELECT last_scanned_block, last_scanned_at FROM deposit_scan_state WHERE network_id = $1 AND address = $2`,
    [networkId, address]
  );
  return result.rows[0];
}

/**
 * Update scan state after a successful scan pass.
 */
async function updateScanState(
  networkId: number,
  address: string,
  lastScannedBlock: number
): Promise<void> {
  await query(
    `UPDATE deposit_scan_state
     SET last_scanned_block = $3, last_scanned_at = NOW()
     WHERE network_id = $1 AND address = $2`,
    [networkId, address, lastScannedBlock]
  );
}

/**
 * Check deposits for TRC20 (Tron) network using TronGrid API.
 * Env vars used:
 *   TRONGRID_API_KEY — optional TRON-PRO-API-KEY header for higher rate limits
 */
async function checkTronDeposits(network: any, addresses: string[]): Promise<void> {
  console.log(`Checking Tron deposits for ${addresses.length} addresses on network ${network.network_name}...`);

  const apiKey = process.env.TRONGRID_API_KEY;
  const contractAddress = network.contract_address;
  const decimals = network.decimals != null ? Number(network.decimals) : 6;
  const minDeposit = Number(network.min_deposit_amount) || 0;

  for (const address of addresses) {
    try {
      const state = await getScanState(network.id, address);
      const minTimestamp = state.last_scanned_at
        ? new Date(state.last_scanned_at).getTime()
        : 0;

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['TRON-PRO-API-KEY'] = apiKey;
      }

      const params: Record<string, any> = {
        only_confirmed: true,
        limit: 200,
      };
      if (contractAddress) {
        params.contract_address = contractAddress;
      }
      if (minTimestamp > 0) {
        params.min_timestamp = minTimestamp;
      }

      const response = await axios.get(
        `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`,
        { headers, params, timeout: 10000 }
      );

      const transfers: any[] = response.data?.data || [];
      let latestTimestamp = minTimestamp;

      for (const tx of transfers) {
        // Only process incoming transfers to this address
        const toAddr: string = tx.to || '';
        if (toAddr.toLowerCase() !== address.toLowerCase()) {
          continue;
        }

        const rawValue = BigInt(tx.value || '0');
        const amount = Number(rawValue) / 10 ** decimals;

        if (amount < minDeposit) {
          continue;
        }

        // Find user owning this address
        const addrResult = await query(
          `SELECT user_id FROM user_deposit_addresses WHERE address = $1 AND network_id = $2 AND is_active = true`,
          [address, network.id]
        );
        if (addrResult.rows.length === 0) continue;
        const userId = addrResult.rows[0].user_id;

        const txHash: string = tx.transaction_id || tx.tx_id || '';
        const fromAddress: string = tx.from || '';
        const blockTimestamp: Date = tx.block_timestamp
          ? new Date(Number(tx.block_timestamp))
          : new Date();

        await processDeposit(
          userId,
          network.id,
          txHash,
          fromAddress,
          address,
          amount,
          1, // TRC20 txs returned here are already confirmed
          network.min_confirmations || 1,
          0,
          blockTimestamp
        );

        if (tx.block_timestamp && Number(tx.block_timestamp) > latestTimestamp) {
          latestTimestamp = Number(tx.block_timestamp);
        }
      }

      // Update scan timestamp to now so next run only fetches newer transactions
      await query(
        `UPDATE deposit_scan_state SET last_scanned_at = NOW() WHERE network_id = $1 AND address = $2`,
        [network.id, address]
      );
    } catch (err: any) {
      console.error(`Error checking Tron deposits for address ${address}:`, err.message);
      // Continue with next address; do not let one failure abort the entire scan
    }
  }
}

/**
 * Check deposits for ERC20/BEP20 (Ethereum/BSC) networks using Etherscan/BscScan API.
 * Env vars used:
 *   ETHERSCAN_API_KEY   — Etherscan API key (for ETH/ERC20 network)
 *   BSCSCAN_API_KEY     — BscScan API key (for BSC/BEP20 network)
 *   POLYGONSCAN_API_KEY — PolygonScan API key (for POLYGON/MATIC network)
 */
async function checkEthDeposits(network: any, addresses: string[]): Promise<void> {
  console.log(`Checking ${network.chain_name} deposits for ${addresses.length} addresses on network ${network.network_name}...`);

  const chainType = resolveChainType(network.chain_name);
  let apiBaseUrl: string;
  let apiKey: string;
  if (chainType === 'BSC') {
    apiBaseUrl = 'https://api.bscscan.com/api';
    apiKey = process.env.BSCSCAN_API_KEY || '';
  } else if (chainType === 'POLYGON') {
    apiBaseUrl = 'https://api.polygonscan.com/api';
    apiKey = process.env.POLYGONSCAN_API_KEY || '';
  } else {
    apiBaseUrl = 'https://api.etherscan.io/api';
    apiKey = process.env.ETHERSCAN_API_KEY || '';
  }
  const contractAddress = network.contract_address || '';
  const decimals = network.decimals != null ? Number(network.decimals) : 18;
  const minDeposit = Number(network.min_deposit_amount) || 0;

  for (const address of addresses) {
    try {
      const state = await getScanState(network.id, address);
      const startBlock = Number(state.last_scanned_block) || 0;

      const params: Record<string, any> = {
        module: 'account',
        action: 'tokentx',
        address,
        startblock: startBlock,
        endblock: 'latest',
        sort: 'asc',
      };
      if (contractAddress) {
        params.contractaddress = contractAddress;
      }
      if (apiKey) {
        params.apikey = apiKey;
      }

      const response = await axios.get(apiBaseUrl, { params, timeout: 10000 });
      const data = response.data;

      if (data.status !== '1' || !Array.isArray(data.result)) {
        // status '0' with message 'No transactions found' is normal
        if (data.message && data.message !== 'No transactions found') {
          console.warn(`${network.chain_name} API warning for ${address}: ${data.message}`);
        }
        continue;
      }

      const transfers: any[] = data.result;
      let maxBlock = startBlock;

      for (const tx of transfers) {
        const toAddr: string = tx.to || '';
        if (toAddr.toLowerCase() !== address.toLowerCase()) {
          continue;
        }

        const rawValue = BigInt(tx.value || '0');
        const amount = Number(rawValue) / 10 ** decimals;

        if (amount < minDeposit) {
          continue;
        }

        // Find user owning this address
        const addrResult = await query(
          `SELECT user_id FROM user_deposit_addresses WHERE address = $1 AND network_id = $2 AND is_active = true`,
          [address, network.id]
        );
        if (addrResult.rows.length === 0) continue;
        const userId = addrResult.rows[0].user_id;

        const txHash: string = tx.hash || '';
        const fromAddress: string = tx.from || '';
        const blockNumber = parseInt(tx.blockNumber || '0', 10);
        const blockTimestamp = tx.timeStamp
          ? new Date(parseInt(tx.timeStamp, 10) * 1000)
          : new Date();
        const confirmations = parseInt(tx.confirmations || '0', 10);

        await processDeposit(
          userId,
          network.id,
          txHash,
          fromAddress,
          address,
          amount,
          confirmations,
          network.min_confirmations || 12,
          blockNumber,
          blockTimestamp
        );

        if (blockNumber > maxBlock) {
          maxBlock = blockNumber;
        }
      }

      // Persist how far we have scanned so the next run starts from here
      if (maxBlock > startBlock) {
        await updateScanState(network.id, address, maxBlock);
      }
    } catch (err: any) {
      console.error(`Error checking ${network.chain_name} deposits for address ${address}:`, err.message);
      // Continue with next address
    }
  }
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
    // Get all active networks in polling mode (stream-mode networks receive push callbacks instead)
    const networksResult = await query(
      `SELECT 
         id, network_name, chain_name, min_confirmations, 
         scan_interval_seconds, min_deposit_amount,
         contract_address, decimals
       FROM deposit_networks
       WHERE is_active = true AND (listener_mode = 'polling' OR listener_mode IS NULL)`
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

      // Check deposits based on chain type (support common aliases)
      const chainType = resolveChainType(network.chain_name);
      if (chainType === 'TRON') {
        await checkTronDeposits(network, addresses);
      } else {
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

  // Run every minute for timely deposit detection
  cronJob = cron.schedule('* * * * *', async () => {
    await checkDeposits();
  });

  console.log('✓ Deposit checker started (running every minute)');

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
