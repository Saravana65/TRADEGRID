import { create } from 'zustand';
import { User } from '@tradegrid/shared-types';
import { RegisterInput, LoginInput } from '@tradegrid/validation';
import { authApiService } from '../services/auth.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: (() => {
    try {
      const stored = localStorage.getItem('tg_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })(),
  isAuthenticated: !!localStorage.getItem('tg_access_token'),
  isLoading: false,
  error: null,

  login: async (input: LoginInput) => {
    set({ isLoading: true, error: null });
    try {
      const { user, tokens } = await authApiService.login(input);
      localStorage.setItem('tg_access_token', tokens.accessToken);
      localStorage.setItem('tg_refresh_token', tokens.refreshToken);
      localStorage.setItem('tg_user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false, error: null });
    } catch (err: any) {
      const message = err.response?.data?.error?.message || err.message || 'Login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  register: async (input: RegisterInput) => {
    set({ isLoading: true, error: null });
    try {
      const { user, tokens } = await authApiService.register(input);
      localStorage.setItem('tg_access_token', tokens.accessToken);
      localStorage.setItem('tg_refresh_token', tokens.refreshToken);
      localStorage.setItem('tg_user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false, error: null });
    } catch (err: any) {
      const message = err.response?.data?.error?.message || err.message || 'Registration failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authApiService.logout();
    } catch {
      // Continue to clear local state even if server logout errors
    } finally {
      set({ user: null, isAuthenticated: false, isLoading: false, error: null });
    }
  },

  checkAuth: async () => {
    const token = localStorage.getItem('tg_access_token');
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }
    set({ isLoading: true });
    try {
      const user = await authApiService.getMe();
      localStorage.setItem('tg_user', JSON.stringify(user));
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('tg_access_token');
      localStorage.removeItem('tg_refresh_token');
      localStorage.removeItem('tg_user');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
