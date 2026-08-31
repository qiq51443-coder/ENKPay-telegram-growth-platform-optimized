import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { createMoralisStream, addAddressToStream, deleteStream } from '../services/moralis-stream.service';
import {
  createQuickNodeWebhook,
  addAddressToQuickNodeWebhook,
  deleteQuickNodeWebhook,
} from '../services/quicknode.service';
import { encrypt, decrypt } from '../utils/encryption';
import { MORALIS_CHAIN_IDS } from '../constants';
import { resolveChainType } from '../utils/chain';

const router = Router();

// GET /admin/wallet/networks - List all networks
router.get('/networks', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM deposit_networks ORDER BY created_at DESC');
    res.json({ networks: result.rows });
  } catch (error: any) {
    console.error('Error fetching networks:', error);
    res.status(500).json({ error: 'Failed to fetch networks' });
  }
});

// POST /admin/wallet/networks - Create new network
router.post('/networks', authenticate, async (req: Request, res: Response) => {
  try {
    const { network_name, network_display, chain_name, master_address, min_deposit_amount, contract_address, decimals } = req.body;
    
    const result = await query(
      `INSERT INTO deposit_networks
       (network_name, network_display, chain_name, master_address, min_deposit_amount, contract_address, decimals, listener_mode, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'polling', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [network_name, network_display, chain_name, master_address, min_deposit_amount || 0, contract_address || null, decimals || 18]
    );
    
    res.json({ success: true, network: result.rows[0] });
  } catch (error: any) {
    console.error('Error creating network:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /admin/wallet/networks/:id - Update network
router.put('/networks/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { network_name, network_display, min_deposit_amount, contract_address, decimals } = req.body;
    
    const result = await query(
      `UPDATE deposit_networks
       SET network_name = $1, network_display = $2, min_deposit_amount = $3, contract_address = $4, decimals = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [network_name, network_display, min_deposit_amount, contract_address, decimals, id]
    );
    
    res.json({ success: true, network: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating network:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /admin/wallet/networks/:id - Delete network
router.delete('/networks/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await query('DELETE FROM deposit_networks WHERE id = $1', [id]);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting network:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/wallet/networks/:id/stream/setup - Setup stream listener
router.post('/networks/:id/stream/setup', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { moralis_api_key, trongrid_api_key, webhook_url, quicknode_api_key, quicknode_webhook_id } = req.body;
    
    const networkResult = await query('SELECT * FROM deposit_networks WHERE id = $1', [id]);
    if (networkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Network not found' });
    }
    
    const network = networkResult.rows[0];
    const chainType = resolveChainType(network.chain_name);
    
    if (chainType !== 'TRON') {
      // EVM chain — support either Moralis or QuickNode. Admin may provide either provider's api key
      // For QuickNode you may provide quicknode_api_key and optionally quicknode_webhook_id
      if (quicknode_api_key) {
        // Prefer QuickNode when quicknode_api_key is provided
        let webhookInfo: { id: string; secret?: string } | null = null;
        if (quicknode_webhook_id) {
          // Admin already created webhook on QuickNode side and provided its id — we just store it
          webhookInfo = { id: quicknode_webhook_id };
        } else {
          // Try to create via API
          try {
            webhookInfo = await createQuickNodeWebhook(
              quicknode_api_key,
              webhook_url,
              `${network.network_name}-deposit`,
              [chainType],
              network.contract_address || undefined
            );
          } catch (err: any) {
            return res.status(500).json({ error: `QuickNode webhook creation failed: ${err.message}` });
          }
        }
        
        const encryptedApiKey = encrypt(quicknode_api_key);
        
        await query(
          `UPDATE deposit_networks
           SET listener_mode = 'stream',
               webhook_provider = 'quicknode',
               webhook_id = $1,
               webhook_api_key_encrypted = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [webhookInfo.id, encryptedApiKey, id]
        );
        
        // Sync all existing active addresses to the new QuickNode webhook (if QuickNode supports address sync)
        const addressesResult = await query(
          `SELECT address FROM user_deposit_addresses WHERE network_id = $1 AND is_active = true`,
          [id]
        );
        const syncErrors: string[] = [];
        for (const row of addressesResult.rows) {
          try {
            await addAddressToQuickNodeWebhook(quicknode_api_key, webhookInfo.id, row.address);
          } catch (err: any) {
            syncErrors.push(row.address);
            console.error(`Failed to add address ${row.address} to QuickNode webhook:`, err.message);
          }
        }
        
        return res.json({
          success: true,
          message: `QuickNode webhook configured (${webhookInfo.id}). Synced ${addressesResult.rows.length - syncErrors.length}/${addressesResult.rows.length} addresses.`,
          webhook_id: webhookInfo.id,
          sync_errors: syncErrors.length > 0 ? syncErrors : undefined,
        });
      }
      
      // Fallback to Moralis if moralis_api_key provided
      if (!moralis_api_key) {
        return res.status(400).json({ error: 'Either moralis_api_key or quicknode_api_key is required for EVM chains' });
      }
      
      const moralisChain = MORALIS_CHAIN_IDS[chainType] || '0x1';
      
      const { id: streamId } = await createMoralisStream(
        moralis_api_key,
        webhook_url,
        `${network.network_name}-deposit`,
        [moralisChain],
        network.contract_address || undefined
      );
      
      const encryptedApiKey = encrypt(moralis_api_key);
      
      await query(
        `UPDATE deposit_networks
         SET listener_mode = 'stream',
             webhook_provider = 'moralis',
             moralis_stream_id = $1,
             webhook_api_key_encrypted = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [streamId, encryptedApiKey, id]
      );
      
      // Sync all existing active addresses to the new stream
      const addressesResult = await query(
        `SELECT address FROM user_deposit_addresses WHERE network_id = $1 AND is_active = true`,
        [id]
      );
      const syncErrors: string[] = [];
      for (const row of addressesResult.rows) {
        try {
          await addAddressToStream(moralis_api_key, streamId, row.address);
        } catch (err: any) {
          syncErrors.push(row.address);
          console.error(`Failed to add address ${row.address} to Moralis Stream:`, err.message);
        }
      }
      
      return res.json({
        success: true,
        message: `Moralis Stream created (${streamId}). Synced ${addressesResult.rows.length - syncErrors.length}/${addressesResult.rows.length} addresses.`,
        stream_id: streamId,
        sync_errors: syncErrors.length > 0 ? syncErrors : undefined,
      });
    } else {
      // TRON chain
      if (!trongrid_api_key) {
        return res.status(400).json({ error: 'trongrid_api_key is required for TRON' });
      }
      
      const encryptedApiKey = encrypt(trongrid_api_key);
      
      await query(
        `UPDATE deposit_networks
         SET listener_mode = 'stream',
             webhook_provider = 'trongrid',
             webhook_api_key_encrypted = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [encryptedApiKey, id]
      );
      
      return res.json({
        success: true,
        message: 'TronGrid stream configured',
      });
    }
  } catch (error: any) {
    console.error('Error setting up stream:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /admin/wallet/networks/:id/stream/sync - Sync stream
router.post('/networks/:id/stream/sync', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const networkResult = await query(
      `SELECT id, chain_name, moralis_stream_id, webhook_id, webhook_provider, webhook_api_key_encrypted, listener_mode
       FROM deposit_networks WHERE id = $1`,
      [id]
    );
    if (networkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Network not found' });
    }
    
    const network = networkResult.rows[0];
    
    if (!network.webhook_id || !network.webhook_api_key_encrypted || !network.webhook_provider) {
      return res.status(400).json({ error: 'Stream not configured. Please run setup first.' });
    }
    
    const apiKey = decrypt(network.webhook_api_key_encrypted);
    
    const addressesResult = await query(
      `SELECT address FROM user_deposit_addresses WHERE network_id = $1 AND is_active = true`,
      [id]
    );
    
    const syncErrors: string[] = [];
    for (const row of addressesResult.rows) {
      try {
        if (network.webhook_provider === 'quicknode') {
          await addAddressToQuickNodeWebhook(apiKey, network.webhook_id, row.address);
        } else {
          // default to moralis
          await addAddressToStream(apiKey, network.moralis_stream_id || network.webhook_id, row.address);
        }
      } catch (err: any) {
        syncErrors.push(row.address);
        console.error(`Failed to sync address ${row.address}:`, err.message);
      }
    }
    
    res.json({
      message: `Synced ${addressesResult.rows.length - syncErrors.length}/${addressesResult.rows.length} addresses`,
      sync_errors: syncErrors.length > 0 ? syncErrors : undefined,
    });
  } catch (error: any) {
    console.error('Error syncing stream:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /admin/wallet/networks/:id/stream - Delete stream
router.delete('/networks/:id/stream', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const networkResult = await query(
      `SELECT id, chain_name, moralis_stream_id, webhook_id, webhook_provider, webhook_api_key_encrypted, listener_mode
       FROM deposit_networks WHERE id = $1`,
      [id]
    );
    if (networkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Network not found' });
    }
    
    const network = networkResult.rows[0];
    const chainType = resolveChainType(network.chain_name);
    
    if (chainType !== 'TRON' && network.webhook_id && network.webhook_api_key_encrypted && network.webhook_provider) {
      try {
        const apiKey = decrypt(network.webhook_api_key_encrypted);
        if (network.webhook_provider === 'quicknode') {
          await deleteQuickNodeWebhook(apiKey, network.webhook_id);
        } else {
          // default to moralis
          await deleteStream(apiKey, network.moralis_stream_id || network.webhook_id);
        }
      } catch (err: any) {
        console.error('Failed to delete upstream Stream/Webhook (continuing):', err.message);
      }
    }
    
    await query(
      `UPDATE deposit_networks
       SET listener_mode = 'polling',
           moralis_stream_id = NULL,
           webhook_id = NULL,
           webhook_provider = NULL,
           webhook_api_key_encrypted = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
    
    res.json({ success: true, message: 'Stream deleted' });
  } catch (error: any) {
    console.error('Error deleting stream:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
