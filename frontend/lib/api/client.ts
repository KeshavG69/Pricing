import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance
export const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// One in-flight token refresh shared by axios and authFetch(). The backend
// rotates refresh tokens and treats reuse of an old one as theft (revoking the
// whole session), so concurrent 401s must wait on the same refresh call.
let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) {
        throw new Error(`Token refresh failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      return data.access_token as string;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function clearSessionAndRedirect() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  if (typeof window !== 'undefined') {
    window.location.href = '/auth/login';
  }
}

/**
 * fetch() with the bearer token attached, for callers that cannot use axios
 * (SSE streams, binary document previews). On 401 it refreshes the token once
 * and retries; if the refresh fails the user is sent to the login page.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const withToken = (token: string | null): RequestInit => {
    const headers = new Headers(init.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return { ...init, headers };
  };

  const res = await fetch(input, withToken(localStorage.getItem('access_token')));
  if (res.status !== 401) {
    return res;
  }
  try {
    const newToken = await refreshAccessToken();
    return await fetch(input, withToken(newToken));
  } catch {
    clearSessionAndRedirect();
    return res;
  }
}

// Request interceptor - Add Authorization header from localStorage
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Get access token from localStorage
    const accessToken = localStorage.getItem('access_token');

    // Add Authorization header if token exists
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle 401 with automatic token refresh and 403 org removal
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 403 Forbidden - user removed from organization
    if (error.response?.status === 403) {
      const errorDetail = (error.response.data as any)?.detail || '';

      // If user was removed from organization, refetch user to auto-switch
      if (errorDetail.includes('suspended') || errorDetail.includes('inactive') || errorDetail.includes('removed')) {
        console.log('[API] User removed from organization, refetching user...');

        // Trigger user refetch which will auto-switch to another org
        if (typeof window !== 'undefined') {
          try {
            const { useAuthStore } = await import('@/lib/stores/authStore');
            await useAuthStore.getState().fetchUser();
          } catch (fetchError) {
            console.error('[API] Failed to refetch user:', fetchError);
          }
        }
      }
    }

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

      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        clearSessionAndRedirect();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
