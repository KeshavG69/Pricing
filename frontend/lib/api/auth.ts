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

interface ForgotPasswordResponse {
  message: string;
  email: string;
}

interface ResetPasswordResponse {
  message: string;
}

interface ChangePasswordResponse {
  message: string;
}

interface UpdateProfileResponse {
  message: string;
  firstName: string;
  lastName: string;
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

  // Request password reset
  forgotPassword: async (email: string): Promise<ForgotPasswordResponse> => {
    const response = await apiClient.post<ForgotPasswordResponse>('/auth/forgot-password', {
      email,
    });
    return response.data;
  },

  // Reset password with token
  resetPassword: async (token: string, newPassword: string): Promise<ResetPasswordResponse> => {
    const response = await apiClient.post<ResetPasswordResponse>('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
    return response.data;
  },

  // Change password (authenticated)
  changePassword: async (currentPassword: string, newPassword: string): Promise<ChangePasswordResponse> => {
    const response = await apiClient.post<ChangePasswordResponse>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  },

  // Update profile (authenticated)
  updateProfile: async (name: string): Promise<UpdateProfileResponse> => {
    const response = await apiClient.put<UpdateProfileResponse>('/auth/profile', {
      name,
    });
    return response.data;
  },
};
