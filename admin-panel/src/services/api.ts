import axios, { AxiosInstance, AxiosError } from 'axios';
import { LoginResponse } from './types';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/login', {
      username,
      password,
    });
    return response.data;
  }

  // Users
  async getUsers(params?: any) {
    const response = await this.client.get('/users', { params });
    return response.data;
  }

  async getUser(id: string) {
    const response = await this.client.get(`/users/${id}`);
    return response.data;
  }

  async updateUser(id: string, data: any) {
    const response = await this.client.put(`/users/${id}`, data);
    return response.data;
  }

  async getUserTransactions(id: string, params?: any) {
    const response = await this.client.get(`/users/${id}/transactions`, { params });
    return response.data;
  }

  async getUserStats() {
    const response = await this.client.get('/users/stats/overview');
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

  async updateBotStatus(id: string, is_active: boolean) {
    const response = await this.client.patch(`/admin/bots/${id}/status`, { is_active });
    return response.data;
  }

  async resetBotWebhook(id: string) {
    const response = await this.client.post(`/admin/bots/${id}/reset-webhook`);
    return response.data;
  }

  // Bindings
  async getBindings(params?: any) {
    const response = await this.client.get('/bindings', { params });
    return response.data;
  }

  async reviewBinding(id: string, data: { status: string; admin_note?: string }) {
    const response = await this.client.put(`/bindings/${id}/review`, data);
    return response.data;
  }

  // Red Packets
  async getRedPackets(params?: any) {
    const response = await this.client.get('/redpackets', { params });
    return response.data;
  }

  async getRedPacket(id: string) {
    const response = await this.client.get(`/redpackets/${id}`);
    return response.data;
  }

  async createRedPacket(data: any) {
    const response = await this.client.post('/redpackets', data);
    return response.data;
  }

  async getRedPacketClaims(id: string) {
    const response = await this.client.get(`/redpackets/${id}/claims`);
    return response.data;
  }

  // Screenshots
  async getScreenshots(params?: any) {
    const response = await this.client.get('/screenshots', { params });
    return response.data;
  }

  async reviewScreenshot(id: string, data: { status: string; admin_note?: string }) {
    const response = await this.client.put(`/screenshots/${id}/review`, data);
    return response.data;
  }

  // Broadcasts
  async getBroadcasts(params?: any) {
    const response = await this.client.get('/broadcasts', { params });
    return response.data;
  }

  async createBroadcast(data: any) {
    const response = await this.client.post('/broadcasts', data);
    return response.data;
  }

  async sendBroadcast(id: string) {
    const response = await this.client.post(`/broadcasts/${id}/send`);
    return response.data;
  }

  async deleteBroadcast(id: string) {
    const response = await this.client.delete(`/broadcasts/${id}`);
    return response.data;
  }

  // Exchanges
  async getExchanges() {
    const response = await this.client.get('/exchanges');
    return response.data;
  }

  async getExchange(id: string) {
    const response = await this.client.get(`/exchanges/${id}`);
    return response.data;
  }

  async createExchange(data: any) {
    const response = await this.client.post('/exchanges', data);
    return response.data;
  }

  async updateExchange(id: string, data: any) {
    const response = await this.client.put(`/exchanges/${id}`, data);
    return response.data;
  }

  async deleteExchange(id: string) {
    const response = await this.client.delete(`/exchanges/${id}`);
    return response.data;
  }

  // Tutorials
  async getTutorials(params?: any) {
    const response = await this.client.get('/tutorials', { params });
    return response.data;
  }

  async getTutorial(id: string) {
    const response = await this.client.get(`/tutorials/${id}`);
    return response.data;
  }

  async getTutorialCategories() {
    const response = await this.client.get('/tutorials/categories');
    return response.data;
  }

  async createTutorial(data: any) {
    const response = await this.client.post('/tutorials', data);
    return response.data;
  }

  async updateTutorial(id: string, data: any) {
    const response = await this.client.put(`/tutorials/${id}`, data);
    return response.data;
  }

  async deleteTutorial(id: string) {
    const response = await this.client.delete(`/tutorials/${id}`);
    return response.data;
  }

  // Withdrawals
  async getWithdrawals(params?: any) {
    const response = await this.client.get('/withdrawals', { params });
    return response.data;
  }

  async reviewWithdrawal(id: string, data: { status: string; admin_note?: string }) {
    const response = await this.client.put(`/withdrawals/${id}/review`, data);
    return response.data;
  }

  // Settings
  async getSettings(botId: string) {
    const response = await this.client.get(`/settings/${botId}`);
    return response.data;
  }

  async updateSettings(botId: string, data: any) {
    const response = await this.client.put(`/settings/${botId}`, data);
    return response.data;
  }

  // Admin Management
  async getAdmins() {
    const response = await this.client.get('/admin/admin-users');
    return response.data;
  }

  async createAdmin(data: any) {
    const response = await this.client.post('/admin/admin-users', data);
    return response.data;
  }

  async updateAdmin(id: string, data: any) {
    const response = await this.client.put(`/admin/admin-users/${id}`, data);
    return response.data;
  }

  async deleteAdmin(id: string) {
    const response = await this.client.delete(`/admin/admin-users/${id}`);
    return response.data;
  }

  async changeAdminPassword(id: string, data: { current_password?: string; new_password: string }) {
    const response = await this.client.patch(`/admin/admin-users/${id}/password`, data);
    return response.data;
  }

  // Dashboard
  async getDashboardStats() {
    const response = await this.client.get('/admin/dashboard/overview');
    return response.data;
  }

  async getUserGrowth(params?: any) {
    const response = await this.client.get('/admin/dashboard/user-growth', { params });
    return response.data;
  }

  async getTransactionVolume(params?: any) {
    const response = await this.client.get('/admin/dashboard/transaction-volume', { params });
    return response.data;
  }

  async getActivitySummary(params?: any) {
    const response = await this.client.get('/admin/dashboard/activity-summary', { params });
    return response.data;
  }

  // Audit Logs
  async getAuditLogs(params?: any) {
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

  // System Settings
  async getSystemSettings(params?: any) {
    const response = await this.client.get('/admin/system-settings', { params });
    return response.data;
  }

  async getSystemSetting(key: string) {
    const response = await this.client.get(`/admin/system-settings/${key}`);
    return response.data;
  }

  async updateSystemSetting(key: string, data: any) {
    const response = await this.client.put(`/admin/system-settings/${key}`, data);
    return response.data;
  }

  async createSystemSetting(data: any) {
    const response = await this.client.post('/admin/system-settings', data);
    return response.data;
  }

  async bulkUpdateSystemSettings(settings: any[]) {
    const response = await this.client.post('/admin/system-settings/bulk-update', { settings });
    return response.data;
  }

  async deleteSystemSetting(key: string) {
    const response = await this.client.delete(`/admin/system-settings/${key}`);
    return response.data;
  }

  async getSystemSettingCategories() {
    const response = await this.client.get('/admin/system-settings/categories/list');
    return response.data;
  }

  // NFT API
  async getNFTCategories() {
    const response = await this.client.get('/nft/categories');
    return response.data;
  }

  async createNFTCategory(data: any) {
    const response = await this.client.post('/nft/categories', data);
    return response.data;
  }

  async updateNFTCategory(id: string, data: any) {
    const response = await this.client.put(`/nft/categories/${id}`, data);
    return response.data;
  }

  async deleteNFTCategory(id: string) {
    const response = await this.client.delete(`/nft/categories/${id}`);
    return response.data;
  }

  async getNFTProducts(params?: any) {
    const response = await this.client.get('/nft/products', { params });
    return response.data;
  }

  async getNFTProduct(id: string) {
    const response = await this.client.get(`/nft/products/${id}`);
    return response.data;
  }

  async createNFTProduct(data: any) {
    const response = await this.client.post('/nft/products', data);
    return response.data;
  }

  async updateNFTProduct(id: string, data: any) {
    const response = await this.client.put(`/nft/products/${id}`, data);
    return response.data;
  }

  async deleteNFTProduct(id: string) {
    const response = await this.client.delete(`/nft/products/${id}`);
    return response.data;
  }

  // Auction API
  async getAuctions(params?: any) {
    const response = await this.client.get('/auctions', { params });
    return response.data;
  }

  async getAuction(id: string) {
    const response = await this.client.get(`/auctions/${id}`);
    return response.data;
  }

  async createAuction(data: any) {
    const response = await this.client.post('/auctions', data);
    return response.data;
  }

  async drawAuction(id: string) {
    const response = await this.client.post(`/auctions/${id}/draw`);
    return response.data;
  }

  async getAuctionEntries(id: string) {
    const response = await this.client.get(`/auctions/${id}/entries`);
    return response.data;
  }

  // Lucky Auction (new schema) Admin API
  async getLuckyAuctions(params?: any) {
    const response = await this.client.get('/admin/auctions', { params });
    return response.data;
  }

  async getLuckyAuction(id: string) {
    const response = await this.client.get(`/admin/auctions/${id}`);
    return response.data;
  }

  async createLuckyAuction(data: any) {
    const response = await this.client.post('/admin/auctions', data);
    return response.data;
  }

  async updateLuckyAuction(id: string, data: any) {
    const response = await this.client.put(`/admin/auctions/${id}`, data);
    return response.data;
  }

  async deleteLuckyAuction(id: string) {
    const response = await this.client.delete(`/admin/auctions/${id}`);
    return response.data;
  }

  async cancelLuckyAuction(id: string) {
    const response = await this.client.post(`/admin/auctions/${id}/cancel`);
    return response.data;
  }

  async drawLuckyAuction(id: string) {
    const response = await this.client.post(`/admin/auctions/${id}/draw`);
    return response.data;
  }

  async getLuckyAuctionResults(params?: any) {
    const response = await this.client.get('/admin/auctions/results/all', { params });
    return response.data;
  }

  // Trading Admin API
  async getTradingPairs(params?: any) {
    const response = await this.client.get('/admin/trading/pairs', { params });
    return response.data;
  }

  async createRealPair(data: any) {
    const response = await this.client.post('/admin/trading/pairs/real', data);
    return response.data;
  }

  async createCustomPair(data: any) {
    const response = await this.client.post('/admin/trading/pairs/custom', data);
    return response.data;
  }

  async updateTradingPair(id: string, data: any) {
    const response = await this.client.put(`/admin/trading/pairs/${id}`, data);
    return response.data;
  }

  async deleteTradingPair(id: string) {
    const response = await this.client.delete(`/admin/trading/pairs/${id}`);
    return response.data;
  }

  async addPricePoint(pairId: string, data: any) {
    const response = await this.client.post(`/admin/trading/pairs/${pairId}/price-points`, data);
    return response.data;
  }

  async createPricePreset(pairId: string, data: any) {
    const response = await this.client.post(`/admin/trading/pairs/${pairId}/presets`, data);
    return response.data;
  }

  async activatePreset(presetId: string) {
    const response = await this.client.put(`/admin/trading/presets/${presetId}/activate`);
    return response.data;
  }

  // Charity API
  async getCharityProjects(params?: any) {
    const response = await this.client.get('/charity/projects', { params });
    return response.data;
  }

  async getCharityProject(id: string) {
    const response = await this.client.get(`/charity/projects/${id}`);
    return response.data;
  }

  async createCharityProject(data: any) {
    const response = await this.client.post('/charity/projects', data);
    return response.data;
  }

  async updateCharityProject(id: string, data: any) {
    const response = await this.client.put(`/charity/projects/${id}`, data);
    return response.data;
  }

  // Wallet Admin API
  async getWalletNetworks() {
    const response = await this.client.get('/admin/wallet/networks');
    return response.data;
  }

  async createWalletNetwork(data: any) {
    const response = await this.client.post('/admin/wallet/networks', data);
    return response.data;
  }

  async updateWalletNetwork(id: string, data: any) {
    const response = await this.client.put(`/admin/wallet/networks/${id}`, data);
    return response.data;
  }

  async deleteWalletNetwork(id: string) {
    const response = await this.client.delete(`/admin/wallet/networks/${id}`);
    return response.data;
  }

  async getDepositRecords(params?: any) {
    const response = await this.client.get('/admin/wallet/deposits', { params });
    return response.data;
  }

  async getTransferRecords(params?: any) {
    const response = await this.client.get('/admin/wallet/transfers', { params });
    return response.data;
  }

  async getWithdrawalRecords(params?: any) {
    const response = await this.client.get('/admin/wallet/withdrawals', { params });
    return response.data;
  }

  async reviewWithdrawalNew(id: string, data: any) {
    const response = await this.client.put(`/admin/wallet/withdrawals/${id}/review`, data);
    return response.data;
  }

  async resetWithdrawPassword(userId: string) {
    const response = await this.client.put(`/users/${userId}/reset-withdraw-password`, {});
    return response.data;
  }

  // Trading Rules
  async getTradingRules(params?: any) {
    const response = await this.client.get('/admin/trading/rules', { params });
    return response.data;
  }

  async createTradingRule(data: any) {
    const response = await this.client.post('/admin/trading/rules', data);
    return response.data;
  }

  async updateTradingRule(id: string, data: any) {
    const response = await this.client.put(`/admin/trading/rules/${id}`, data);
    return response.data;
  }

  async deleteTradingRule(id: string) {
    const response = await this.client.delete(`/admin/trading/rules/${id}`);
    return response.data;
  }

  // Trading Sessions
  async getTradingSessions(params?: any) {
    const response = await this.client.get('/admin/trading/sessions', { params });
    return response.data;
  }

  async settleSession(id: string, data: any) {
    const response = await this.client.post(`/admin/trading/sessions/${id}/settle`, data);
    return response.data;
  }

  // File upload helper
  getFileUrl(fileId: string, botToken: string): string {
    return `https://api.telegram.org/file/bot${botToken}/${fileId}`;
  }

  // Generic HTTP methods for flexible use
  async get(path: string, params?: any) {
    return this.client.get(path, { params });
  }

  async post(path: string, data?: any) {
    return this.client.post(path, data);
  }

  async put(path: string, data?: any) {
    return this.client.put(path, data);
  }

  async delete(path: string) {
    return this.client.delete(path);
  }

  // Charity Banners
  async getCharityBanners() {
    const response = await this.client.get('/charity/banners');
    return response.data;
  }

  async createCharityBanner(data: any) {
    const response = await this.client.post('/charity/banners', data);
    return response.data;
  }

  async deleteCharityBanner(id: string) {
    const response = await this.client.delete(`/charity/banners/${id}`);
    return response.data;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
