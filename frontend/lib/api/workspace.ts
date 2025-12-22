import apiClient from './client';

export interface UserOrganization {
  id: string;
  name: string;
  role: 'admin' | 'user';
  status: string;
  is_current: boolean;
}

export const workspaceApi = {
  // Get all organizations user belongs to
  getUserOrganizations: async (): Promise<UserOrganization[]> => {
    const response = await apiClient.get<UserOrganization[]>('/workspace/organizations');
    return response.data;
  },

  // Switch to a different organization
  switchOrganization: async (organizationId: string): Promise<void> => {
    await apiClient.post('/workspace/switch', {
      organization_id: organizationId,
    });
  },
};
