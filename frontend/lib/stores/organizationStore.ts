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

interface OrganizationState {
  organization: Organization | null;
  members: TeamMember[];
  invitations: Invitation[];
  stats: OrganizationStats | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchOrganization: () => Promise<void>;
  fetchMembers: () => Promise<void>;
  fetchInvitations: () => Promise<void>;
  fetchStats: () => Promise<void>;
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

  fetchOrganization: async () => {
    try {
      set({ isLoading: true, error: null });
      const organization = await organizationsApi.getMyOrganization();
      set({ organization, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch organization',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchMembers: async () => {
    try {
      set({ isLoading: true, error: null });
      const members = await organizationsApi.getMembers();
      set({ members, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch members',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchInvitations: async () => {
    try {
      set({ isLoading: true, error: null });
      const invitations = await invitationsApi.listInvitations();
      set({ invitations, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch invitations',
        isLoading: false,
      });
      throw error;
    }
  },

  fetchStats: async () => {
    try {
      set({ isLoading: true, error: null });
      const stats = await organizationsApi.getStats();
      set({ stats, isLoading: false });
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

      // Refresh invitations list
      await get().fetchInvitations();
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

      // Refresh members list
      await get().fetchMembers();
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
