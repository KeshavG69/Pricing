import apiClient from './client';
import { LoginCredentials, SignupData, User } from '@/types';

// Response types with tokens
interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

interface SignupResponse {
  email: string;
  message: string;
  requires_verification: boolean;
}

export const authApi = {
  // Sign up new user
  signup: async (data: SignupData): Promise<SignupResponse> => {
    const response = await apiClient.post<SignupResponse>('/auth/signup', data);
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
    const refreshToken = localStorage.getItem('refresh_token');
    await apiClient.post('/auth/logout', {
      refresh_token: refreshToken
    });
  },
};
