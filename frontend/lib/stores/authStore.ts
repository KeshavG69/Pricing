import { create } from 'zustand';
import { User, LoginCredentials, SignupData } from '@/types';
import { authApi } from '../api/auth';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isInitializing: boolean;

  // Actions
  login: (credentials: LoginCredentials) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  clearError: () => void;
  initializeAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  error: null,
  isInitializing: true,

  login: async (credentials) => {
    try {
      set({ isLoading: true, error: null });

      // Backend sets HttpOnly cookies automatically
      const response = await authApi.login(credentials);

      // Store user in memory only (NOT localStorage)
      set({ user: response.user, isLoading: false });
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
      await authApi.signup(data);

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

      // Backend sets HttpOnly cookies automatically
      const response = await authApi.googleLogin(credential);

      // Store user in memory only (NOT localStorage)
      set({ user: response.user, isLoading: false });
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
      // Call logout endpoint (clears cookies on backend)
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear user from memory
      set({ user: null });
    }
  },

  fetchUser: async () => {
    try {
      const user = await authApi.getCurrentUser();
      set({ user });
    } catch (error) {
      console.error('Failed to fetch user:', error);
      set({ user: null });
    }
  },

  clearError: () => set({ error: null }),

  initializeAuth: async () => {
    // On app load, try to fetch current user
    // If cookies exist and are valid, backend will authenticate
    // No need to check localStorage
    set({ isInitializing: true });
    try {
      await get().fetchUser();
    } catch (error) {
      // Silent fail - user not authenticated
      set({ user: null });
    } finally {
      set({ isInitializing: false });
    }
  },
}));
