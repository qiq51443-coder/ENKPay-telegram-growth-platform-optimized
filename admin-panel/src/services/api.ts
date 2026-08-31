import axios, { AxiosInstance } from 'axios';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    const baseURL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001/api';
    this.client = axios.create({
      baseURL,
      timeout: 30000,
    });

    // Add request interceptor for token
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(username: string, password: string) {
    const response = await this.client.post('/auth/login', { username, password });
    return response.data;
  }

  // Admin Users
  async getAdminUsers(page = 1, limit = 10) {
    const response = await this.client.get('/admin/users', { params: { page, limit } });
    return response.data;
  }

  async createAdminUser(data: any) {
    const response = await this.client.post('/admin/users', data);
    return response.data;
  }

  async updateAdminUser(id: string, data: any) {
    const response = await this.client.put(`/admin/users/${id}`, data);
    return response.data;
  }

  async deleteAdminUser(id: string) {
    const response = await this.client.delete(`/admin/users/${id}`);
    return response.data;
  }

  // Wallet Networks
  async getNetworks() {
    const response = await this.client.get('/admin/wallet/networks');
    return response.data;
  }

  async createNetwork(data: any) {
    const response = await this.client.post('/admin/wallet/networks', data);
    return response.data;
  }

  async updateNetwork(id: string, data: any) {
    const response = await this.client.put(`/admin/wallet/networks/${id}`, data);
    return response.data;
  }

  async deleteNetwork(id: string) {
    const response = await this.client.delete(`/admin/wallet/networks/${id}`);
    return response.data;
  }
  // ===== 兼容 WalletNetworks.tsx 使用的方法名 =====
  async getWalletNetworks() {
    return this.getNetworks();
  }

  async createWalletNetwork(data: any) {
    return this.createNetwork(data);
  }

  async updateWalletNetwork(id: string, data: any) {
    return this.updateNetwork(id, data);
  }

  async deleteWalletNetwork(id: string) {
    return this.deleteNetwork(id);
  }

  async updateWalletNetworkBots(id: string, bot_ids: string[]) {
    const response = await this.client.put(`/admin/wallet/networks/${id}/bots`, { bot_ids });
    return response.data;
  }

  async getDepositAddresses(params?: { network_id?: string; user_id?: string; page?: number; limit?: number }) {
    const response = await this.client.get('/admin/wallet/deposit-addresses', { params });
    return response.data;
  }

  async clearNetworkDerivedAddresses(networkId: string | 'all') {
    const response = await this.client.delete(`/admin/wallet/networks/${networkId}/derived-addresses`);
    return response.data;
  }

  async getPlatformConfig(key: string) {
    const response = await this.client.get(`/admin/system-settings/${key}`);
    // 兼容后端可能返回 { value } 或 { data: { value } }
    return response.data?.data ?? response.data;
  }

  async setPlatformConfig(key: string, value: boolean | string | number) {
    const response = await this.client.put(`/admin/system-settings/${key}`, {
      value: String(value),
    });
    return response.data;
  }
  // Stream setup and management
  async setupNetworkStream(id: string, data: { moralis_api_key?: string; trongrid_api_key?: string; webhook_url: string }) {
    const response = await this.client.post(`/admin/wallet/networks/${id}/stream/setup`, data);
    return response.data;
  }

  // New helper: support QuickNode fields (quicknode_api_key, quicknode_webhook_id)
  async setupNetworkStreamWithQuickNode(id: string, data: { quicknode_api_key?: string; quicknode_webhook_id?: string; webhook_url: string }) {
    const response = await this.client.post(`/admin/wallet/networks/${id}/stream/setup`, data);
    return response.data;
  }

  async syncNetworkStream(id: string) {
    const response = await this.client.post(`/admin/wallet/networks/${id}/stream/sync`);
    return response.data;
  }

  async deleteNetworkStream(id: string) {
    const response = await this.client.delete(`/admin/wallet/networks/${id}/stream`);
    return response.data;
  }

  // Deposits
  async getDeposits(page = 1, limit = 10) {
    const response = await this.client.get('/admin/deposits', { params: { page, limit } });
    return response.data;
  }

  // Wallets
  async getWallets(page = 1, limit = 10) {
    const response = await this.client.get('/admin/wallets', { params: { page, limit } });
    return response.data;
  }

  // Bots
  async getBots() {
    const response = await this.client.get('/admin/bots');
    return response.data;
  }

  async createBot(data: any) {
    const response = await this.client.post('/admin/bots', data);
    return response.data;
  }

  async updateBot(id: string, data: any) {
    const response = await this.client.put(`/admin/bots/${id}`, data);
    return response.data;
  }

  async deleteBot(id: string) {
    const response = await this.client.delete(`/admin/bots/${id}`);
    return response.data;
  }

  async resetBotWebhook(id: string) {
    const response = await this.client.post(`/admin/bots/${id}/webhook/reset`);
    return response.data;
  }

  async getBotGroups(botId: string) {
    const response = await this.client.get(`/admin/bots/${botId}/groups`);
    return response.data;
  }

  // Users
  async getUsers(params: any) {
    const response = await this.client.get('/admin/users', { params });
    return response.data;
  }

  async get(endpoint: string, params?: any) {
    const response = await this.client.get(endpoint, { params });
    return response;
  }

  async post(endpoint: string, data?: any) {
    const response = await this.client.post(endpoint, data);
    return response;
  }

  async put(endpoint: string, data?: any) {
    const response = await this.client.put(endpoint, data);
    return response;
  }

  async delete(endpoint: string) {
    const response = await this.client.delete(endpoint);
    return response;
  }

  // Broadcasts
  async getBroadcasts() {
    const response = await this.client.get('/admin/broadcasts');
    return response.data;
  }

  async createBroadcast(data: any) {
    const response = await this.client.post('/admin/broadcasts', data);
    return response.data;
  }

  async sendBroadcast(id: string) {
    const response = await this.client.post(`/admin/broadcasts/${id}/send`);
    return response.data;
  }

  // Red Packets
  async getRedPackets() {
    const response = await this.client.get('/admin/redpackets');
    return response.data;
  }

  async createRedPacket(data: any) {
    const response = await this.client.post('/admin/redpackets', data);
    return response.data;
  }

  async deleteRedPacket(id: string) {
    const response = await this.client.delete(`/admin/redpackets/${id}`);
    return response.data;
  }

  async getRedPacketClaims(id: string) {
    const response = await this.client.get(`/admin/redpackets/${id}/claims`);
    return response.data;
  }

  // NFT Categories
  async getNFTCategories() {
    const response = await this.client.get('/admin/nft/categories');
    return response.data;
  }

  async createNFTCategory(data: any) {
    const response = await this.client.post('/admin/nft/categories', data);
    return response.data;
  }

  async updateNFTCategory(id: string, data: any) {
    const response = await this.client.put(`/admin/nft/categories/${id}`, data);
    return response.data;
  }

  async deleteNFTCategory(id: string) {
    const response = await this.client.delete(`/admin/nft/categories/${id}`);
    return response.data;
  }

  // System Settings
  async updateSystemSetting(key: string, data: any) {
    const response = await this.client.put(`/admin/system-settings/${key}`, data);
    return response.data;
  }

  async getSystemSetting(key: string) {
    const response = await this.client.get(`/admin/system-settings/${key}`);
    return response.data;
  }

  // Trading Pairs
  async getTradingPairs() {
    const response = await this.client.get('/admin/trading/pairs');
    return response.data;
  }

  async getPairsWithOpenPrice() {
    const response = await this.client.get('/admin/trading/pairs/open-price');
    return response.data;
  }

  async getPricePresets(pairId: string) {
    const response = await this.client.get(`/admin/trading/pairs/${pairId}/presets`);
    return response.data;
  }

  async activatePreset(presetId: string) {
    const response = await this.client.post(`/admin/trading/presets/${presetId}/activate`);
    return response.data;
  }

  async setResultMode(pairId: string, data: any) {
    const response = await this.client.post(`/admin/trading/pairs/${pairId}/result-mode`, data);
    return response.data;
  }

  async getTodayResults(pairId: string) {
    const response = await this.client.get(`/admin/trading/pairs/${pairId}/today-results`);
    return response.data;
  }

  async getResultPreview(pairId: string) {
    const response = await this.client.get(`/admin/trading/pairs/${pairId}/result-preview`);
    return response.data;
  }

  // Audit Logs
  async getAuditLogs(params: any) {
    const response = await this.client.get('/admin/audit-logs', { params });
    return response.data;
  }

  async getAuditActions() {
    const response = await this.client.get('/admin/audit-logs/actions');
    return response.data;
  }

  async getAuditResourceTypes() {
    const response = await this.client.get('/admin/audit-logs/resource-types');
    return response.data;
  }

  // Bot Config
  async getBotConfig() {
    const response = await this.client.get('/admin/bot/config');
    return response.data;
  }

  async updateBotConfig(data: any) {
    const response = await this.client.put('/admin/bot/config', data);
    return response.data;
  }
}

const apiClient = new ApiClient();

// Export both as default and named export for compatibility
export { apiClient };
export default apiClient;
