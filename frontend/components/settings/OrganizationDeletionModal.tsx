/**
 * Organization Deletion Modal
 *
 * Orchestrates the organization deletion flow:
 * 1. Check deletion eligibility
 * 2. Show accounts that will be deleted and members that will be removed
 * 3. Final confirmation (type org name)
 * 4. Delete organization and handle post-deletion redirect
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, AlertTriangle, Loader2, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useOrganizationDeletionStore } from '@/lib/stores/organizationDeletionStore';

interface OrganizationDeletionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OrganizationDeletionModal({
  isOpen,
  onClose
}: OrganizationDeletionModalProps) {
  const router = useRouter();

  const {
    checkLoading,
    organizationName,
    memberCount,
    proposalCount,
    accountsToDelete,
    membersToRemove,
    deletingOrg,
    error: storeError,
    checkDeletionEligibility,
    deleteOrganization,
    reset,
  } = useOrganizationDeletionStore();

  const [confirmText, setConfirmText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Check eligibility when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalError(null);
      setConfirmText('');
      checkDeletionEligibility();
    } else {
      reset();
    }
  }, [isOpen, checkDeletionEligibility, reset]);

  const handleDelete = async () => {
    if (confirmText !== organizationName) {
      setLocalError('Please type the organization name correctly');
      return;
    }

    try {
      const result = await deleteOrganization();

      // If admin's account was deleted
      if (result.admin_account_deleted) {
        // Clear local state (don't call API logout since token is invalid)
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
      } else {
        // Admin has other orgs - switch to another org
        // The backend will auto-switch, so just invalidate cache and refresh
        if (typeof window !== 'undefined') {
          try {
            const { cacheManager } = await import('@/lib/cache');
            cacheManager.invalidate();
          } catch (err) {
            console.error('Failed to clear cache:', err);
          }
        }

        // Redirect to dashboard
        router.push('/dashboard?orgDeleted=true');
      }
    } catch (error: any) {
      setLocalError(error.message || 'Failed to delete organization');
    }
  };

  const handleClose = () => {
    if (!deletingOrg) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const displayError = localError || storeError;
  const currentUserWillBeDeleted = accountsToDelete.some(acc => acc.is_current_user);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Delete Organization</h2>
          <button
            onClick={handleClose}
            disabled={deletingOrg}
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
              <p className="text-sm text-muted-foreground">Checking organization status...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Warning Header */}
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-12 h-12 text-red-600 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-red-600">
                    Delete Organization Permanently?
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    This action cannot be undone
                  </p>
                </div>
              </div>

              {/* Critical Warning - Accounts Will Be Deleted */}
              {accountsToDelete.length > 0 && (
                <div className="p-4 bg-red-50 border-2 border-red-500 rounded-lg">
                  <div className="flex gap-3">
                    <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-red-900 text-lg mb-2">
                        ⚠️ {accountsToDelete.length} Account{accountsToDelete.length > 1 ? 's' : ''} Will Be DELETED
                      </p>
                      <p className="text-sm text-red-800 mb-3">
                        The following {accountsToDelete.length === 1 ? 'member has' : 'members have'} ONLY this organization.
                        Their {accountsToDelete.length === 1 ? 'account' : 'accounts'} will be permanently deleted:
                      </p>
                      <ul className="space-y-2">
                        {accountsToDelete.map((account) => (
                          <li
                            key={account.id}
                            className={`text-sm p-2 rounded ${
                              account.is_current_user
                                ? 'bg-red-100 border border-red-300 font-bold'
                                : 'bg-red-50'
                            }`}
                          >
                            {account.name} ({account.email})
                            {account.is_current_user && (
                              <span className="ml-2 text-red-700">← YOU</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {currentUserWillBeDeleted && (
                        <p className="mt-3 text-sm font-bold text-red-900">
                          YOUR account will be deleted and you will be logged out immediately.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* What Will Be Deleted */}
              <div>
                <p className="font-semibold text-sm mb-2">What will be deleted:</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Organization: <strong>{organizationName}</strong></li>
                  <li><strong>{proposalCount}</strong> proposal{proposalCount !== 1 ? 's' : ''}</li>
                  <li><strong>{accountsToDelete.length}</strong> user account{accountsToDelete.length !== 1 ? 's' : ''} (members with only this org)</li>
                </ul>
              </div>

              {/* Members Who Will Be Removed */}
              {membersToRemove.length > 0 && (
                <div>
                  <p className="font-semibold text-sm mb-2">
                    Members who will be removed (but accounts kept):
                  </p>
                  <div className="p-3 bg-muted rounded-lg">
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      {membersToRemove.map((member) => (
                        <li key={member.id}>
                          {member.name} ({member.email})
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2">
                      These members have other organizations and will remain active.
                    </p>
                  </div>
                </div>
              )}

              {/* Confirmation Input */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Type <strong>{organizationName}</strong> to confirm
                </label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={organizationName}
                  disabled={deletingOrg}
                  className="font-mono"
                />
              </div>

              {/* Error Message */}
              {displayError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  {displayError}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end">
                <Button variant="ghost" onClick={handleClose} disabled={deletingOrg}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  disabled={confirmText !== organizationName || deletingOrg}
                  isLoading={deletingOrg}
                >
                  Delete Organization
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
