import crypto from 'crypto';
import express from 'express';
import { query } from '../db';
import { processDeposit } from '../services/deposit.service';
import { verifyMoralisSignature } from '../services/moralis-stream.service';
import { verifyQuickNodeSignature } from '../services/quicknode.service';

const router = express.Router();

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

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return false;
  }

  return true;
}

router.post('/moralis', async (req, res) => {
  try {
    const moralisSecret = process.env.MORALIS_STREAMS_SECRET;
    if (moralisSecret) {
      const signature = req.headers['x-moralis-signature'] as string | undefined;
      if (!signature) {
        return res.status(401).json({ error: 'Missing x-moralis-signature header' });
      }
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

    if (!confirmed) {
      console.log('[moralis-webhook] unconfirmed transaction, skipping');
      return res.status(200).json({ message: 'Unconfirmed transaction ignored' });
    }

    if (!streamId || !Array.isArray(erc20Transfers) || erc20Transfers.length === 0) {
      console.log(`[moralis-webhook] no erc20Transfers in payload, streamId=${streamId}, confirmed=${confirmed}`);
      return res.status(200).json({ message: 'No transfers to process' });
    }

    const networkResult = await query(
      `SELECT id, min_confirmations, decimals, contract_address
       FROM deposit_networks
       WHERE moralis_stream_id = $1 AND is_active = true`,
      [streamId]
    );

    if (networkResult.rows.length === 0) {
      console.warn(`[moralis-webhook] streamId ${streamId} not associated with any network`);
      return res.status(200).json({ message: 'Stream not associated with any network' });
    }

    const { id: networkId, min_confirmations, decimals, contract_address } = networkResult.rows[0];
    const expectedTokenAddress = typeof contract_address === 'string'
      ? contract_address.trim().toLowerCase()
      : '';

    if (!expectedTokenAddress) {
      console.warn(
        `[moralis-webhook] network ${networkId} has no contract_address configured — falling back to permissive mode`
      );
    }

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
        const tokenAddress: string = typeof transfer.tokenAddress === 'string'
          ? transfer.tokenAddress.trim().toLowerCase()
          : '';

        if (!toAddress || !txHash) {
          continue;
        }

        if (expectedTokenAddress && tokenAddress !== expectedTokenAddress) {
          continue;
        }

        const effectiveDecimals = transfer.tokenDecimals != null
          ? Number(transfer.tokenDecimals)
          : tokenDecimals;
        const rawValue = BigInt(transfer.value || '0');
        const amount = Number(rawValue) / 10 ** effectiveDecimals;

        const addrResult = await query(
          `SELECT user_id FROM user_deposit_addresses
           WHERE LOWER(address) = LOWER($1) AND network_id = $2 AND is_active = true`,
          [toAddress, networkId]
        );
        if (addrResult.rows.length === 0) {
          continue;
        }
        const userId = addrResult.rows[0].user_id;

        await processDeposit(
          userId,
          networkId,
          txHash,
          fromAddress,
          toAddress,
          amount,
          min_confirmations,
          min_confirmations,
          blockNumber,
          blockTimestamp
        );
      } catch (transferErr: any) {
        console.error('[moralis-webhook] Error processing transfer:', transferErr.message);
      }
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Moralis webhook error:', error);
    res.status(200).json({ error: error.message });
  }
});

router.post('/tron', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req, res)) return;

    const { transaction_id, to_address, from_address, value, block_timestamp } = req.body;

    if (!transaction_id || !to_address || !value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const addressResult = await query(
      `SELECT uda.user_id, uda.network_id, dn.min_confirmations, COALESCE(dn.decimals, 6) AS decimals
       FROM user_deposit_addresses uda
       JOIN deposit_networks dn ON uda.network_id = dn.id
       WHERE uda.address = $1 AND uda.is_active = true AND UPPER(dn.chain_name) IN ('TRON','TRC20','TRC')`,
      [to_address]
    );

    if (addressResult.rows.length === 0) {
      return res.status(200).json({ message: 'Address not tracked' });
    }

    const { user_id, network_id, min_confirmations, decimals } = addressResult.rows[0];
    const amount = Number(BigInt(value) * 10000n / BigInt(Math.pow(10, decimals))) / 10000;

    await processDeposit(
      user_id,
      network_id,
      transaction_id,
      from_address || '',
      to_address,
      amount,
      min_confirmations,
      min_confirmations,
      0,
      new Date(block_timestamp ? block_timestamp * 1000 : Date.now())
    );

    res.json({ success: true, message: 'Deposit processed' });
  } catch (error: any) {
    console.error('Tron webhook error:', error);
    res.status(200).json({ error: error.message });
  }
});

router.post('/eth', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req, res)) return;

    const { hash, to, from, value, blockNumber, timeStamp, confirmations } = req.body;

    if (!hash || !to || !value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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
    const amount = parseFloat(value) / Math.pow(10, decimals);

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

router.post('/bsc', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req, res)) return;

    const { hash, to, from, value, blockNumber, timeStamp, confirmations } = req.body;

    if (!hash || !to || !value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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
    const amount = parseFloat(value) / Math.pow(10, decimals);

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

/**
 * POST /webhook/deposit/quicknode
 * QuickNode Streams destination. Filter ERC20 Transfer for your token in Stream;
 * this handler matches `to` against user_deposit_addresses.
 */
router.post('/quicknode', async (req, res) => {
  try {
    const secret = process.env.QUICKNODE_STREAM_SECURITY_TOKEN || process.env.QUICKNODE_WEBHOOK_SECRET;
    if (secret) {
      const signature = (req.headers['x-qn-signature'] || req.headers['x-quicknode-signature']) as string | undefined;
      const nonce = req.headers['x-qn-nonce'] as string | undefined;
      const timestamp = req.headers['x-qn-timestamp'] as string | undefined;
      const rawBody = (req as any).rawBody as string | undefined;
      const bodyString = rawBody ?? JSON.stringify(req.body);
      if (!verifyQuickNodeSignature(bodyString, secret, signature, nonce, timestamp)) {
        return res.status(401).json({ error: 'Invalid QuickNode signature' });
      }
    } else {
      console.warn('[quicknode-webhook] QUICKNODE_STREAM_SECURITY_TOKEN not set — signature verification disabled');
    }

    const payload = req.body;
    let transfers: any[] = [];
    if (Array.isArray(payload)) {
      transfers = payload;
    } else if (Array.isArray(payload?.data)) {
      transfers = payload.data;
    } else {
      transfers = payload.erc20Transfers || payload.transfers || payload.events || [];
      if (!transfers.length && Array.isArray(payload.logs)) {
        const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        for (const log of payload.logs) {
          const topics = log.topics || [];
          if (topics[0] === TRANSFER_TOPIC && topics.length >= 3) {
            transfers.push({
              tokenAddress: log.address,
              from: '0x' + String(topics[1]).slice(-40),
              to: '0x' + String(topics[2]).slice(-40),
              value: log.data,
              transactionHash: log.transactionHash || payload.transactionHash || payload.txHash,
              blockNumber: log.blockNumber || payload.blockNumber,
            });
          }
        }
      }
    }

    if (!transfers.length) {
      console.log('[quicknode-webhook] no transfers in payload');
      return res.status(200).json({ message: 'No transfers to process' });
    }

    for (const transfer of transfers) {
      try {
        const txHash: string = transfer.transactionHash || transfer.hash || transfer.txHash || '';
        const toAddress: string = transfer.to || transfer.to_address || '';
        const fromAddress: string = transfer.from || transfer.from_address || '';
        const tokenAddress: string = (transfer.tokenAddress || transfer.contract || transfer.address || '').toLowerCase();
        const rawValue = transfer.value || transfer.amount || '0';

        if (!txHash || !toAddress) continue;

        let networkId: number | null = null;
        let min_confirmations = 1;
        let decimals = transfer.tokenDecimals != null ? Number(transfer.tokenDecimals) : 18;

        if (tokenAddress) {
          const nr = await query(
            `SELECT id, min_confirmations, decimals FROM deposit_networks
             WHERE LOWER(contract_address) = LOWER($1) AND is_active = true LIMIT 1`,
            [tokenAddress]
          );
          if (nr.rows.length > 0) {
            networkId = nr.rows[0].id;
            min_confirmations = nr.rows[0].min_confirmations;
            if (nr.rows[0].decimals != null) decimals = Number(nr.rows[0].decimals);
          }
        }

        if (!networkId) {
          const addrOnly = await query(
            `SELECT uda.user_id, uda.network_id, dn.min_confirmations, COALESCE(dn.decimals, 18) AS decimals
             FROM user_deposit_addresses uda
             JOIN deposit_networks dn ON uda.network_id = dn.id
             WHERE LOWER(uda.address) = LOWER($1) AND uda.is_active = true AND dn.is_active = true
             LIMIT 1`,
            [toAddress]
          );
          if (addrOnly.rows.length === 0) continue;
          const row = addrOnly.rows[0];
          const amount = Number(BigInt(rawValue || '0')) / 10 ** Number(row.decimals);
          await processDeposit(
            row.user_id,
            row.network_id,
            txHash,
            fromAddress || '',
            toAddress,
            amount,
            row.min_confirmations,
            row.min_confirmations,
            Number(transfer.blockNumber || 0),
            transfer.blockTimestamp ? new Date(Number(transfer.blockTimestamp) * 1000) : new Date()
          );
          continue;
        }

        const addrResult = await query(
          `SELECT user_id FROM user_deposit_addresses
           WHERE LOWER(address) = LOWER($1) AND network_id = $2 AND is_active = true`,
          [toAddress, networkId]
        );
        if (addrResult.rows.length === 0) continue;

        const amount = Number(BigInt(rawValue || '0')) / 10 ** decimals;
        const userId = addrResult.rows[0].user_id;
        console.log(`[quicknode-webhook] ${txHash} to=${toAddress} amount=${amount} user=${userId}`);

        await processDeposit(
          userId,
          networkId,
          txHash,
          fromAddress || '',
          toAddress,
          amount,
          min_confirmations,
          min_confirmations,
          Number(transfer.blockNumber || 0),
          transfer.blockTimestamp ? new Date(Number(transfer.blockTimestamp) * 1000) : new Date()
        );
      } catch (err: any) {
        console.error('[quicknode-webhook] transfer error:', err.message);
      }
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('QuickNode webhook error:', error);
    res.status(200).json({ error: error.message });
  }
});

export default router;
