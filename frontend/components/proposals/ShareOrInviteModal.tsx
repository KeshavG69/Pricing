import { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { proposalsApi } from '@/lib/api/proposals';
import { organizationsApi } from '@/lib/api/organizations';
import { invitationsApi } from '@/lib/api/invitations';
import { useAuthStore } from '@/lib/stores/authStore';
import { TeamMember } from '@/types';
import { Users, Check, Loader2, Mail, UserPlus } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';

interface ShareOrInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  proposalName: string;
  onSuccess?: () => void;
}

export const ShareOrInviteModal: React.FC<ShareOrInviteModalProps> = ({
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

  // Invite new user state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
      setInviteEmail('');
      setInviteRole('user');
    }
  }, [isOpen, proposalId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [members, accessInfo] = await Promise.all([
        organizationsApi.getMembers(),
        proposalsApi.getAccessInfo(proposalId),
      ]);

      setTeamMembers(members);
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
        await proposalsApi.makePrivate(proposalId);
        toast.success('Proposal is now private');
      } else {
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

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    // Check if email belongs to an existing team member
    const existingMember = teamMembers.find(
      (m) => m.email.toLowerCase() === inviteEmail.toLowerCase().trim()
    );

    if (existingMember) {
      // User already in org - share directly
      setIsInviting(true);
      try {
        const newSelectedIds = new Set(selectedUserIds);
        newSelectedIds.add(existingMember.id);

        await proposalsApi.shareProposal(proposalId, Array.from(newSelectedIds));
        toast.success(`Shared with ${existingMember.firstName} ${existingMember.lastName}`);
        setInviteEmail('');

        // Reload to update UI
        await loadData();
        onSuccess?.();
      } catch (error: any) {
        const errorMessage = error.response?.data?.detail || 'Failed to share proposal';
        toast.error(errorMessage);
      } finally {
        setIsInviting(false);
      }
    } else {
      // User not in org - send invitation with proposal access
      setIsInviting(true);
      try {
        await invitationsApi.sendInvitation({
          email: inviteEmail.trim(),
          role: inviteRole,
          proposal_ids: [proposalId],
        });
        toast.success(`Invitation sent to ${inviteEmail}. They will have access to this proposal when they join.`);
        setInviteEmail('');
        onSuccess?.();
      } catch (error: any) {
        const errorMessage = error.response?.data?.detail || 'Failed to send invitation';
        toast.error(errorMessage);
      } finally {
        setIsInviting(false);
      }
    }
  };

  const handleClose = () => {
    if (!isSaving && !isInviting) {
      onClose();
    }
  };

  // Filter out current user
  const shareableMembers = teamMembers.filter((member) => member.id !== user?.id);

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
        </div>

        {/* Invite new user section */}
        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <UserPlus className="w-4 h-4" />
            <span>Invite by Email</span>
          </div>
          <p className="text-xs text-muted-foreground">
            If the person is already in your organization, they'll get access immediately.
            Otherwise, they'll receive an invitation email.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleInvite();
                }
              }}
              className="flex-1"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'user')}
              className="px-3 py-2 border border-border rounded-md bg-background text-sm"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <Button
              variant="primary"
              onClick={handleInvite}
              disabled={isInviting || !inviteEmail.trim()}
              isLoading={isInviting}
            >
              <Mail className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or share with team members</span>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        {/* Team members list */}
        {!isLoading && shareableMembers.length === 0 && (
          <div className="text-center py-6">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">
              No other team members yet
            </p>
          </div>
        )}

        {!isLoading && shareableMembers.length > 0 && (
          <div className="max-h-[250px] overflow-y-auto space-y-2">
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
                    {isCurrentlyShared && !isSelected && (
                      <span className="text-xs text-muted-foreground">(removing)</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <Button variant="ghost" onClick={handleClose} disabled={isSaving || isInviting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleShare}
            isLoading={isSaving}
            disabled={isLoading || !hasChanges() || isInviting}
          >
            {selectedUserIds.size === 0 ? 'Make Private' : 'Update Sharing'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
