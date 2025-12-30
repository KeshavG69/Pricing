'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useOrganizationStore } from '@/lib/stores/organizationStore';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Dialog from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import RoleBadge from '@/components/ui/RoleBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import { Building, Save, Info, Users, Mail, Plus, Trash2, Clock, CheckCircle, UserX } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { isAdmin, canRemoveUser, getUserDisplayName, getUserInitials } from '@/lib/utils/permissions';
import { OrganizationSettings, InviteUserRequest } from '@/types';
import apiClient from '@/lib/api/client';

type TabType = 'settings' | 'team';

export default function OrganizationPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    organization,
    members,
    invitations,
    fetchOrganization,
    fetchMembers,
    fetchInvitations,
    updateSettings,
    removeMember,
    sendInvitation,
    revokeInvitation,
    isLoading
  } = useOrganizationStore();
  const toast = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('settings');

  // Settings form state
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Team - Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Invitations - Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [isSending, setIsSending] = useState(false);

  // Invitations - Revoke confirmation state
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [invitationToRevoke, setInvitationToRevoke] = useState<{ id: string; email: string } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Organization name editing state
  const [editingOrgName, setEditingOrgName] = useState(false);
  const [orgNameInput, setOrgNameInput] = useState('');
  const [isSavingOrgName, setIsSavingOrgName] = useState(false);

  useEffect(() => {
    // Redirect non-admins
    if (user && !isAdmin(user)) {
      router.push('/dashboard');
      return;
    }

    // Fetch data
    if (user) {
      fetchOrganization();
      fetchMembers();
      fetchInvitations();
    }
  }, [user, router, fetchOrganization, fetchMembers, fetchInvitations]);

  useEffect(() => {
    if (organization?.settings) {
      setSettings(organization.settings);
    }
  }, [organization]);

  // Settings handlers
  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      const { default_rates, default_escalation_rate, allow_user_rate_override } = settings;
      await updateSettings({
        default_rates,
        default_escalation_rate,
        allow_user_rate_override,
      });
      toast.success('Settings updated successfully');
      setHasChanges(false);
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Organization name handler
  const handleSaveOrgName = async () => {
    const trimmedInput = orgNameInput.trim();

    // Don't save if input is empty or unchanged
    if (!trimmedInput || trimmedInput === organization?.name) {
      setEditingOrgName(false);
      setOrgNameInput('');
      return;
    }

    setIsSavingOrgName(true);
    try {
      await updateSettings({ name: trimmedInput });
      toast.success('Organization name updated successfully');
      setEditingOrgName(false);
      setOrgNameInput('');
    } catch {
      toast.error('Failed to update organization name');
    } finally {
      setIsSavingOrgName(false);
    }
  };

  // Team handlers
  const handleRemoveClick = (id: string, name: string) => {
    setMemberToDelete({ id, name });
    setDeleteConfirmOpen(true);
  };

  const handleRemoveConfirm = async () => {
    if (!memberToDelete) return;

    setIsDeleting(true);
    try {
      await removeMember(memberToDelete.id);
      toast.success('Team member removed successfully');
      setDeleteConfirmOpen(false);
      setMemberToDelete(null);
    } catch (error) {
      toast.error('Failed to remove team member');
    } finally {
      setIsDeleting(false);
    }
  };

  // Invitations handlers
  const handleSendInvitation = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSending(true);
    try {
      const data: InviteUserRequest = {
        email: inviteEmail.trim(),
        role: inviteRole,
      };
      await sendInvitation(data);
      toast.success('Invitation sent successfully');
      setInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole('user');
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to send invitation';
      toast.error(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  const handleRevokeClick = (id: string, email: string) => {
    setInvitationToRevoke({ id, email });
    setRevokeConfirmOpen(true);
  };

  const handleRevokeConfirm = async () => {
    if (!invitationToRevoke) return;

    setIsRevoking(true);
    try {
      await revokeInvitation(invitationToRevoke.id);
      toast.success('Invitation revoked successfully');
      setRevokeConfirmOpen(false);
      setInvitationToRevoke(null);
    } catch (error) {
      toast.error('Failed to revoke invitation');
    } finally {
      setIsRevoking(false);
    }
  };

  // Helpers
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Show loading state
  if (!user || !isAdmin(user) || !settings || !organization) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  const pendingInvitations = invitations.filter((inv) => inv.status === 'pending');

  return (
    <DashboardLayout>
      <div className="space-y-2 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Organization</h1>
            <p className="text-muted-foreground">
              Manage organization settings, team members, and invitations
            </p>
          </div>
          {activeTab === 'settings' && (
            <Button
              variant="primary"
              onClick={handleSave}
              isLoading={isSaving}
              disabled={!hasChanges}
              className="shadow-md shadow-primary/10"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          )}
          {activeTab === 'team' && (
            <Button
              variant="primary"
              onClick={() => setInviteModalOpen(true)}
              className="shadow-md shadow-primary/10"
            >
              <Plus className="w-4 h-4 mr-2" />
              Send Invitation
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-border">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'settings'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Building className="w-4 h-4 inline-block mr-2" />
              Settings
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'team'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Users className="w-4 h-4 inline-block mr-2" />
              Team ({members.length + pendingInvitations.length})
            </button>
          </nav>
        </div>

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Organization Info */}
            <Card>
              <CardHeader>
                <CardTitle>Organization Information</CardTitle>
                <CardDescription>
                  Basic details about your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Organization Name
                    </label>
                    {!editingOrgName ? (
                      <div
                        className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                        onDoubleClick={() => {
                          if (user && isAdmin(user)) {
                            setEditingOrgName(true);
                            setOrgNameInput(organization.name);
                          }
                        }}
                        title={user && isAdmin(user) ? "Double-click to edit" : ""}
                      >
                        <Building className="w-5 h-5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground flex-1">{organization.name}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg">
                        <Building className="w-5 h-5 text-muted-foreground" />
                        <Input
                          value={orgNameInput}
                          onChange={(e) => setOrgNameInput(e.target.value)}
                          onBlur={handleSaveOrgName}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveOrgName();
                            } else if (e.key === 'Escape') {
                              setEditingOrgName(false);
                              setOrgNameInput('');
                            }
                          }}
                          placeholder="Enter organization name"
                          autoFocus
                          className="flex-1 border-none focus:ring-0 bg-transparent"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Info Banner */}
            {hasChanges && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 mb-1">
                    You have unsaved changes
                  </p>
                  <p className="text-xs text-blue-700">
                    Click "Save Changes" to apply your updates to the organization settings.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Team Tab */}
        {activeTab === 'team' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="hover-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">Total</span>
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-1">{members.length + pendingInvitations.length}</p>
                  <p className="text-sm text-muted-foreground">Members + Invitations</p>
                </CardContent>
              </Card>

              <Card className="hover-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Active</span>
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {members.length}
                  </p>
                  <p className="text-sm text-muted-foreground">Active members</p>
                </CardContent>
              </Card>

              <Card className="hover-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-orange-600" />
                    </div>
                    <span className="text-xs font-medium text-orange-700 bg-orange-100 px-2 py-1 rounded-full">Pending</span>
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {pendingInvitations.length}
                  </p>
                  <p className="text-sm text-muted-foreground">Awaiting response</p>
                </CardContent>
              </Card>
            </div>

            {/* Team List */}
            <Card>
              <CardHeader>
                <CardTitle>Team</CardTitle>
                <CardDescription>
                  Active members and pending invitation requests
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-4 animate-pulse text-muted-foreground/50" />
                    Loading team...
                  </div>
                ) : members.length === 0 && pendingInvitations.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                      <Users className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">No team members yet</h3>
                    <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                      Invite team members to start collaborating on proposals.
                    </p>
                    <Button variant="primary" onClick={() => setInviteModalOpen(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Send Invitation
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Name / Email
                          </th>
                          <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Role
                          </th>
                          <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Status
                          </th>
                          <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Date
                          </th>
                          <th className="text-right py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {/* Active Members */}
                        {members.map((member) => {
                          const canRemove = canRemoveUser(user, member, organization?.owner_id);
                          const isCurrentUser = member.id === user.id;

                          return (
                            <tr
                              key={member.id}
                              className="hover:bg-muted/30 transition-colors"
                            >
                              <td className="py-4 px-6">
                                <div className="flex items-center space-x-3">
                                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-border text-primary font-semibold text-sm">
                                    {getUserInitials(member)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-foreground">
                                      {getUserDisplayName(member)}
                                      {isCurrentUser && (
                                        <span className="ml-2 text-xs text-muted-foreground">(You)</span>
                                      )}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{member.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-6">
                                <RoleBadge role={member.role} />
                              </td>
                              <td className="py-4 px-6">
                                <StatusBadge status={member.status} />
                              </td>
                              <td className="py-4 px-6">
                                <span className="text-sm text-muted-foreground">
                                  {member.joinedAt ? formatDate(member.joinedAt) : 'N/A'}
                                </span>
                              </td>
                              <td className="py-4 px-6">
                                <div className="flex items-center justify-end gap-2">
                                  {canRemove ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveClick(member.id, getUserDisplayName(member))}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <UserX className="w-4 h-4 mr-1" />
                                      Remove
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground px-3">
                                      {isCurrentUser ? "Can't remove yourself" : "Owner"}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Pending Invitations */}
                        {pendingInvitations.map((invitation) => (
                          <tr
                            key={`invite-${invitation.id}`}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-4 px-6">
                              <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center border border-orange-200">
                                  <Mail className="w-5 h-5 text-orange-600" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{invitation.email}</p>
                                  <p className="text-xs text-muted-foreground">
                                    Invited by {invitation.invited_by_name}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <RoleBadge role={invitation.role} />
                            </td>
                            <td className="py-4 px-6">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                                <Clock className="w-3 h-3" />
                                Pending
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <span className="text-sm text-muted-foreground">
                                {formatDate(invitation.createdAt)}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRevokeClick(invitation.id, invitation.email)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Revoke
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Delete Team Member Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleRemoveConfirm}
        title="Remove Team Member?"
        message={`Are you sure you want to remove ${memberToDelete?.name} from your organization? They will lose access to all proposals and data.`}
        confirmText="Remove"
        confirmVariant="danger"
        isLoading={isDeleting}
      />

      {/* Invite Member Dialog */}
      <Dialog
        isOpen={inviteModalOpen}
        onClose={() => {
          setInviteModalOpen(false);
          setInviteEmail('');
          setInviteRole('user');
        }}
        title="Invite Team Member"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setInviteModalOpen(false);
                setInviteEmail('');
                setInviteRole('user');
              }}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSendInvitation}
              isLoading={isSending}
              disabled={!inviteEmail.trim()}
            >
              <Mail className="w-4 h-4 mr-2" />
              Send Invitation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Send an invitation email to a new team member. They'll receive a link to create their account and join your organization.
          </p>

          <Input
            label="Email Address"
            type="email"
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Role
            </label>
            <div className="space-y-2">
              <label className="flex items-center p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="role"
                  value="user"
                  checked={inviteRole === 'user'}
                  onChange={(e) => setInviteRole('user')}
                  className="mr-3"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">User</p>
                    <RoleBadge role="user" size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Can create and manage their own proposals
                  </p>
                </div>
              </label>

              <label className="flex items-center p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  checked={inviteRole === 'admin'}
                  onChange={(e) => setInviteRole('admin')}
                  className="mr-3"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">Admin</p>
                    <RoleBadge role="admin" size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Full access to manage team, settings, and all proposals
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Revoke Invitation Confirmation Dialog */}
      <ConfirmDialog
        isOpen={revokeConfirmOpen}
        onClose={() => setRevokeConfirmOpen(false)}
        onConfirm={handleRevokeConfirm}
        title="Revoke Invitation?"
        message={`Are you sure you want to revoke the invitation for ${invitationToRevoke?.email}? They will no longer be able to use this invitation link.`}
        confirmText="Revoke"
        confirmVariant="danger"
        isLoading={isRevoking}
      />
    </DashboardLayout>
  );
}
