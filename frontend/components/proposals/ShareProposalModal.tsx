'use client';

import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { useOrganizationStore } from '@/lib/stores/organizationStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { proposalsApi } from '@/lib/api/proposals';
import { useToast } from '@/lib/hooks/useToast';
import { Users, Share2, Lock, CheckCircle } from 'lucide-react';
import { getUserDisplayName, getUserInitials } from '@/lib/utils/permissions';

interface ShareProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  proposalName: string;
  onSuccess?: () => void;
}

export default function ShareProposalModal({
  isOpen,
  onClose,
  proposalId,
  proposalName,
  onSuccess,
}: ShareProposalModalProps) {
  const toast = useToast();
  const { user } = useAuthStore();
  const { members, fetchMembers } = useOrganizationStore();

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [currentSharedWith, setCurrentSharedWith] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrivate, setIsPrivate] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      fetchAccessInfo();
    }
  }, [isOpen, fetchMembers]);

  const fetchAccessInfo = async () => {
    setIsLoading(true);
    try {
      const accessInfo = await proposalsApi.getAccessInfo(proposalId);
      setIsPrivate(accessInfo.visibility === 'private');
      setCurrentSharedWith(accessInfo.shared_with.map(u => u.id));
      setSelectedUserIds(accessInfo.shared_with.map(u => u.id));
    } catch (error) {
      console.error('Failed to fetch access info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const handleSelectAll = () => {
    const otherUserIds = members
      .filter(m => m.id !== user?.id && m.status === 'active')
      .map(m => m.id);
    setSelectedUserIds(otherUserIds);
  };

  const handleSelectNone = () => {
    setSelectedUserIds([]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (selectedUserIds.length === 0) {
        // Make private
        await proposalsApi.makePrivate(proposalId);
        toast.success('Proposal is now private');
      } else {
        // Share with selected users
        await proposalsApi.shareProposal(proposalId, selectedUserIds);
        toast.success('Proposal shared successfully');
      }

      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to update sharing settings';
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const activeMembers = members.filter(m => m.id !== user?.id && m.status === 'active');
  const hasChanges = JSON.stringify(selectedUserIds.sort()) !== JSON.stringify(currentSharedWith.sort());

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Share Proposal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={!hasChanges}
          >
            {selectedUserIds.length === 0 ? (
              <>
                <Lock className="w-4 h-4 mr-2" />
                Make Private
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Proposal</p>
          <p className="text-sm font-medium text-foreground">{proposalName}</p>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">
              Share with team members
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                disabled={isLoading}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectNone}
                disabled={isLoading}
              >
                Select None
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-xs text-muted-foreground">Loading team members...</p>
            </div>
          ) : activeMembers.length === 0 ? (
            <div className="text-center py-8 bg-muted/30 rounded-lg border border-border">
              <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No other team members found</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {activeMembers.map((member) => {
                const isSelected = selectedUserIds.includes(member.id);

                return (
                  <label
                    key={member.id}
                    className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-primary/5 border-primary/30'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleUser(member.id)}
                      className="mr-3 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <div className="flex items-center gap-3 flex-1">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border border-border text-primary font-semibold text-xs">
                        {getUserInitials(member)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {getUserDisplayName(member)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                      {isSelected && (
                        <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {selectedUserIds.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <p className="text-xs text-blue-700">
              {selectedUserIds.length === 1
                ? '1 team member'
                : `${selectedUserIds.length} team members`}{' '}
              will have access to this proposal
            </p>
          </div>
        )}

        {selectedUserIds.length === 0 && (
          <div className="bg-muted/50 border border-border rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground">
              This proposal will be private (only you can access it)
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
