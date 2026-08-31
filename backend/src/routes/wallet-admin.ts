@@
-import { createMoralisStream, addAddressToStream, deleteStream } from '../services/moralis-stream.service';
+import { createMoralisStream, addAddressToStream, deleteStream } from '../services/moralis-stream.service';
+import {
+  createQuickNodeWebhook,
+  addAddressToQuickNodeWebhook,
+  deleteQuickNodeWebhook,
+} from '../services/quicknode.service';
@@
-    if (chainType !== 'TRON') {
-      // EVM chain — use Moralis Streams
-      if (!moralis_api_key) {
-        return res.status(400).json({ error: 'moralis_api_key is required for EVM chains' });
-      }
-
-      const moralisChain = MORALIS_CHAIN_IDS[chainType] || '0x1';
-
-      const { id: streamId } = await createMoralisStream(
-        moralis_api_key,
-        webhook_url,
-        `${network.network_name}-deposit`,
-        [moralisChain],
-        network.contract_address || undefined
-      );
-
-      const encryptedApiKey = encrypt(moralis_api_key);
-
-      await query(
-        `UPDATE deposit_networks
-         SET listener_mode = 'stream',
-             moralis_stream_id = $1,
-             webhook_api_key_encrypted = $2,
-             updated_at = CURRENT_TIMESTAMP
-         WHERE id = $3`,
-        [streamId, encryptedApiKey, id]
-      );
-
-      // Sync all existing active addresses to the new stream
-      const addressesResult = await query(
-        `SELECT address FROM user_deposit_addresses WHERE network_id = $1 AND is_active = true`,
-        [id]
-      );
-      const syncErrors: string[] = [];
-      for (const row of addressesResult.rows) {
-        try {
-          await addAddressToStream(moralis_api_key, streamId, row.address);
-        } catch (err: any) {
-          syncErrors.push(row.address);
-          console.error(`Failed to add address ${row.address} to Moralis Stream:`, err.message);
-        }
-      }
-
-      return res.json({
-        success: true,
-        message: `Moralis Stream created (${streamId}). Synced ${addressesResult.rows.length - syncErrors.length}/${addressesResult.rows.length} addresses.`,
-        stream_id: streamId,
-        sync_errors: syncErrors.length > 0 ? syncErrors : undefined,
-      });
-    } else {
+    if (chainType !== 'TRON') {
+      // EVM chain — support either Moralis or QuickNode. Admin may provide either provider's api key
+      // For QuickNode you may provide quicknode_api_key and optionally quicknode_webhook_id
+      const { quicknode_api_key, quicknode_webhook_id } = req.body;
+
+      if (quicknode_api_key) {
+        // Prefer QuickNode when quicknode_api_key is provided
+        let webhookInfo: { id: string; secret?: string } | null = null;
+        if (quicknode_webhook_id) {
+          // Admin already created webhook on QuickNode side and provided its id — we just store it
+          webhookInfo = { id: quicknode_webhook_id };
+        } else {
+          // Try to create via API
+          try {
+            webhookInfo = await createQuickNodeWebhook(
+              quicknode_api_key,
+              webhook_url,
+              `${network.network_name}-deposit`,
+              [chainType],
+              network.contract_address || undefined
+            );
+          } catch (err: any) {
+            return res.status(500).json({ error: `QuickNode webhook creation failed: ${err.message}` });
+          }
+        }
+
+        const encryptedApiKey = encrypt(quicknode_api_key);
+
+        await query(
+          `UPDATE deposit_networks
+           SET listener_mode = 'stream',
+               webhook_provider = 'quicknode',
+               webhook_id = $1,
+               webhook_api_key_encrypted = $2,
+               updated_at = CURRENT_TIMESTAMP
+           WHERE id = $3`,
+          [webhookInfo.id, encryptedApiKey, id]
+        );
+
+        // Sync all existing active addresses to the new QuickNode webhook (if QuickNode supports address sync)
+        const addressesResult = await query(
+          `SELECT address FROM user_deposit_addresses WHERE network_id = $1 AND is_active = true`,
+          [id]
+        );
+        const syncErrors: string[] = [];
+        for (const row of addressesResult.rows) {
+          try {
+            await addAddressToQuickNodeWebhook(quicknode_api_key, webhookInfo.id, row.address);
+          } catch (err: any) {
+            syncErrors.push(row.address);
+            console.error(`Failed to add address ${row.address} to QuickNode webhook:`, err.message);
+          }
+        }
+
+        return res.json({
+          success: true,
+          message: `QuickNode webhook configured (${webhookInfo.id}). Synced ${addressesResult.rows.length - syncErrors.length}/${addressesResult.rows.length} addresses.`,
+          webhook_id: webhookInfo.id,
+          sync_errors: syncErrors.length > 0 ? syncErrors : undefined,
+        });
+      }
+
+      // Fallback to Moralis if moralis_api_key provided
+      if (!moralis_api_key) {
+        return res.status(400).json({ error: 'Either moralis_api_key or quicknode_api_key is required for EVM chains' });
+      }
+
+      const moralisChain = MORALIS_CHAIN_IDS[chainType] || '0x1';
+
+      const { id: streamId } = await createMoralisStream(
+        moralis_api_key,
+        webhook_url,
+        `${network.network_name}-deposit`,
+        [moralisChain],
+        network.contract_address || undefined
+      );
+
+      const encryptedApiKey = encrypt(moralis_api_key);
+
+      await query(
+        `UPDATE deposit_networks
+         SET listener_mode = 'stream',
+             webhook_provider = 'moralis',
+             moralis_stream_id = $1,
+             webhook_api_key_encrypted = $2,
+             updated_at = CURRENT_TIMESTAMP
+         WHERE id = $3`,
+        [streamId, encryptedApiKey, id]
+      );
+
+      // Sync all existing active addresses to the new stream
+      const addressesResult = await query(
+        `SELECT address FROM user_deposit_addresses WHERE network_id = $1 AND is_active = true`,
+        [id]
+      );
+      const syncErrors: string[] = [];
+      for (const row of addressesResult.rows) {
+        try {
+          await addAddressToStream(moralis_api_key, streamId, row.address);
+        } catch (err: any) {
+          syncErrors.push(row.address);
+          console.error(`Failed to add address ${row.address} to Moralis Stream:`, err.message);
+        }
+      }
+
+      return res.json({
+        success: true,
+        message: `Moralis Stream created (${streamId}). Synced ${addressesResult.rows.length - syncErrors.length}/${addressesResult.rows.length} addresses.`,
+        stream_id: streamId,
+        sync_errors: syncErrors.length > 0 ? syncErrors : undefined,
+      });
+    } else {
@@
-    const networkResult = await query(
-      `SELECT id, chain_name, moralis_stream_id, webhook_api_key_encrypted, listener_mode
-       FROM deposit_networks WHERE id = $1`,
-      [id]
-    );
+    const networkResult = await query(
+      `SELECT id, chain_name, moralis_stream_id, webhook_id, webhook_provider, webhook_api_key_encrypted, listener_mode
+       FROM deposit_networks WHERE id = $1`,
+      [id]
+    );
@@
-    if (!network.moralis_stream_id || !network.webhook_api_key_encrypted) {
-      return res.status(400).json({ error: 'Moralis stream not configured. Please run setup first.' });
-    }
-
-    const apiKey = decrypt(network.webhook_api_key_encrypted);
+    if (!network.webhook_id || !network.webhook_api_key_encrypted || !network.webhook_provider) {
+      return res.status(400).json({ error: 'Stream not configured. Please run setup first.' });
+    }
+
+    const apiKey = decrypt(network.webhook_api_key_encrypted);
@@
-    for (const row of addressesResult.rows) {
-      try {
-        await addAddressToStream(apiKey, network.moralis_stream_id, row.address);
-      } catch (err: any) {
-        syncErrors.push(row.address);
-        console.error(`Failed to sync address ${row.address}:`, err.message);
-      }
-    }
+    for (const row of addressesResult.rows) {
+      try {
+        if (network.webhook_provider === 'quicknode') {
+          await addAddressToQuickNodeWebhook(apiKey, network.webhook_id, row.address);
+        } else {
+          // default to moralis
+          await addAddressToStream(apiKey, network.moralis_stream_id || network.webhook_id, row.address);
+        }
+      } catch (err: any) {
+        syncErrors.push(row.address);
+        console.error(`Failed to sync address ${row.address}:`, err.message);
+      }
+    }
@@
-    const networkResult = await query(
-      `SELECT id, chain_name, moralis_stream_id, webhook_api_key_encrypted, listener_mode
-       FROM deposit_networks WHERE id = $1`,
-      [id]
-    );
+    const networkResult = await query(
+      `SELECT id, chain_name, moralis_stream_id, webhook_id, webhook_provider, webhook_api_key_encrypted, listener_mode
+       FROM deposit_networks WHERE id = $1`,
+      [id]
+    );
@@
-    if (chainType !== 'TRON' && network.moralis_stream_id && network.webhook_api_key_encrypted) {
-      try {
-        const apiKey = decrypt(network.webhook_api_key_encrypted);
-        await deleteStream(apiKey, network.moralis_stream_id);
-      } catch (err: any) {
-        console.error('Failed to delete Moralis Stream (continuing):', err.message);
-      }
-    }
+    if (chainType !== 'TRON' && network.webhook_id && network.webhook_api_key_encrypted && network.webhook_provider) {
+      try {
+        const apiKey = decrypt(network.webhook_api_key_encrypted);
+        if (network.webhook_provider === 'quicknode') {
+          await deleteQuickNodeWebhook(apiKey, network.webhook_id);
+        } else {
+          // default to moralis
+          await deleteStream(apiKey, network.moralis_stream_id || network.webhook_id);
+        }
+      } catch (err: any) {
+        console.error('Failed to delete upstream Stream/Webhook (continuing):', err.message);
+      }
+    }
@@
-    await query(
-      `UPDATE deposit_networks
-       SET listener_mode = 'polling',
-           moralis_stream_id = NULL,
-           webhook_api_key_encrypted = NULL,
-           updated_at = CURRENT_TIMESTAMP
-       WHERE id = $1`,
-      [id]
-    );
+    await query(
+      `UPDATE deposit_networks
+       SET listener_mode = 'polling',
+           moralis_stream_id = NULL,
+           webhook_id = NULL,
+           webhook_provider = NULL,
+           webhook_api_key_encrypted = NULL,
+           updated_at = CURRENT_TIMESTAMP
+       WHERE id = $1`,
+      [id]
+    );
