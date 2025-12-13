import apiClient from './client';
import { Organization, OrganizationSettings, OrganizationStats, TeamMember } from '@/types';

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
  updateSettings: async (settings: Partial<OrganizationSettings>): Promise<Organization> => {
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
};
