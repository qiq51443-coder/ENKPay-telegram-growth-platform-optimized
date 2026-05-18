import crypto from 'crypto';
import express from 'express';
import { query } from '../db';
import { processDeposit } from '../services/deposit.service';
import { verifyMoralisSignature } from '../services/moralis-stream.service';

const router = express.Router();

/**
 * Verify HMAC-SHA256 webhook signature from the X-Webhook-Signature header.
 * If WEBHOOK_SECRET is not configured, logs a warning and allows the request through.
 * Returns true when the request should be accepted, false when it must be rejected.
 */
function verifyWebhookSignature(req: express.Request, res: express.Response): boolean {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('[webhook-deposit] WEBHOOK_SECRET not set — webhook signature verification disabled');
    return true;
  }

  const signature = req.headers['x-webhook-signature'] as string | undefined;
  if (!signature) {
    res.status(401).json({ error: 'Missing webhook signature' });
    return false;
  }

  const expectedSig =
    'sha256=' +
    crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return false;
  }

  return true;
}

/**
 * POST /webhook/deposit/moralis
 * Receives Moralis Streams EVM chain callbacks (ETH/BSC/Polygon unified entry point).
 * Verification: x-moralis-signature header (sha3(body + MORALIS_STREAMS_SECRET)).
 * Moralis requires a 200 response, otherwise it will retry.
 */
router.post('/moralis', async (req, res) => {
  try {
    const moralisSecret = process.env.MORALIS_STREAMS_SECRET;
    if (moralisSecret) {
      const signature = req.headers['x-moralis-signature'] as string | undefined;
      if (!signature) {
        return res.status(401).json({ error: 'Missing x-moralis-signature header' });
      }
      // Use raw body for signature verification — re-serializing req.body would produce
      // a different string if the original payload had different field ordering/whitespace.
      const rawBody = (req as any).rawBody as string | undefined;
      if (!rawBody) {
        console.warn('[moralis-webhook] rawBody not available; falling back to JSON.stringify');
      }
      const bodyString = rawBody ?? JSON.stringify(req.body);
      if (!verifyMoralisSignature(bodyString, moralisSecret, signature)) {
        return res.status(401).json({ error: 'Invalid Moralis signature' });
      }
    } else {
      console.warn('[webhook-deposit] MORALIS_STREAMS_SECRET not set — Moralis signature verification disabled');
    }

    const { streamId, confirmed, erc20Transfers, block } = req.body;

    // Moralis always calls even for unconfirmed; only process confirmed transactions
    if (!confirmed) {
      console.log('[moralis-webhook] unconfirmed transaction, skipping');
      return res.status(200).json({ message: 'Unconfirmed transaction ignored' });
    }

    if (!streamId || !Array.isArray(erc20Transfers) || erc20Transfers.length === 0) {
      console.log(`[moralis-webhook] no erc20Transfers in payload, streamId=${streamId}, confirmed=${confirmed}`);
      return res.status(200).json({ message: 'No transfers to process' });
    }

    // Resolve network by moralis_stream_id
    const networkResult = await query(
      `SELECT id, min_confirmations, decimals
       FROM deposit_networks
       WHERE moralis_stream_id = $1 AND is_active = true`,
      [streamId]
    );

    if (networkResult.rows.length === 0) {
      // Unknown stream — acknowledge to avoid Moralis retries
      console.warn(`[moralis-webhook] streamId ${streamId} not associated with any network`);
      return res.status(200).json({ message: 'Stream not associated with any network' });
    }

    const { id: networkId, min_confirmations, decimals } = networkResult.rows[0];
    const tokenDecimals = decimals != null ? Number(decimals) : 18;
    const blockNumber = block?.number ? parseInt(block.number, 10) : 0;
    const blockTimestamp = block?.timestamp
      ? new Date(parseInt(block.timestamp, 10) * 1000)
      : new Date();

    for (const transfer of erc20Transfers) {
      try {
        const toAddress: string = transfer.to || '';
        const fromAddress: string = transfer.from || '';
        const txHash: string = transfer.transactionHash || '';

        if (!toAddress || !txHash) {
          console.warn(`[moralis-webhook] missing toAddress or txHash, to=${toAddress}, txHash=${txHash}`);
          continue;
        }

        const effectiveDecimals = transfer.tokenDecimals != null
          ? Number(transfer.tokenDecimals)
          : tokenDecimals;
        const rawValue = BigInt(transfer.value || '0');
        const amount = Number(rawValue) / 10 ** effectiveDecimals;

        // Find user owning this address
        const addrResult = await query(
          `SELECT user_id FROM user_deposit_addresses
           WHERE LOWER(address) = LOWER($1) AND network_id = $2 AND is_active = true`,
          [toAddress, networkId]
        );
        if (addrResult.rows.length === 0) {
          console.warn(`[moralis-webhook] toAddress ${toAddress} not found in network ${networkId}`);
          continue;
        }
        const userId = addrResult.rows[0].user_id;
        console.log(`[moralis-webhook] processing transfer: ${txHash}, to=${toAddress}, amount=${amount}, userId=${userId}`);

        // Moralis confirmed = true means the tx has passed the required confirmations
        await processDeposit(
          userId,
          networkId,
          txHash,
          fromAddress,
          toAddress,
          amount,
          min_confirmations, // treat as fully confirmed
          min_confirmations,
          blockNumber,
          blockTimestamp
        );
      } catch (transferErr: any) {
        console.error('[moralis-webhook] Error processing transfer:', transferErr.message);
        // Continue processing remaining transfers
      }
    }

    // Always return 200 so Moralis does not retry
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Moralis webhook error:', error);
    // Still return 200 to avoid Moralis retry storms
    res.status(200).json({ error: error.message });
  }
});


router.post('/tron', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req, res)) return;

    const { transaction_id, to_address, from_address, value, block_timestamp } = req.body;

    // Validate required fields
    if (!transaction_id || !to_address || !value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find user by deposit address
    const addressResult = await query(
      `SELECT uda.user_id, uda.network_id, dn.min_confirmations, COALESCE(dn.decimals, 6) AS decimals
       FROM user_deposit_addresses uda
       JOIN deposit_networks dn ON uda.network_id = dn.id
       WHERE uda.address = $1 AND uda.is_active = true AND UPPER(dn.chain_name) IN ('TRON','TRC20','TRC')`,
      [to_address]
    );

    if (addressResult.rows.length === 0) {
      // Address not found - this is fine, just not for our system
      return res.status(200).json({ message: 'Address not tracked' });
    }

    const { user_id, network_id, min_confirmations, decimals } = addressResult.rows[0];

    // Convert value from smallest unit using the network's actual decimals.
    // Use BigInt arithmetic to avoid floating-point precision loss on large values.
    const amount = Number(BigInt(value) * 10000n / BigInt(Math.pow(10, decimals))) / 10000;

    // TronGrid webhooks push already-confirmed transactions; treat them as fully confirmed
    await processDeposit(
      user_id,
      network_id,
      transaction_id,
      from_address || '',
      to_address,
      amount,
      min_confirmations, // treat as confirmed — TronGrid only pushes confirmed txns
      min_confirmations,
      0, // block_number not always available in webhook
      new Date(block_timestamp ? block_timestamp * 1000 : Date.now())
    );

    res.json({ success: true, message: 'Deposit processed' });
  } catch (error: any) {
    console.error('Tron webhook error:', error);
    res.status(200).json({ error: error.message });
  }
});

/**
 * POST /webhook/deposit/eth
 * Receives Etherscan webhook notifications
 */
router.post('/eth', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req, res)) return;

    const { hash, to, from, value, blockNumber, timeStamp, confirmations } = req.body;

    // Validate required fields
    if (!hash || !to || !value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find user by deposit address
    const addressResult = await query(
      `SELECT uda.user_id, uda.network_id, dn.min_confirmations, COALESCE(dn.decimals, 18) AS decimals
       FROM user_deposit_addresses uda
       JOIN deposit_networks dn ON uda.network_id = dn.id
       WHERE uda.address = $1 AND uda.is_active = true AND dn.chain_name = 'ETH'`,
      [to]
    );

    if (addressResult.rows.length === 0) {
      return res.status(200).json({ message: 'Address not tracked' });
    }

    const { user_id, network_id, min_confirmations, decimals } = addressResult.rows[0];

    // Convert value from smallest unit using the network's actual decimals
    const amount = parseFloat(value) / Math.pow(10, decimals);

    // Process the deposit
    await processDeposit(
      user_id,
      network_id,
      hash,
      from,
      to,
      amount,
      confirmations || 0,
      min_confirmations,
      parseInt(blockNumber) || 0,
      new Date(timeStamp ? parseInt(timeStamp) * 1000 : Date.now())
    );

    res.json({ success: true, message: 'Deposit processed' });
  } catch (error: any) {
    console.error('ETH webhook error:', error);
    res.status(200).json({ error: error.message });
  }
});

/**
 * POST /webhook/deposit/bsc
 * Receives BscScan webhook notifications
 */
router.post('/bsc', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req, res)) return;

    const { hash, to, from, value, blockNumber, timeStamp, confirmations } = req.body;

    // Validate required fields
    if (!hash || !to || !value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find user by deposit address
    const addressResult = await query(
      `SELECT uda.user_id, uda.network_id, dn.min_confirmations, COALESCE(dn.decimals, 18) AS decimals
       FROM user_deposit_addresses uda
       JOIN deposit_networks dn ON uda.network_id = dn.id
       WHERE uda.address = $1 AND uda.is_active = true AND dn.chain_name = 'BSC'`,
      [to]
    );

    if (addressResult.rows.length === 0) {
      return res.status(200).json({ message: 'Address not tracked' });
    }

    const { user_id, network_id, min_confirmations, decimals } = addressResult.rows[0];

    // Convert value from smallest unit using the network's actual decimals
    const amount = parseFloat(value) / Math.pow(10, decimals);

    // Process the deposit
    await processDeposit(
      user_id,
      network_id,
      hash,
      from,
      to,
      amount,
      confirmations || 0,
      min_confirmations,
      parseInt(blockNumber) || 0,
      new Date(timeStamp ? parseInt(timeStamp) * 1000 : Date.now())
    );

    res.json({ success: true, message: 'Deposit processed' });
  } catch (error: any) {
    console.error('BSC webhook error:', error);
    res.status(200).json({ error: error.message });
  }
});

export default router;
