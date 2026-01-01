/**
 * Terms and Conditions API client
 * Handles version checking and acceptance tracking
 * Content is rendered from React components for optimal performance and formatting
 */

import apiClient from './client';
import { config } from '@/lib/config';

// Response types
interface AcceptResponse {
  success: boolean;
  version: string;
  accepted_at: string;
}

interface StatusResponse {
  accepted_version: string;
  accepted_at: string | null;
  current_version: string;
  needs_acceptance: boolean;
}

export const termsApi = {
  /**
   * Get current terms version from frontend config
   */
  getCurrentVersion: (): string => {
    return config.terms.currentVersion;
  },

  /**
   * Accept current terms version
   * Updates user document with version + timestamp
   */
  acceptTerms: async (): Promise<void> => {
    await apiClient.post<AcceptResponse>('/terms/accept');
  },

  /**
   * Get current user's terms acceptance status
   */
  getMyStatus: async (): Promise<StatusResponse> => {
    const response = await apiClient.get<StatusResponse>('/terms/my-status');
    return response.data;
  },
};
