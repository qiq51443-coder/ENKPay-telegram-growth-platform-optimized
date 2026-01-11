import { LoginResponse, AdminUser } from './types';
import apiClient from './api';

export const authService = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const response = await apiClient.login(username, password);
    
    // Store token and user in localStorage
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    
    return response;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  },

  getToken: (): string | null => {
    return localStorage.getItem('token');
  },

  getUser: (): AdminUser | null => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  isAuthenticated: (): boolean => {
    return !!authService.getToken();
  },
};

export default authService;
