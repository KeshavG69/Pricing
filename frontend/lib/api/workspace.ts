import apiClient from './client';
import { cacheManager } from '@/lib/cache';

const ORGS_CACHE_KEY = 'workspace:organizations';

export interface UserOrganization {
  id: string;
  name: string;
  role: 'admin' | 'user';
  status: string;
  is_current: boolean;
}

export const workspaceApi = {
  // Get all organizations user belongs to.
  // Read-through cached: the list rarely changes, so repeated layout mounts
  // reuse the cached value instead of re-hitting the API. Pass forceRefresh
  // to bypass (e.g. after joining a new org).
  getUserOrganizations: async (forceRefresh = false): Promise<UserOrganization[]> => {
    if (!forceRefresh) {
      const cached = cacheManager.get<UserOrganization[]>(ORGS_CACHE_KEY);
      if (cached && !cached.isExpired) {
        return cached.data;
      }
    }
    const response = await apiClient.get<UserOrganization[]>('/workspace/organizations');
    cacheManager.set(ORGS_CACHE_KEY, response.data);
    return response.data;
  },

  // Switch to a different organization
  switchOrganization: async (organizationId: string): Promise<void> => {
    await apiClient.post('/workspace/switch', {
      organization_id: organizationId,
    });
    // The cached list's is_current flags are now stale — drop it so the next
    // read fetches fresh (the cache is localStorage-backed and would otherwise
    // survive the post-switch reload).
    cacheManager.invalidate(ORGS_CACHE_KEY);
  },
};
