import { query } from '../db';
import { encrypt, decrypt } from '../utils/encryption';
import { addAddressToStream } from './moralis-stream.service';
import { addAddressToQuickNodeWebhook } from './quicknode.service';
import { resolveChainType } from '../utils/chain';

export async function recordDeposit(
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
) {
  const isConfirmed = confirmations >= requiredConfirmations;
  
  const result = await query(
    `INSERT INTO deposits
     (user_id, network_id, tx_hash, from_address, to_address, amount, confirmations, required_confirmations, block_number, block_timestamp, is_confirmed, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (tx_hash, network_id)
     DO UPDATE SET
       confirmations = $7,
       is_confirmed = $11,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, networkId, txHash, fromAddress, toAddress, amount, confirmations, requiredConfirmations, blockNumber, blockTimestamp, isConfirmed]
  );
  
  return result.rows[0];
}

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
) {
  const isConfirmed = confirmations >= requiredConfirmations;
  
  await recordDeposit(userId, networkId, txHash, fromAddress, toAddress, amount, confirmations, requiredConfirmations, blockNumber, blockTimestamp);
  
  // If confirmed, credit user wallet
  if (isConfirmed) {
    await query(
      `UPDATE users
       SET wallet_balance = wallet_balance + $1,
           total_deposit_amount = total_deposit_amount + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [amount, userId]
    );
    
    // Record transaction
    await query(
      `INSERT INTO user_transactions
       (user_id, tx_type, amount, tx_hash, network_id, status, created_at, updated_at)
       VALUES ($1, 'deposit', $2, $3, $4, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [userId, amount, txHash, networkId]
    );
  }
  
  // Try to add address to stream if applicable
  try {
    const streamInfoResult = await query(
      `SELECT listener_mode, moralis_stream_id, webhook_id, webhook_provider, webhook_api_key_encrypted, chain_name
       FROM deposit_networks WHERE id = $1`,
      [networkId]
    );
    const streamInfo = streamInfoResult.rows[0];
    if (
      streamInfo?.listener_mode === 'stream' &&
      streamInfo?.webhook_id &&
      streamInfo?.webhook_api_key_encrypted &&
      streamInfo?.webhook_provider
    ) {
      const chainType = resolveChainType(streamInfo.chain_name);
      if (chainType !== 'TRON') {
        const apiKey = decrypt(streamInfo.webhook_api_key_encrypted);
        if (streamInfo.webhook_provider === 'quicknode') {
          addAddressToQuickNodeWebhook(apiKey, streamInfo.webhook_id, toAddress).catch((err: any) =>
            console.error('Failed to add address to QuickNode webhook:', err.message)
          );
        } else {
          addAddressToStream(apiKey, streamInfo.moralis_stream_id || streamInfo.webhook_id, toAddress).catch((err: any) =>
            console.error('Failed to add address to Moralis Stream:', err.message)
          );
        }
      }
    }
  } catch (streamErr: any) {
    console.error('Failed to check stream mode for new address sync:', streamErr.message);
  }
}
