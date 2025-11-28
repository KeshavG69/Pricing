import apiClient from './client';
import { LoginCredentials, SignupData, User } from '@/types';

// Updated response types (no tokens in response body)
interface LoginResponse {
  message: string;
  user: User;
}

export const authApi = {
  // Sign up new user
  signup: async (data: SignupData): Promise<User> => {
    const response = await apiClient.post<User>('/auth/signup', data);
    return response.data;
  },

  // Login user
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', credentials);
    return response.data;
  },

  // Google login
  googleLogin: async (credential: string): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/google/login', {
      credential,
    });
    return response.data;
  },

  // Get current user
  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  // Logout
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  // Refresh token (called automatically by interceptor)
  refresh: async (): Promise<void> => {
    await apiClient.post('/auth/refresh');
  },
};
