/**
 * sweep.service.ts — Fund sweeping / consolidation service.
 *
 * Derives HD private keys from stored mnemonics and moves token balances
 * from user deposit addresses back to the platform hot wallets.
 *
 * Required env vars (all optional — missing vars cause a graceful skip):
 *   SWEEP_HOT_WALLET_ETH   — Platform hot wallet address for ETH/BSC
 *   SWEEP_HOT_WALLET_TRON  — Platform hot wallet address for TRON
 *   SWEEP_MIN_AMOUNT       — Minimum token amount to trigger a sweep (default: 1.0)
 *   ETH_RPC_URL            — Ethereum JSON-RPC URL
 *   BSC_RPC_URL            — BSC JSON-RPC URL
 *   TRON_RPC_URL           — TronGrid full node URL (default: https://api.trongrid.io)
 */

import { query, transaction } from '../db';
import { decrypt } from './deposit.service';

// Lazily-loaded crypto libraries
let ethers: any = null;
let TronWeb: any = null;

try {
  ethers = require('ethers');
} catch {
  console.warn('ethers library not installed. ETH/BSC sweeping will not work.');
}

try {
  TronWeb = require('tronweb');
} catch {
  console.warn('tronweb library not installed. Tron sweeping will not work.');
}

// Minimal ERC-20 ABI for balanceOf + transfer
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

export interface SweepResult {
  networkId: number;
  fromAddress: string;
  toAddress: string;
  amount: number;
  txHash: string | null;
  status: 'broadcast' | 'failed' | 'skipped';
  error?: string;
}

/**
 * Derive an Ethereum/BSC private key (hex with 0x prefix) from an HD mnemonic.
 */
export async function deriveEthPrivateKey(
  mnemonic: string,
  derivationPath: string,
  index: number
): Promise<string> {
  if (!ethers) throw new Error('ethers library required for ETH private key derivation');
  const path = `${derivationPath.replace(/\/+$/, '')}/${index}`;
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  return wallet.privateKey; // includes 0x prefix
}

/**
 * Derive a Tron private key (hex WITHOUT 0x prefix) from an HD mnemonic.
 */
export async function deriveTronPrivateKey(
  mnemonic: string,
  derivationPath: string,
  index: number
): Promise<string> {
  if (!ethers) throw new Error('ethers library required for Tron private key derivation');
  const path = `${derivationPath.replace(/\/+$/, '')}/${index}`;
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  return wallet.privateKey.slice(2); // strip 0x for TronWeb
}

/**
 * Sweep ERC-20 tokens from a user deposit address to the hot wallet.
 *
 * Returns the tx hash on success, or null if there was nothing to sweep
 * (zero balance or insufficient ETH/BNB for gas).
 */
export async function sweepEthAddress(
  fromAddress: string,
  privateKey: string,
  toAddress: string,
  networkRpcUrl: string,
  tokenContractAddress: string
): Promise<string | null> {
  if (!ethers) {
    console.warn('ethers not available — skipping ETH sweep');
    return null;
  }

  const provider = new ethers.JsonRpcProvider(networkRpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const token = new ethers.Contract(tokenContractAddress, ERC20_ABI, signer);

  const balance: bigint = await token.balanceOf(fromAddress);
  if (balance === 0n) {
    return null; // Nothing to sweep
  }

  // Check that the address has enough native coin for gas
  const nativeBalance: bigint = await provider.getBalance(fromAddress);
  const gasEstimate = await token.transfer.estimateGas(toAddress, balance);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || 0n;
  const gasCost = gasEstimate * gasPrice;

  if (nativeBalance < gasCost) {
    console.warn(
      `Insufficient native balance for gas on ${fromAddress}. ` +
        `Have ${nativeBalance}, need ${gasCost}. Skipping sweep.`
    );
    return null;
  }

  const tx = await token.transfer(toAddress, balance);
  await tx.wait(1);
  return tx.hash as string;
}

/**
 * Sweep TRC-20 tokens from a user deposit address to the hot wallet.
 *
 * Returns the tx hash on success, or null if nothing to sweep.
 */
export async function sweepTronAddress(
  fromAddress: string,
  privateKey: string,
  toAddress: string,
  trongridUrl: string,
  tokenContractAddress: string
): Promise<string | null> {
  if (!TronWeb) {
    console.warn('tronweb not available — skipping Tron sweep');
    return null;
  }

  const tronWeb = new TronWeb({
    fullHost: trongridUrl,
    privateKey,
  });

  const contract = await tronWeb.contract().at(tokenContractAddress);
  const rawBalance = await contract.balanceOf(fromAddress).call();
  const balance = BigInt(rawBalance.toString());

  if (balance === 0n) {
    return null;
  }

  const result = await contract.transfer(toAddress, balance.toString()).send({
    // TRON_MAX_FEE_LIMIT in SUN (default: 20 TRX = 20,000,000 SUN)
    feeLimit: parseInt(process.env.TRON_MAX_FEE_LIMIT || '20000000', 10),
  });

  // TronWeb returns txid as string directly
  return typeof result === 'string' ? result : null;
}

/**
 * Main sweep orchestrator: queries all active user deposit addresses, derives
 * their private keys, and sweeps balances to the platform hot wallets.
 *
 * Options:
 *   networkId — restrict sweep to a specific network (optional)
 *   minAmount — override the SWEEP_MIN_AMOUNT env var (optional)
 */
export async function sweepAllPendingAddresses(options?: {
  networkId?: number;
  minAmount?: number;
}): Promise<SweepResult[]> {
  const hotWalletEth = process.env.SWEEP_HOT_WALLET_ETH || '';
  const hotWalletTron = process.env.SWEEP_HOT_WALLET_TRON || '';
  const minAmount =
    options?.minAmount ?? parseFloat(process.env.SWEEP_MIN_AMOUNT || '1.0');

  if (!hotWalletEth && !hotWalletTron) {
    console.warn(
      'SWEEP_HOT_WALLET_ETH and SWEEP_HOT_WALLET_TRON are both unset. Skipping sweep.'
    );
    return [];
  }

  // Build query
  let networksFilter = '';
  const params: any[] = [];
  if (options?.networkId) {
    params.push(options.networkId);
    networksFilter = `AND dn.id = $${params.length}`;
  }

  const addressesResult = await query(
    `SELECT
       uda.id AS address_id,
       uda.user_id,
       uda.address,
       uda.hd_index,
       dn.id AS network_id,
       dn.chain_name,
       dn.contract_address,
       dn.decimals,
       dn.hd_mnemonic_encrypted,
       dn.hd_derivation_path,
       dn.rpc_url
     FROM user_deposit_addresses uda
     JOIN deposit_networks dn ON uda.network_id = dn.id
     WHERE uda.is_active = true AND dn.is_active = true ${networksFilter}
     ORDER BY uda.id`,
    params
  );

  const results: SweepResult[] = [];

  for (const row of addressesResult.rows) {
    const {
      address,
      hd_index,
      network_id,
      chain_name,
      contract_address,
      decimals,
      hd_mnemonic_encrypted,
      hd_derivation_path,
      rpc_url,
    } = row;

    // Determine hot wallet for this chain
    const isTron = chain_name === 'TRON';
    const hotWallet = isTron ? hotWalletTron : hotWalletEth;

    if (!hotWallet) {
      console.warn(`No hot wallet configured for chain ${chain_name}. Skipping ${address}.`);
      continue;
    }

    if (!hd_mnemonic_encrypted) {
      console.warn(`No HD mnemonic for network ${network_id}. Skipping ${address}.`);
      continue;
    }

    if (!contract_address) {
      console.warn(`No contract_address for network ${network_id}. Skipping ${address}.`);
      continue;
    }

    let txHash: string | null = null;
    let sweptAmount: number | null = null;
    let errorMessage: string | undefined;
    let status: SweepResult['status'] = 'skipped';

    try {
      const mnemonic = decrypt(hd_mnemonic_encrypted);
      const hdIndex = Number(hd_index ?? 0);

      if (isTron) {
        const privateKey = await deriveTronPrivateKey(mnemonic, hd_derivation_path, hdIndex);
        const trongridUrl = rpc_url || process.env.TRON_RPC_URL || 'https://api.trongrid.io';

        // Read balance to decide whether to sweep
        if (TronWeb) {
          const tronWeb = new TronWeb({ fullHost: trongridUrl, privateKey });
          const contract = await tronWeb.contract().at(contract_address);
          const rawBal = await contract.balanceOf(address).call();
          const dec = Number(decimals ?? 6);
          sweptAmount = Number(rawBal.toString()) / 10 ** dec;

          if (sweptAmount < minAmount) {
            status = 'skipped';
          } else {
            txHash = await sweepTronAddress(address, privateKey, hotWallet, trongridUrl, contract_address);
            status = txHash ? 'broadcast' : 'skipped';
          }
        }
      } else {
        const privateKey = await deriveEthPrivateKey(mnemonic, hd_derivation_path, hdIndex);
        const networkRpcUrl =
          rpc_url ||
          (chain_name === 'BSC' ? process.env.BSC_RPC_URL : process.env.ETH_RPC_URL) ||
          '';

        if (!networkRpcUrl) {
          console.warn(`No RPC URL for network ${network_id} (${chain_name}). Skipping ${address}.`);
          status = 'skipped';
        } else if (ethers) {
          // Read balance first
          const provider = new ethers.JsonRpcProvider(networkRpcUrl);
          const token = new ethers.Contract(contract_address, ERC20_ABI, provider);
          const balRaw: bigint = await token.balanceOf(address);
          const dec = Number(decimals ?? 18);
          sweptAmount = Number(balRaw) / 10 ** dec;

          if (sweptAmount < minAmount) {
            status = 'skipped';
          } else {
            txHash = await sweepEthAddress(address, privateKey, hotWallet, networkRpcUrl, contract_address);
            status = txHash ? 'broadcast' : 'skipped';
          }
        }
      }
    } catch (err: any) {
      errorMessage = err.message || String(err);
      status = 'failed';
      console.error(`Sweep failed for address ${address} (network ${network_id}):`, errorMessage);
    }

    const recordedAmount = sweptAmount ?? 0;

    if (status === 'broadcast' && txHash) {
      // Persist sweep record in DB
      try {
        await transaction(async (client: any) => {
          await client.query(
            `INSERT INTO sweep_records
               (network_id, from_address, to_address, amount, tx_hash, status)
             VALUES ($1, $2, $3, $4, $5, 'broadcast')`,
            [network_id, address, hotWallet, recordedAmount, txHash]
          );
        });
      } catch (dbErr: any) {
        console.error('Failed to insert sweep_record:', dbErr.message);
      }
    } else if (status === 'failed' && errorMessage) {
      try {
        await transaction(async (client: any) => {
          await client.query(
            `INSERT INTO sweep_records
               (network_id, from_address, to_address, amount, tx_hash, status, error_message)
             VALUES ($1, $2, $3, $4, NULL, 'failed', $5)`,
            [network_id, address, hotWallet, recordedAmount, errorMessage]
          );
        });
      } catch (dbErr: any) {
        console.error('Failed to insert failed sweep_record:', dbErr.message);
      }
    }

    if (status !== 'skipped') {
      results.push({
        networkId: network_id,
        fromAddress: address,
        toAddress: hotWallet,
        amount: recordedAmount,
        txHash,
        status,
        error: errorMessage,
      });
    }
  }

  return results;
}
