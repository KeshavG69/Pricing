import { create } from 'zustand';
import { User, LoginCredentials, SignupData } from '@/types';
import { authApi } from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  clearError: () => void;
  initializeAuth: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,

  login: async (credentials) => {
    try {
      set({ isLoading: true, error: null });
      const response = await authApi.login(credentials);

      // Store token
      localStorage.setItem('access_token', response.access_token);
      set({ token: response.access_token });

      // Fetch user data
      await get().fetchUser();

      set({ isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Login failed',
        isLoading: false,
      });
      throw error;
    }
  },

  signup: async (data) => {
    try {
      set({ isLoading: true, error: null });
      const user = await authApi.signup(data);

      // After signup, login automatically
      await get().login({
        email: data.email,
        password: data.password,
      });

      set({ isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Signup failed',
        isLoading: false,
      });
      throw error;
    }
  },

  googleLogin: async (credential) => {
    try {
      set({ isLoading: true, error: null });
      const response = await authApi.googleLogin(credential);

      // Store token
      localStorage.setItem('access_token', response.access_token);
      set({ token: response.access_token });

      // Fetch user data
      await get().fetchUser();

      set({ isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Google login failed',
        isLoading: false,
      });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state regardless of API call success
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      set({ user: null, token: null });
    }
  },

  fetchUser: async () => {
    try {
      const user = await authApi.getCurrentUser();
      set({ user });
      localStorage.setItem('user', JSON.stringify(user));
    } catch (error) {
      console.error('Failed to fetch user:', error);
      set({ user: null, token: null });
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
    }
  },

  clearError: () => set({ error: null }),

  initializeAuth: () => {
    // Check for stored token and user on app load
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      const userStr = localStorage.getItem('user');

      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          set({ token, user });
        } catch (error) {
          console.error('Failed to parse stored user:', error);
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
        }
      }
    }
  },
}));
