/**
 * Account Deletion Modal
 *
 * Orchestrates the account deletion flow:
 * 1. Check deletion eligibility
 * 2. Show blocking organizations (if any) and resolution options
 * 3. Show final confirmation (if no blocking orgs)
 * 4. Delete account and log out user
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { useAccountDeletionStore } from '@/lib/stores/accountDeletionStore';
import { useAuthStore } from '@/lib/stores/authStore';
import BlockingOrgCard from './BlockingOrgCard';
import FinalDeletionConfirm from './FinalDeletionConfirm';

interface AccountDeletionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountDeletionModal({ isOpen, onClose }: AccountDeletionModalProps) {
  const router = useRouter();

  const {
    checkLoading,
    canDelete,
    blockingOrgs,
    orgsToDelete,
    otherOrgs,
    promotingUserId,
    deletingAccount,
    error: storeError,
    checkDeletionEligibility,
    promoteMember,
    deleteAccount,
    reset,
  } = useAccountDeletionStore();

  const [localError, setLocalError] = useState<string | null>(null);

  // Check eligibility when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalError(null);
      checkDeletionEligibility();
    } else {
      // Reset state when modal closes
      reset();
    }
  }, [isOpen, checkDeletionEligibility, reset]);

  const handlePromote = async (orgId: string, userId: string) => {
    try {
      await promoteMember(orgId, userId);
      // Successfully promoted - checkDeletionEligibility is called automatically
    } catch (error: any) {
      setLocalError(error.message || 'Failed to promote member');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAccount();

      // Account deleted successfully
      // Clear local state (don't call API logout since token is now invalid)
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');

      // Clear cache
      if (typeof window !== 'undefined') {
        try {
          const { cacheManager } = await import('@/lib/cache');
          cacheManager.invalidate();
        } catch (err) {
          console.error('Failed to clear cache:', err);
        }
      }

      // Redirect to login
      router.push('/auth/login?deleted=true');
    } catch (error: any) {
      setLocalError(error.message || 'Failed to delete account');
    }
  };

  const handleClose = () => {
    if (!deletingAccount && !promotingUserId) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const displayError = localError || storeError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Delete Account</h2>
          <button
            onClick={handleClose}
            disabled={deletingAccount || !!promotingUserId}
            className="p-1 hover:bg-muted rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {checkLoading ? (
            // Loading State
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Checking account status...</p>
            </div>
          ) : canDelete ? (
            // Can Delete - Show Final Confirmation
            <FinalDeletionConfirm
              orgsToDelete={orgsToDelete}
              otherOrgs={otherOrgs}
              onConfirm={handleDelete}
              onCancel={handleClose}
              isDeleting={deletingAccount}
            />
          ) : (
            // Cannot Delete - Show Blocking Organizations
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg">Before You Go...</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    You are the last admin in {blockingOrgs.length} organization(s).
                    You must resolve these before deleting your account.
                  </p>
                </div>
              </div>

              {/* Blocking Organizations */}
              <div className="space-y-4">
                {blockingOrgs.map((org) => (
                  <BlockingOrgCard
                    key={org.id}
                    org={org}
                    onPromote={handlePromote}
                    isPromoting={promotingUserId === org.can_promote_members[0]?.id}
                  />
                ))}
              </div>

              {/* Other Organizations Info */}
              {otherOrgs.length > 0 && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">
                    You will also be removed from:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    {otherOrgs.map((org) => (
                      <li key={org.id}>
                        {org.name} ({org.role})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {displayError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {displayError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
