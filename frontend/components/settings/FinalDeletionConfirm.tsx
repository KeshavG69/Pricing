/**
 * Final Deletion Confirmation Modal
 *
 * Shows final warning and requires typing "DELETE" to confirm account deletion.
 * Displayed after all blocking organizations have been resolved.
 */

'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import { SimpleOrg } from '@/lib/api/account';

interface FinalDeletionConfirmProps {
  orgsToDelete: SimpleOrg[];
  otherOrgs: SimpleOrg[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isDeleting: boolean;
}

export default function FinalDeletionConfirm({
  orgsToDelete,
  otherOrgs,
  onConfirm,
  onCancel,
  isDeleting,
}: FinalDeletionConfirmProps) {
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (confirmText !== 'DELETE') {
      setError('Please type DELETE to confirm');
      return;
    }

    setError(null);

    try {
      await onConfirm();
      // Success - user will be logged out and redirected
    } catch (error: any) {
      setError(error.message || 'Failed to delete account');
    }
  };

  return (
    <div className="space-y-6">
      {/* Warning Header */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <AlertTriangle className="w-12 h-12 text-red-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-red-600">Delete Account Permanently?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            This action cannot be undone
          </p>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-red-900">This action cannot be undone</p>
          <p className="text-sm text-red-800 mt-1">
            Your account will be permanently deleted and you will be logged out immediately.
          </p>
        </div>
      </div>

      {/* What Will Be Deleted */}
      <div>
        <p className="font-semibold text-sm mb-2">What will be deleted:</p>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>Your profile information</li>
          <li>Your login credentials</li>
          <li>Access to all organizations</li>
          {orgsToDelete.length > 0 && (
            <li>
              <strong className="text-red-600">
                {orgsToDelete.length} organization{orgsToDelete.length > 1 ? 's' : ''} where you
                are the sole member
              </strong>{' '}
              (including all proposals)
            </li>
          )}
        </ul>
        {orgsToDelete.length > 0 && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-900 mb-1">
              Organizations that will be permanently deleted:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
              {orgsToDelete.map((org) => (
                <li key={org.id}>{org.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* What Will Be Kept */}
      <div>
        <p className="font-semibold text-sm mb-2">What will be kept (GDPR compliance):</p>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>Proposals you created (anonymized as "Deleted User")</li>
          <li>Billing records (required for tax/audit)</li>
        </ul>
      </div>

      {/* Organizations You'll Be Removed From */}
      {otherOrgs.length > 0 && (
        <div>
          <p className="font-semibold text-sm mb-2">
            You will be removed from these organizations:
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

      {/* Confirmation Input */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Type <strong>DELETE</strong> to confirm
        </label>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          disabled={isDeleting}
          className="font-mono"
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={handleConfirm}
          disabled={confirmText !== 'DELETE' || isDeleting}
          isLoading={isDeleting}
        >
          Delete My Account
        </Button>
      </div>
    </div>
  );
}
