import { apiClient } from './api';
import { ApiResponse, AuthResponse, User, HealthCheckResponse } from '@tradegrid/shared-types';
import { RegisterInput, LoginInput } from '@tradegrid/validation';

export const authApiService = {
  async register(input: RegisterInput): Promise<AuthResponse> {
    const res = await apiClient.post<ApiResponse<AuthResponse>>('/auth/register', input);
    return res.data.data;
  },

  async login(input: LoginInput): Promise<AuthResponse> {
    const res = await apiClient.post<ApiResponse<AuthResponse>>('/auth/login', input);
    return res.data.data;
  },

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem('tg_refresh_token');
    try {
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken });
      }
    } finally {
      localStorage.removeItem('tg_access_token');
      localStorage.removeItem('tg_refresh_token');
      localStorage.removeItem('tg_user');
    }
  },

  async getMe(): Promise<User> {
    const res = await apiClient.get<ApiResponse<{ user: User }>>('/auth/me');
    return res.data.data.user;
  },

  async getHealth(): Promise<HealthCheckResponse> {
    const res = await apiClient.get<ApiResponse<HealthCheckResponse>>('/health');
    return res.data.data;
  },
};
