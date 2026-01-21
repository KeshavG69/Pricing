/**
 * Account Deletion Store
 *
 * Manages state for the account deletion flow, including:
 * - Pre-deletion eligibility checks
 * - Blocking organization resolution (promotion)
 * - Final account deletion
 */

import { create } from 'zustand';
import { accountApi, BlockingOrg, SimpleOrg } from '@/lib/api/account';

interface AccountDeletionState {
  // Check state
  checkLoading: boolean;
  canDelete: boolean;
  blockingOrgs: BlockingOrg[];
  orgsToDelete: SimpleOrg[];
  otherOrgs: SimpleOrg[];

  // Action states
  promotingUserId: string | null;
  deletingAccount: boolean;
  error: string | null;

  // Actions
  checkDeletionEligibility: () => Promise<void>;
  promoteMember: (orgId: string, userId: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  reset: () => void;
}

export const useAccountDeletionStore = create<AccountDeletionState>((set, get) => ({
  // Initial state
  checkLoading: false,
  canDelete: false,
  blockingOrgs: [],
  orgsToDelete: [],
  otherOrgs: [],
  promotingUserId: null,
  deletingAccount: false,
  error: null,

  // Check if user can delete account
  checkDeletionEligibility: async () => {
    set({ checkLoading: true, error: null });

    try {
      const result = await accountApi.checkDeletionEligibility();

      set({
        canDelete: result.can_delete,
        blockingOrgs: result.blocking_organizations,
        orgsToDelete: result.organizations_to_delete,
        otherOrgs: result.other_organizations,
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

  // Promote a member to admin
  promoteMember: async (orgId: string, userId: string) => {
    set({ promotingUserId: userId, error: null });

    try {
      await accountApi.promoteMember(userId);

      // Re-check eligibility after promotion
      await get().checkDeletionEligibility();

      set({ promotingUserId: null });
    } catch (error: any) {
      console.error('Failed to promote member:', error);
      set({
        error: error.response?.data?.detail || 'Failed to promote member',
        promotingUserId: null,
      });
      throw error; // Re-throw so UI can handle it
    }
  },

  // Delete account
  deleteAccount: async () => {
    const { canDelete } = get();

    if (!canDelete) {
      throw new Error('Cannot delete account. Please resolve blocking organizations first.');
    }

    set({ deletingAccount: true, error: null });

    try {
      await accountApi.deleteAccount();

      // Account deleted successfully
      // The user will be logged out by the backend (token blacklist)
      set({ deletingAccount: false });
    } catch (error: any) {
      console.error('Failed to delete account:', error);
      set({
        error: error.response?.data?.detail || 'Failed to delete account',
        deletingAccount: false,
      });
      throw error; // Re-throw so UI can handle it
    }
  },

  // Reset state
  reset: () => {
    set({
      checkLoading: false,
      canDelete: false,
      blockingOrgs: [],
      orgsToDelete: [],
      otherOrgs: [],
      promotingUserId: null,
      deletingAccount: false,
      error: null,
    });
  },
}));
