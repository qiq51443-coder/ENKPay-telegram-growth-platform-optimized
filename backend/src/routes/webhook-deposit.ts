import { Router, Request, Response } from 'express';
import { query } from '../db';
import { processDeposit } from '../services/deposit.service';
import { verifyMoralisSignature } from '../services/moralis-stream.service';
import { verifyQuickNodeSignature } from '../services/quicknode.service';

const router = Router();

/**
 * POST /webhook/deposit/moralis
 * Receives Moralis webhook callbacks for ERC20 transfers
 */
router.post('/moralis', async (req, res) => {
  try {
    const moralisSecret = process.env.MORALIS_WEBHOOK_SECRET;
    if (moralisSecret) {
      const signature = req.headers['x-signature'] as string | undefined;
      if (!signature) return res.status(401).json({ error: 'Missing x-signature header' });
      const rawBody = (req as any).rawBody as string | undefined;
      const bodyString = rawBody ?? JSON.stringify(req.body);
      if (!verifyMoralisSignature(bodyString, moralisSecret, signature)) {
        return res.status(401).json({ error: 'Invalid Moralis signature' });
      }
    }
    
    const payload = req.body;
    
    if (payload.logs && Array.isArray(payload.logs)) {
      for (const log of payload.logs) {
        try {
          const txHash = payload.txHash || payload.transactionHash || '';
          const toAddress = log.to || log.address || '';
          const fromAddress = log.from || '';
          const tokenAddress = (log.address || log.tokenAddress || '').toLowerCase();
          const value = log.value || log.data || '0';
          const blockNumber = payload.blockNumber || 0;
          const blockTimestamp = payload.blockTimestamp ? new Date(Number(payload.blockTimestamp) * 1000) : new Date();
          
          // Find network by token address or webhook id
          let networkId: number | null = null;
          let minConfirmations = 1;
          let decimals = 18;
          
          if (tokenAddress) {
            const networkResult = await query(
              `SELECT id, min_confirmations, decimals FROM deposit_networks
               WHERE LOWER(contract_address) = LOWER($1) AND is_active = true LIMIT 1`,
              [tokenAddress]
            );
            if (networkResult.rows.length > 0) {
              networkId = networkResult.rows[0].id;
              minConfirmations = networkResult.rows[0].min_confirmations;
              decimals = networkResult.rows[0].decimals;
            }
          }
          
          if (!networkId) continue;
          
          const amount = Number(BigInt(value || '0')) / 10 ** decimals;
          const confirmations = payload.confirmed ? minConfirmations : 0;
          
          const addrResult = await query(
            `SELECT user_id FROM user_deposit_addresses
             WHERE LOWER(address) = LOWER($1) AND network_id = $2 AND is_active = true`,
            [toAddress, networkId]
          );
          
          if (addrResult.rows.length === 0) continue;
          
          const userId = addrResult.rows[0].user_id;
          
          await processDeposit(
            userId,
            networkId,
            txHash,
            fromAddress,
            toAddress,
            amount,
            confirmations,
            minConfirmations,
            blockNumber,
            blockTimestamp
          );
        } catch (err: any) {
          console.error('[moralis-webhook] Error processing log:', err.message);
        }
      }
    }
    
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Moralis webhook error:', error);
    res.status(200).json({ error: error.message });
  }
});

/**
 * POST /webhook/deposit/quicknode
 * Receives QuickNode webhook callbacks (assumes decoded ERC20 transfer payload).
 * This route is intentionally defensive: QuickNode payload formats may vary.
 * Ensure QuickNode is configured to send a decoded transfer object similar to Moralis
 * (fields: transactionHash, from, to, value, tokenAddress, tokenDecimals, block).
 */
router.post('/quicknode', async (req, res) => {
  try {
    // If you set a QUICKNODE_WEBHOOK_SECRET in your environment and QuickNode sends
    // a signature header, verify it. Adjust header name as per QuickNode docs.
    const quicknodeSecret = process.env.QUICKNODE_WEBHOOK_SECRET;
    if (quicknodeSecret) {
      const signature = req.headers['x-quicknode-signature'] as string | undefined;
      if (!signature) return res.status(401).json({ error: 'Missing x-quicknode-signature header' });
      const rawBody = (req as any).rawBody as string | undefined;
      const bodyString = rawBody ?? JSON.stringify(req.body);
      if (!verifyQuickNodeSignature(bodyString, quicknodeSecret, signature)) {
        return res.status(401).json({ error: 'Invalid QuickNode signature' });
      }
    }
    
    const payload = req.body;
    
    // Try to find transfers in several possible shapes
    const possibleTransfers =
      payload.erc20Transfers || payload.transfers || payload.events || payload.logs || [];
    
    if (!Array.isArray(possibleTransfers) || possibleTransfers.length === 0) {
      console.log('[quicknode-webhook] no transfers in payload');
      return res.status(200).json({ message: 'No transfers to process' });
    }
    
    // Determine network by webhook id or other identifying field if provided
    // This assumes QuickNode includes a webhook id or tag in the payload — if not,
    // you may need to store mapping from incoming host/IP to network id.
    const webhookId = payload.webhookId || payload.webhook_id || payload.tag || null;
    
    // If payload contains chain / network info, you can also attempt to map it.
    
    // We'll attempt to resolve network by webhook_id stored in deposit_networks.webhook_id
    let networkRow: any = null;
    if (webhookId) {
      const networkResult = await query(
        `SELECT id, min_confirmations, decimals, contract_address
         FROM deposit_networks
         WHERE webhook_id = $1 AND is_active = true`,
        [String(webhookId)]
      );
      if (networkResult.rows.length > 0) networkRow = networkResult.rows[0];
    }
    
    // If not found by webhook id, fallback to permissive mode: try to infer by contract_address in networks
    // (only possible if transfer includes tokenAddress)
    
    for (const transfer of possibleTransfers) {
      try {
        const txHash: string = transfer.transactionHash || transfer.hash || transfer.txHash || '';
        const toAddress: string = transfer.to || transfer.to_address || '';
        const fromAddress: string = transfer.from || transfer.from_address || '';
        const tokenAddress: string = (transfer.tokenAddress || transfer.contract || transfer.address || '').toLowerCase();
        const tokenDecimals = transfer.tokenDecimals != null ? Number(transfer.tokenDecimals) : undefined;
        const rawValue = transfer.value || transfer.data || transfer.amount || '0';
        
        if (!txHash || !toAddress) {
          console.warn('[quicknode-webhook] missing txHash or toAddress in transfer, skipping');
          continue;
        }
        
        // Resolve network if not already from webhook id
        let networkId: number | null = null;
        let min_confirmations = 1;
        let decimals = tokenDecimals != null ? tokenDecimals : 18;
        if (networkRow) {
          networkId = networkRow.id;
          min_confirmations = networkRow.min_confirmations;
          if (networkRow.decimals != null) decimals = Number(networkRow.decimals);
        } else if (tokenAddress) {
          const nr = await query(
            `SELECT id, min_confirmations, decimals FROM deposit_networks WHERE LOWER(contract_address) = LOWER($1) AND is_active = true LIMIT 1`,
            [tokenAddress]
          );
          if (nr.rows.length > 0) {
            networkId = nr.rows[0].id;
            min_confirmations = nr.rows[0].min_confirmations;
            if (nr.rows[0].decimals != null) decimals = Number(nr.rows[0].decimals);
          }
        }
        
        if (!networkId) {
          console.warn(`[quicknode-webhook] could not resolve network for transfer ${txHash}, skipping`);
          continue;
        }
        
        const amount = Number(BigInt(rawValue || '0')) / 10 ** decimals;
        
        // Find user by deposit address
        const addrResult = await query(
          `SELECT user_id FROM user_deposit_addresses
           WHERE LOWER(address) = LOWER($1) AND network_id = $2 AND is_active = true`,
          [toAddress, networkId]
        );
        if (addrResult.rows.length === 0) {
          console.warn(`[quicknode-webhook] toAddress ${toAddress} not found in network ${networkId}`);
          continue;
        }
        const userId = addrResult.rows[0].user_id;
        
        console.log(`[quicknode-webhook] processing transfer: ${txHash}, to=${toAddress}, amount=${amount}, userId=${userId}`);
        
        await processDeposit(
          userId,
          networkId,
          txHash,
          fromAddress || '',
          toAddress,
          amount,
          min_confirmations, // treat as confirmed if QuickNode reports confirmed
          min_confirmations,
          transfer.blockNumber || transfer.block?.number || 0,
          transfer.blockTimestamp ? new Date(Number(transfer.blockTimestamp) * 1000) : new Date()
        );
      } catch (err: any) {
        console.error('[quicknode-webhook] Error processing transfer:', err.message);
      }
    }
    
    // Always respond 200 to acknowledge
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('QuickNode webhook error:', error);
    res.status(200).json({ error: error.message });
  }
});

export default router;
