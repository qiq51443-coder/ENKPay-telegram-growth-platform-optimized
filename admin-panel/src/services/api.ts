*** Begin Patch
*** Update File: admin-panel/src/services/api.ts
@@
-  async setupNetworkStream(id: string, data: { moralis_api_key?: string; trongrid_api_key?: string; webhook_url: string }) {
-    const response = await this.client.post(`/admin/wallet/networks/${id}/stream/setup`, data);
-    return response.data;
-  }
+  async setupNetworkStream(id: string, data: { moralis_api_key?: string; trongrid_api_key?: string; webhook_url: string }) {
+    const response = await this.client.post(`/admin/wallet/networks/${id}/stream/setup`, data);
+    return response.data;
+  }
+
+  // New helper: support QuickNode fields (quicknode_api_key, quicknode_webhook_id)
+  async setupNetworkStreamWithQuickNode(id: string, data: { moralis_api_key?: string; quicknode_api_key?: string; quicknode_webhook_id?: string; trongrid_api_key?: string; webhook_url: string }) {
+    const response = await this.client.post(`/admin/wallet/networks/${id}/stream/setup`, data);
+    return response.data;
+  }
*** End Patch