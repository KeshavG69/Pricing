'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useOrganizationStore } from '@/lib/stores/organizationStore';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import RoleBadge from '@/components/ui/RoleBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import { Users, Trash2, Mail, Shield, UserX } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { isAdmin, canRemoveUser, getUserDisplayName, getUserInitials } from '@/lib/utils/permissions';

export default function TeamPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { organization, members, fetchOrganization, fetchMembers, removeMember, isLoading } = useOrganizationStore();
  const toast = useToast();

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // Redirect non-admins
    if (user && !isAdmin(user)) {
      router.push('/dashboard');
      return;
    }

    // Fetch organization and members
    if (user) {
      fetchOrganization();
      fetchMembers();
    }
  }, [user, router, fetchOrganization, fetchMembers]);

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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Show loading state
  if (!user || !isAdmin(user)) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Team Management</h1>
            <p className="text-muted-foreground">
              Manage your organization's team members and their roles
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => router.push('/dashboard/invitations')}
            className="shadow-md shadow-primary/10"
          >
            <Mail className="w-4 h-4 mr-2" />
            Invite Members
          </Button>
        </div>

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
              <p className="text-3xl font-bold text-foreground mb-1">{members.length}</p>
              <p className="text-sm text-muted-foreground">Team members</p>
            </CardContent>
          </Card>

          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Active</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">
                {members.filter((m) => m.status === 'active').length}
              </p>
              <p className="text-sm text-muted-foreground">Active members</p>
            </CardContent>
          </Card>

          <Card className="hover-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-1 rounded-full">Admins</span>
              </div>
              <p className="text-3xl font-bold text-foreground mb-1">
                {members.filter((m) => m.role === 'admin').length}
              </p>
              <p className="text-sm text-muted-foreground">Admin users</p>
            </CardContent>
          </Card>
        </div>

        {/* Team Members List */}
        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Manage your team members and their roles
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-4 animate-pulse text-muted-foreground/50" />
                Loading team members...
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-16">
                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                  <Users className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No team members yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  Invite team members to start collaborating on proposals.
                </p>
                <Button variant="primary" onClick={() => router.push('/dashboard/invitations')}>
                  <Mail className="w-4 h-4 mr-2" />
                  Send Invitation
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Member
                      </th>
                      <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Role
                      </th>
                      <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="text-right py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
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
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
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
    </DashboardLayout>
  );
}
