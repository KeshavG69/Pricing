'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useOrganizationStore } from '@/lib/stores/organizationStore';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import RoleBadge from '@/components/ui/RoleBadge';
import { Mail, Plus, Trash2, Clock, CheckCircle, XCircle, UserPlus } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { isAdmin } from '@/lib/utils/permissions';
import { InviteUserRequest } from '@/types';

export default function InvitationsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { invitations, fetchInvitations, sendInvitation, revokeInvitation, isLoading } = useOrganizationStore();
  const toast = useToast();

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [isSending, setIsSending] = useState(false);

  // Revoke confirmation state
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [invitationToRevoke, setInvitationToRevoke] = useState<{ id: string; email: string } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    // Redirect non-admins
    if (user && !isAdmin(user)) {
      router.push('/dashboard');
      return;
    }

    // Fetch invitations
    if (user) {
      fetchInvitations();
    }
  }, [user, router, fetchInvitations]);

  const handleSendInvitation = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    // Simple email validation
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'accepted':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'expired':
      case 'revoked':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            Pending
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            Accepted
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
            Expired
          </span>
        );
      case 'revoked':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            Revoked
          </span>
        );
      default:
        return null;
    }
  };

  // Show loading state
  if (!user || !isAdmin(user)) {
    return null;
  }

  const pendingInvitations = invitations.filter((inv) => inv.status === 'pending');

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Invitations</h1>
            <p className="text-muted-foreground">
              Invite new team members to join your organization
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => setInviteModalOpen(true)}
            className="shadow-md shadow-primary/10"
          >
            <Plus className="w-4 h-4 mr-2" />
            Send Invitation
          </Button>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">Pending</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">{pendingInvitations.length}</p>
              <p className="text-sm text-muted-foreground">Awaiting response</p>
            </CardContent>
          </Card>

          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Accepted</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">
                {invitations.filter((inv) => inv.status === 'accepted').length}
              </p>
              <p className="text-sm text-muted-foreground">Joined successfully</p>
            </CardContent>
          </Card>

          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">Total</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">{invitations.length}</p>
              <p className="text-sm text-muted-foreground">All invitations</p>
            </CardContent>
          </Card>
        </div>

        {/* Invitations List */}
        <Card>
          <CardHeader>
            <CardTitle>All Invitations</CardTitle>
            <CardDescription>
              Manage sent invitations and their status
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                <Mail className="w-8 h-8 mx-auto mb-4 animate-pulse text-muted-foreground/50" />
                Loading invitations...
              </div>
            ) : invitations.length === 0 ? (
              <div className="text-center py-16">
                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                  <Mail className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No invitations yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  Start by sending an invitation to a team member.
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
                        Email
                      </th>
                      <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Role
                      </th>
                      <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Invited By
                      </th>
                      <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Expires
                      </th>
                      <th className="text-right py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invitations.map((invitation) => (
                      <tr
                        key={invitation.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-border">
                              <Mail className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{invitation.email}</p>
                              <p className="text-xs text-muted-foreground">
                                Sent {formatDate(invitation.created_at)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <RoleBadge role={invitation.role} />
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(invitation.status)}
                            {getStatusBadge(invitation.status)}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-sm text-muted-foreground">
                            {invitation.invited_by_name}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-sm text-muted-foreground">
                            {formatDate(invitation.expires_at)}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-end gap-2">
                            {invitation.status === 'pending' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRevokeClick(invitation.id, invitation.email)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Revoke
                              </Button>
                            )}
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

      {/* Invite Modal */}
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
              <UserPlus className="w-4 h-4 mr-2" />
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

      {/* Revoke Confirmation Dialog */}
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
