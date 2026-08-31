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
export default apiClient;
