import apiClient from './client';
import { Organization, OrganizationSettings, OrganizationStats, TeamMember } from '@/types';

export interface AccountToDelete {
  id: string;
  name: string;
  email: string;
  is_current_user: boolean;
}

export interface MemberToRemove {
  id: string;
  name: string;
  email: string;
}

export interface OrgDeletionCheckResponse {
  can_delete: boolean;
  organization_name: string;
  member_count: number;
  proposal_count: number;
  accounts_to_delete: AccountToDelete[];
  members_to_remove: MemberToRemove[];
}

export interface OrgDeletionResponse {
  success: boolean;
  message: string;
  proposals_deleted: number;
  accounts_deleted: number;
  members_removed: number;
  admin_account_deleted: boolean;
}

export const organizationsApi = {
  // Get current user's organization
  getMyOrganization: async (): Promise<Organization> => {
    const response = await apiClient.get<Organization>('/organizations/me');
    return response.data;
  },

  // Get organization members (admin only)
  getMembers: async (): Promise<TeamMember[]> => {
    const response = await apiClient.get<TeamMember[]>('/organizations/me/members');
    return response.data;
  },

  // Update organization settings (admin only)
  updateSettings: async (settings: Partial<OrganizationSettings> & { name?: string; website?: string | null; address?: string | null }): Promise<Organization> => {
    const response = await apiClient.patch<Organization>('/organizations/me/settings', settings);
    return response.data;
  },

  // Remove team member (admin only)
  removeMember: async (userId: string): Promise<void> => {
    await apiClient.delete(`/organizations/members/${userId}`);
  },

  // Get organization stats
  getStats: async (): Promise<OrganizationStats> => {
    const response = await apiClient.get<OrganizationStats>('/organizations/me/stats');
    return response.data;
  },

  // Check organization deletion eligibility (admin only)
  checkOrganizationDeletion: async (): Promise<OrgDeletionCheckResponse> => {
    const response = await apiClient.get<OrgDeletionCheckResponse>('/organizations/deletion-check');
    return response.data;
  },

  // Delete organization (admin only)
  deleteOrganization: async (): Promise<OrgDeletionResponse> => {
    const response = await apiClient.delete<OrgDeletionResponse>('/organizations?confirm=true');
    return response.data;
  },
};
