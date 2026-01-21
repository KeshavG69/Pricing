/**
 * Organization Deletion Store
 *
 * Manages state for the organization deletion flow, including:
 * - Pre-deletion eligibility checks
 * - Account/member removal warnings
 * - Final organization deletion
 */

import { create } from 'zustand';
import {
  organizationsApi,
  AccountToDelete,
  MemberToRemove,
  OrgDeletionResponse
} from '@/lib/api/organizations';

interface OrganizationDeletionState {
  // Check state
  checkLoading: boolean;
  canDelete: boolean;
  organizationName: string;
  memberCount: number;
  proposalCount: number;
  accountsToDelete: AccountToDelete[];
  membersToRemove: MemberToRemove[];

  // Deletion state
  deletingOrg: boolean;
  error: string | null;

  // Actions
  checkDeletionEligibility: () => Promise<void>;
  deleteOrganization: () => Promise<OrgDeletionResponse>;
  reset: () => void;
}

export const useOrganizationDeletionStore = create<OrganizationDeletionState>((set) => ({
  // Initial state
  checkLoading: false,
  canDelete: false,
  organizationName: '',
  memberCount: 0,
  proposalCount: 0,
  accountsToDelete: [],
  membersToRemove: [],
  deletingOrg: false,
  error: null,

  // Check if organization can be deleted
  checkDeletionEligibility: async () => {
    set({ checkLoading: true, error: null });

    try {
      const result = await organizationsApi.checkOrganizationDeletion();

      set({
        canDelete: result.can_delete,
        organizationName: result.organization_name,
        memberCount: result.member_count,
        proposalCount: result.proposal_count,
        accountsToDelete: result.accounts_to_delete,
        membersToRemove: result.members_to_remove,
        checkLoading: false,
      });
    } catch (error: any) {
      console.error('Failed to check deletion eligibility:', error);
      set({
        error: error.response?.data?.detail || 'Failed to check deletion eligibility',
        checkLoading: false,
      });
    }
  },

  // Delete organization
  deleteOrganization: async () => {
    set({ deletingOrg: true, error: null });

    try {
      const result = await organizationsApi.deleteOrganization();
      set({ deletingOrg: false });
      return result;
    } catch (error: any) {
      console.error('Failed to delete organization:', error);
      set({
        error: error.response?.data?.detail || 'Failed to delete organization',
        deletingOrg: false,
      });
      throw error;
    }
  },

  // Reset state
  reset: () => {
    set({
      checkLoading: false,
      canDelete: false,
      organizationName: '',
      memberCount: 0,
      proposalCount: 0,
      accountsToDelete: [],
      membersToRemove: [],
      deletingOrg: false,
      error: null,
    });
  },
}));
