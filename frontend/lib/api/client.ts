import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance with cookie support
export const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,  // CRITICAL: Send cookies with requests
});

// Track if refresh is in progress to prevent multiple simultaneous refreshes
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

// Request interceptor - NO LONGER NEEDED (cookies auto-attach)
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Cookies are automatically sent due to withCredentials: true
    // No need to manually add Authorization header
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle 401 with automatic token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Prevent refresh on public routes
      const isPublicRoute = originalRequest.url?.includes('/auth/login') ||
                           originalRequest.url?.includes('/auth/signup') ||
                           originalRequest.url?.includes('/auth/google/login') ||
                           originalRequest.url?.includes('/auth/me');  // Allow /auth/me to fail silently

      if (isPublicRoute) {
        return Promise.reject(error);
      }

      // Prevent infinite loops on refresh endpoint
      if (originalRequest.url?.includes('/auth/refresh')) {
        // Refresh failed, logout user
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber(() => {
            resolve(apiClient(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        // Attempt to refresh token
        await apiClient.post('/auth/refresh');

        // Refresh successful, cookies auto-updated by backend
        isRefreshing = false;
        onRefreshed('token_refreshed');

        // Retry original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        isRefreshing = false;
        refreshSubscribers = [];

        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
