import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { proposalsApi } from '@/lib/api/proposals';
import { organizationsApi } from '@/lib/api/organizations';
import { useAuthStore } from '@/lib/stores/authStore';
import { TeamMember } from '@/types';
import { Users, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';

interface ShareProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  proposalName: string;
  onSuccess?: () => void;
}

export const ShareProposalModal: React.FC<ShareProposalModalProps> = ({
  isOpen,
  onClose,
  proposalId,
  proposalName,
  onSuccess,
}) => {
  const toast = useToast();
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [currentSharedWith, setCurrentSharedWith] = useState<Set<string>>(new Set());
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, proposalId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Fetch team members and current access info in parallel
      const [members, accessInfo] = await Promise.all([
        organizationsApi.getMembers(),
        proposalsApi.getAccessInfo(proposalId),
      ]);

      setTeamMembers(members);
      setIsOwner(accessInfo.is_owner);

      // Set currently shared users
      const sharedIds = new Set(accessInfo.shared_with.map((u) => u.id));
      setCurrentSharedWith(sharedIds);
      setSelectedUserIds(new Set(sharedIds));
    } catch (error: any) {
      toast.error('Failed to load team members');
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleShare = async () => {
    setIsSaving(true);
    try {
      const userIdsArray = Array.from(selectedUserIds);

      if (userIdsArray.length === 0) {
        // Make private if no users selected
        await proposalsApi.makePrivate(proposalId);
        toast.success('Proposal is now private');
      } else {
        // Share with selected users
        await proposalsApi.shareProposal(proposalId, userIdsArray);
        toast.success('Proposal shared successfully');
      }

      onSuccess?.();
      onClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to share proposal';
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  // Filter out current user from team members list
  const shareableMembers = teamMembers.filter((member) => {
    // Don't show the current user (they already have access as owner/admin)
    return member.id !== user?.id;
  });

  const hasChanges = () => {
    if (selectedUserIds.size !== currentSharedWith.size) return true;
    for (const id of selectedUserIds) {
      if (!currentSharedWith.has(id)) return true;
    }
    return false;
  };

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title="Share Proposal">
      <div className="space-y-4">
        {/* Proposal name */}
        <div className="bg-muted/50 rounded-lg p-3 border border-border">
          <p className="text-sm font-medium text-foreground">{proposalName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Select team members to share this proposal with
          </p>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        {/* Team members list */}
        {!isLoading && shareableMembers.length === 0 && (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No other team members to share with
            </p>
          </div>
        )}

        {!isLoading && shareableMembers.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {shareableMembers.map((member) => {
              const isSelected = selectedUserIds.has(member.id);
              const isCurrentlyShared = currentSharedWith.has(member.id);

              return (
                <button
                  key={member.id}
                  onClick={() => toggleUser(member.id)}
                  disabled={member.status !== 'active'}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    member.status !== 'active'
                      ? 'opacity-50 cursor-not-allowed bg-muted/30'
                      : isSelected
                      ? 'border-primary bg-primary/5 hover:bg-primary/10'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-primary border-primary'
                        : 'border-muted-foreground bg-background'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>

                  {/* Member info */}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-foreground">
                      {member.firstName} {member.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>

                  {/* Status badges */}
                  <div className="flex items-center gap-2">
                    {member.role === 'admin' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                        Admin
                      </span>
                    )}
                    {member.status !== 'active' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                        {member.status}
                      </span>
                    )}
                    {isCurrentlyShared && !isSelected && (
                      <span className="text-xs text-muted-foreground">(removing)</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Info message */}
        {!isLoading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700">
              {selectedUserIds.size === 0
                ? 'No team members selected. Proposal will be private.'
                : `Sharing with ${selectedUserIds.size} team member${
                    selectedUserIds.size === 1 ? '' : 's'
                  }.`}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleShare}
            isLoading={isSaving}
            disabled={isLoading || !hasChanges()}
          >
            {selectedUserIds.size === 0 ? 'Make Private' : 'Share'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
