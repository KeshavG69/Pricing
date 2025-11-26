import apiClient from './client';
import { AuthResponse, LoginCredentials, SignupData, User } from '@/types';

export const authApi = {
  // Sign up new user
  signup: async (data: SignupData): Promise<User> => {
    const response = await apiClient.post<User>('/auth/signup', data);
    return response.data;
  },

  // Login user
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  // Google login
  googleLogin: async (credential: string): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/google/login', {
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
};
