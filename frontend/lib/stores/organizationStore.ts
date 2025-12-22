import { create } from 'zustand';
import {
  Organization,
  OrganizationSettings,
  OrganizationStats,
  TeamMember,
  Invitation,
  InviteUserRequest,
} from '@/types';
import { organizationsApi } from '../api/organizations';
import { invitationsApi } from '../api/invitations';
import { cacheManager } from '../cache';
import { deduplicateRequest } from '../utils/requestDeduplication';
import { useAuthStore } from './authStore';

interface OrganizationState {
  organization: Organization | null;
  members: TeamMember[];
  invitations: Invitation[];
  stats: OrganizationStats | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchOrganization: (force?: boolean) => Promise<void>;
  fetchMembers: (force?: boolean) => Promise<void>;
  fetchInvitations: (force?: boolean) => Promise<void>;
  fetchStats: (force?: boolean) => Promise<void>;
  sendInvitation: (data: InviteUserRequest) => Promise<void>;
  revokeInvitation: (invitationId: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  updateSettings: (settings: Partial<OrganizationSettings>) => Promise<void>;
  clearError: () => void;
}

export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  organization: null,
  members: [],
  invitations: [],
  stats: null,
  isLoading: false,
  error: null,

  fetchOrganization: async (force = false) => {
    try {
      const user = useAuthStore.getState().user;
      const orgId = user?.organization_id;

      if (!orgId) {
        console.warn('[ORG] No organization ID, skipping fetch');
        return;
      }

      // Conditional refresh pattern: Check cache first, only fetch if expired or forced
      const cacheKey = `org:${orgId}`;
      const cached = cacheManager.get<Organization>(cacheKey);

      // If cache is valid and not forced, use cached data (no fetch)
      if (cached && !cached.isExpired && !force) {
        console.log('[ORG] ✅ Using cached organization data (no fetch needed)');
        set({ organization: cached.data, isLoading: false });
        return;
      }

      // Cache expired or forced refresh - fetch from API
      set({ isLoading: true, error: null });
      console.log(`[ORG] Fetching organization data... (force=${force}, expired=${cached?.isExpired})`);

      // Deduplicate request to prevent multiple simultaneous calls
      const organization = await deduplicateRequest(
        cacheKey,
        () => organizationsApi.getMyOrganization()
      );

      set({ organization, isLoading: false });

      // Update cache with 5-minute TTL
      cacheManager.set(cacheKey, organization, 5 * 60 * 1000);
      console.log('[ORG] Organization data loaded and cached');
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch organization',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchMembers: async (force = false) => {
    try {
      const user = useAuthStore.getState().user;
      const orgId = user?.organization_id;

      if (!orgId) {
        console.warn('[ORG] No organization ID, skipping members fetch');
        return;
      }

      // Conditional refresh with caching
      const cacheKey = `org:${orgId}:members`;
      const cached = cacheManager.get<TeamMember[]>(cacheKey);

      if (cached && !cached.isExpired && !force) {
        console.log('[ORG] ✅ Using cached members data (no fetch needed)');
        set({ members: cached.data, isLoading: false });
        return;
      }

      set({ isLoading: true, error: null });
      console.log(`[ORG] Fetching members... (force=${force}, expired=${cached?.isExpired})`);

      const members = await deduplicateRequest(
        cacheKey,
        () => organizationsApi.getMembers()
      );

      set({ members, isLoading: false });
      cacheManager.set(cacheKey, members, 5 * 60 * 1000);
      console.log('[ORG] Members data loaded and cached');
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch members',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchInvitations: async (force = false) => {
    try {
      const user = useAuthStore.getState().user;
      const orgId = user?.organization_id;

      if (!orgId) {
        console.warn('[ORG] No organization ID, skipping invitations fetch');
        return;
      }

      // Conditional refresh with caching
      const cacheKey = `org:${orgId}:invitations`;
      const cached = cacheManager.get<Invitation[]>(cacheKey);

      if (cached && !cached.isExpired && !force) {
        console.log('[ORG] ✅ Using cached invitations data (no fetch needed)');
        set({ invitations: cached.data, isLoading: false });
        return;
      }

      set({ isLoading: true, error: null });
      console.log(`[ORG] Fetching invitations... (force=${force}, expired=${cached?.isExpired})`);

      const invitations = await deduplicateRequest(
        cacheKey,
        () => invitationsApi.listInvitations()
      );

      set({ invitations, isLoading: false });
      cacheManager.set(cacheKey, invitations, 5 * 60 * 1000);
      console.log('[ORG] Invitations data loaded and cached');
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch invitations',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchStats: async (force = false) => {
    try {
      const user = useAuthStore.getState().user;
      const orgId = user?.organization_id;

      if (!orgId) {
        console.warn('[ORG] No organization ID, skipping stats fetch');
        return;
      }

      // Conditional refresh with caching (shorter TTL for stats - 2 minutes)
      const cacheKey = `org:${orgId}:stats`;
      const cached = cacheManager.get<OrganizationStats>(cacheKey);

      if (cached && !cached.isExpired && !force) {
        console.log('[ORG] ✅ Using cached stats data (no fetch needed)');
        set({ stats: cached.data, isLoading: false });
        return;
      }

      set({ isLoading: true, error: null });
      console.log(`[ORG] Fetching stats... (force=${force}, expired=${cached?.isExpired})`);

      const stats = await deduplicateRequest(
        cacheKey,
        () => organizationsApi.getStats()
      );

      set({ stats, isLoading: false });
      cacheManager.set(cacheKey, stats, 2 * 60 * 1000); // 2-minute TTL for stats
      console.log('[ORG] Stats data loaded and cached');
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch stats',
        isLoading: false,
      });
      throw error;
    }
  },

  sendInvitation: async (data: InviteUserRequest) => {
    try {
      set({ isLoading: true, error: null });
      await invitationsApi.sendInvitation(data);

      // Invalidate cache and force refresh invitations list
      const user = useAuthStore.getState().user;
      if (user?.organization_id) {
        cacheManager.invalidate(`org:${user.organization_id}:invitations`);
      }

      await get().fetchInvitations(true); // Force refresh
      set({ isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to send invitation',
        isLoading: false,
      });
      throw error;
    }
  },

  revokeInvitation: async (invitationId: string) => {
    try {
      set({ isLoading: true, error: null });
      await invitationsApi.revokeInvitation(invitationId);

      // Remove from local state
      set((state) => ({
        invitations: state.invitations.filter((inv) => inv.id !== invitationId),
        isLoading: false,
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to revoke invitation',
        isLoading: false,
      });
      throw error;
    }
  },

  removeMember: async (userId: string) => {
    try {
      set({ isLoading: true, error: null });
      await organizationsApi.removeMember(userId);

      // Invalidate cache and force refresh members list
      const user = useAuthStore.getState().user;
      if (user?.organization_id) {
        cacheManager.invalidate(`org:${user.organization_id}:members`);
      }

      await get().fetchMembers(true); // Force refresh
      set({ isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to remove member',
        isLoading: false,
      });
      throw error;
    }
  },

  updateSettings: async (settings: Partial<OrganizationSettings>) => {
    try {
      set({ isLoading: true, error: null });
      const organization = await organizationsApi.updateSettings(settings);

      // Invalidate organization cache (settings updated)
      const user = useAuthStore.getState().user;
      if (user?.organization_id) {
        cacheManager.invalidate(`org:${user.organization_id}`);
      }

      set({ organization, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to update settings',
        isLoading: false,
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
