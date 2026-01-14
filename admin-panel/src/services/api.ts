import axios, { AxiosInstance, AxiosError } from 'axios';
import { LoginResponse } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

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
    const response = await this.client.get('/admin/admins');
    return response.data;
  }

  async createAdmin(data: any) {
    const response = await this.client.post('/admin/admins', data);
    return response.data;
  }

  async updateAdmin(id: string, data: any) {
    const response = await this.client.put(`/admin/admins/${id}`, data);
    return response.data;
  }

  async deleteAdmin(id: string) {
    const response = await this.client.delete(`/admin/admins/${id}`);
    return response.data;
  }

  async changeAdminPassword(id: string, data: { current_password?: string; new_password: string }) {
    const response = await this.client.patch(`/admin/admins/${id}/password`, data);
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

  // File upload helper
  getFileUrl(fileId: string, botToken: string): string {
    return `https://api.telegram.org/file/bot${botToken}/${fileId}`;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
