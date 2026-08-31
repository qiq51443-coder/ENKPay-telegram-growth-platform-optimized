@@
   try {
     const streamInfoResult = await query(
-      `SELECT listener_mode, moralis_stream_id, webhook_api_key_encrypted, chain_name
-       FROM deposit_networks WHERE id = $1`,
+      `SELECT listener_mode, moralis_stream_id, webhook_id, webhook_provider, webhook_api_key_encrypted, chain_name
+       FROM deposit_networks WHERE id = $1`,
       [networkId]
     );
     const streamInfo = streamInfoResult.rows[0];
     if (
       streamInfo?.listener_mode === 'stream' &&
-      streamInfo?.moralis_stream_id &&
-      streamInfo?.webhook_api_key_encrypted
+      streamInfo?.webhook_id &&
+      streamInfo?.webhook_api_key_encrypted &&
+      streamInfo?.webhook_provider
     ) {
       const chainType = resolveChainType(streamInfo.chain_name);
       if (chainType !== 'TRON') {
-        const apiKey = decrypt(streamInfo.webhook_api_key_encrypted);
-        addAddressToStream(apiKey, streamInfo.moralis_stream_id, address).catch((err: any) =>
-          console.error('Failed to add address to Moralis Stream:', err.message)
-        );
+        const apiKey = decrypt(streamInfo.webhook_api_key_encrypted);
+        if (streamInfo.webhook_provider === 'quicknode') {
+          addAddressToQuickNodeWebhook(apiKey, streamInfo.webhook_id, address).catch((err: any) =>
+            console.error('Failed to add address to QuickNode webhook:', err.message)
+          );
+        } else {
+          addAddressToStream(apiKey, streamInfo.moralis_stream_id || streamInfo.webhook_id, address).catch((err: any) =>
+            console.error('Failed to add address to Moralis Stream:', err.message)
+          );
+        }
       }
     }
   } catch (streamErr: any) {
     console.error('Failed to check stream mode for new address sync:', streamErr.message);
   }
