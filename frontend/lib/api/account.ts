/**
 * Account management API client.
 *
 * Handles account deletion, including pre-deletion checks and organization admin resolution.
 */

import apiClient from './client';

export interface BlockingOrg {
  id: string;
  name: string;
  role: string;
  is_last_admin: boolean;
  member_count: number;
  can_promote_members: {
    id: string;
    name: string;
    email: string;
    role: string;
  }[];
}

export interface SimpleOrg {
  id: string;
  name: string;
  role: string;
}

export interface DeletionCheckResponse {
  can_delete: boolean;
  blocking_organizations: BlockingOrg[];
  organizations_to_delete: SimpleOrg[];
  other_organizations: SimpleOrg[];
}

export interface PromoteResponse {
  success: boolean;
  user_id: string;
  new_role: string;
}

export interface DeleteAccountResponse {
  success: boolean;
  message: string;
}

export const accountApi = {
  /**
   * Check if user can delete their account.
   * Returns blocking organizations if user is last admin anywhere.
   */
  checkDeletionEligibility: async (): Promise<DeletionCheckResponse> => {
    const response = await apiClient.get<DeletionCheckResponse>('/users/me/deletion-check');
    return response.data;
  },

  /**
   * Promote a member to admin role in an organization.
   * Used to resolve blocking organization before account deletion.
   */
  promoteMember: async (userId: string): Promise<PromoteResponse> => {
    const response = await apiClient.post<PromoteResponse>(
      `/organizations/members/${userId}/promote`
    );
    return response.data;
  },

  /**
   * Delete the current user's account.
   * Must resolve all blocking organizations first.
   */
  deleteAccount: async (): Promise<DeleteAccountResponse> => {
    const response = await apiClient.delete<DeleteAccountResponse>(
      '/users/me',
      {
        params: { confirm: true }
      }
    );
    return response.data;
  },
};
