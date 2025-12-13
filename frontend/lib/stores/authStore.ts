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

      const response = await authApi.login(credentials);

      // Store tokens in localStorage
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);

      // Store user in state
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

      const response = await authApi.googleLogin(credential);

      // Store tokens in localStorage
      localStorage.setItem('access_token', response.access_token);
      localStorage.setItem('refresh_token', response.refresh_token);

      // Store user in state
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
      // Call logout endpoint to revoke refresh token
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear tokens from localStorage
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');

      // Clear all cache on logout
      if (typeof window !== 'undefined') {
        try {
          const { cacheManager } = await import('@/lib/cache');
          cacheManager.invalidate(); // Clear all cache
        } catch (error) {
          console.error('[AUTH] Failed to clear cache on logout:', error);
        }
      }

      // Clear user from state
      set({ user: null });
    }
  },

  fetchUser: async () => {
    try {
      const previousUser = get().user;
      const user = await authApi.getCurrentUser();

      // Check if organization changed (user was removed from org and switched to another)
      if (previousUser && user && previousUser.organization_id !== user.organization_id) {
        console.log('[AUTH] Organization changed, clearing cache and refreshing...');

        // Clear all cache when organization changes
        if (typeof window !== 'undefined') {
          try {
            const { cacheManager } = await import('@/lib/cache');
            cacheManager.invalidate(); // Clear all cache
          } catch (error) {
            console.error('[AUTH] Failed to clear cache:', error);
          }
        }

        // Update user
        set({ user });

        // Redirect to dashboard to refresh data
        if (typeof window !== 'undefined') {
          window.location.href = '/dashboard';
        }
      } else {
        set({ user });
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      set({ user: null });
    }
  },

  clearError: () => set({ error: null }),

  initializeAuth: async () => {
    // On app load, try to fetch current user if tokens exist
    set({ isInitializing: true });
    try {
      const accessToken = localStorage.getItem('access_token');

      if (accessToken) {
        // Try to fetch user with existing token
        await get().fetchUser();
      } else {
        // No token, user not authenticated
        set({ user: null });
      }
    } catch (error) {
      // Token invalid or expired, clear storage
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      set({ user: null });
    } finally {
      set({ isInitializing: false });
    }
  },
}));
