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
import { Building, Save, Info, Users, Mail, Plus, Trash2, Clock, CheckCircle, XCircle, UserPlus, UserX, Shield } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { isAdmin, canRemoveUser, getUserDisplayName, getUserInitials } from '@/lib/utils/permissions';
import { OrganizationSettings, InviteUserRequest } from '@/types';
import apiClient from '@/lib/api/client';

type TabType = 'settings' | 'team' | 'invitations';

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

  // Preset dialog state
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetRates, setPresetRates] = useState({
    fringe: 0,
    oh: 0,
    ga: 0,
    fee: 0,
    smh: 0,
    sub_fee: 0,
    ga_passthrough: 0,
  });

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

  const updateDefaultRate = (key: string, value: string) => {
    if (!settings) return;

    if (value === '') {
      setSettings({
        ...settings,
        default_rates: {
          ...settings.default_rates,
          [key]: 0,
        },
      });
      setHasChanges(true);
      return;
    }

    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setSettings({
        ...settings,
        default_rates: {
          ...settings.default_rates,
          [key]: numValue / 100,
        },
      });
      setHasChanges(true);
    }
  };

  const updateDefaultEscalationRate = (value: string) => {
    if (!settings) return;

    if (value === '') {
      setSettings({
        ...settings,
        default_escalation_rate: 0,
      });
      setHasChanges(true);
      return;
    }

    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setSettings({
        ...settings,
        default_escalation_rate: numValue / 100,
      });
      setHasChanges(true);
    }
  };

  const toggleUserRateOverride = () => {
    if (!settings) return;

    setSettings({
      ...settings,
      allow_user_rate_override: !settings.allow_user_rate_override,
    });
    setHasChanges(true);
  };

  const handleCreatePreset = async () => {
    if (!settings || !presetName.trim()) return;

    try {
      const response = await apiClient.post('/organizations/me/rate-presets', {
        name: presetName.trim(),
        fringe: presetRates.fringe / 100,
        oh: presetRates.oh / 100,
        ga: presetRates.ga / 100,
        fee: presetRates.fee / 100,
        smh: presetRates.smh / 100,
        sub_fee: presetRates.sub_fee / 100,
        ga_passthrough: presetRates.ga_passthrough / 100,
      });

      setSettings({
        ...settings,
        rate_presets: [...(settings.rate_presets || []), response.data],
      });

      toast.success(`Preset "${presetName}" created successfully`);
      setShowPresetDialog(false);
      setPresetName('');
      setPresetRates({
        fringe: 0,
        oh: 0,
        ga: 0,
        fee: 0,
        smh: 0,
        sub_fee: 0,
        ga_passthrough: 0,
      });
      await fetchOrganization();
    } catch (error) {
      console.error('Create preset error:', error);
      toast.error('Failed to create preset');
    }
  };

  const handleDeletePreset = async (presetId: string, presetName: string) => {
    if (!settings) return;
    if (!confirm(`Delete preset "${presetName}"? This action cannot be undone.`)) return;

    try {
      await apiClient.delete(`/organizations/me/rate-presets/${presetId}`);

      setSettings({
        ...settings,
        rate_presets: settings.rate_presets?.filter(p => p.id !== presetId) || [],
      });

      toast.success(`Preset "${presetName}" deleted successfully`);
      await fetchOrganization();
    } catch (error) {
      console.error('Delete preset error:', error);
      toast.error('Failed to delete preset');
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

  const toPercentageDisplay = (decimal: number): number => {
    return Math.round(decimal * 10000) / 100;
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
              onClick={() => {
                setActiveTab('invitations');
                setInviteModalOpen(true);
              }}
              className="shadow-md shadow-primary/10"
            >
              <Mail className="w-4 h-4 mr-2" />
              Invite Members
            </Button>
          )}
          {activeTab === 'invitations' && (
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
              Team ({members.length})
            </button>
            <button
              onClick={() => setActiveTab('invitations')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'invitations'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Mail className="w-4 h-4 inline-block mr-2" />
              Invitations ({pendingInvitations.length})
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
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg">
                      <Building className="w-5 h-5 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">{organization.name}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Subscription Plan
                    </label>
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        {organization.subscription.plan.toUpperCase()}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {organization.subscription.seats} seats
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Default Indirect Rates */}
            <Card>
              <CardHeader>
                <CardTitle>Default Indirect Rates</CardTitle>
                <CardDescription>
                  Default rates applied to all new proposals
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <Input
                    label="Fringe Rate"
                    type="number"
                    value={toPercentageDisplay(settings.default_rates.fringe)}
                    onChange={(e) => updateDefaultRate('fringe', e.target.value)}
                    placeholder="24.70"
                    suffix="%"
                  />
                  <Input
                    label="Overhead (OH) Rate"
                    type="number"
                    value={toPercentageDisplay(settings.default_rates.oh)}
                    onChange={(e) => updateDefaultRate('oh', e.target.value)}
                    placeholder="7.11"
                    suffix="%"
                  />
                  <Input
                    label="G&A Rate"
                    type="number"
                    value={toPercentageDisplay(settings.default_rates.ga)}
                    onChange={(e) => updateDefaultRate('ga', e.target.value)}
                    placeholder="22.43"
                    suffix="%"
                  />
                  <Input
                    label="Fee Rate (Prime Labor)"
                    type="number"
                    value={toPercentageDisplay(settings.default_rates.fee)}
                    onChange={(e) => updateDefaultRate('fee', e.target.value)}
                    placeholder="7.00"
                    suffix="%"
                  />
                  <Input
                    label="S&MH Rate (Subcontractor)"
                    type="number"
                    value={toPercentageDisplay(settings.default_rates.smh)}
                    onChange={(e) => updateDefaultRate('smh', e.target.value)}
                    placeholder="6.50"
                    suffix="%"
                  />
                  <Input
                    label="Fee Rate (Sub Labor)"
                    type="number"
                    value={toPercentageDisplay(settings.default_rates.sub_fee)}
                    onChange={(e) => updateDefaultRate('sub_fee', e.target.value)}
                    placeholder="5.00"
                    suffix="%"
                  />
                  <Input
                    label="G&A Passthrough Rate"
                    type="number"
                    value={toPercentageDisplay(settings.default_rates.ga_passthrough)}
                    onChange={(e) => updateDefaultRate('ga_passthrough', e.target.value)}
                    placeholder="2.50"
                    suffix="%"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Rate Presets */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Rate Presets</CardTitle>
                    <CardDescription>
                      Create reusable rate templates that can be quickly applied in pricing workspaces
                    </CardDescription>
                  </div>
                  <button
                    onClick={() => setShowPresetDialog(true)}
                    className="flex items-center justify-center w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
                    title="Add new preset"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {settings.rate_presets && settings.rate_presets.length > 0 ? (
                  <div className="space-y-3">
                    {settings.rate_presets.map((preset) => (
                      <div
                        key={preset.id}
                        className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-foreground">{preset.name}</h4>
                          <button
                            onClick={() => handleDeletePreset(preset.id, preset.name)}
                            className="text-red-600 hover:text-red-700 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">Fringe: </span>
                            <span className="font-mono font-semibold">{toPercentageDisplay(preset.fringe)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">OH: </span>
                            <span className="font-mono font-semibold">{toPercentageDisplay(preset.oh)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">G&A: </span>
                            <span className="font-mono font-semibold">{toPercentageDisplay(preset.ga)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fee: </span>
                            <span className="font-mono font-semibold">{toPercentageDisplay(preset.fee)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">S&MH: </span>
                            <span className="font-mono font-semibold">{toPercentageDisplay(preset.smh)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Sub Fee: </span>
                            <span className="font-mono font-semibold">{toPercentageDisplay(preset.sub_fee)}%</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">G&A Pass: </span>
                            <span className="font-mono font-semibold">{toPercentageDisplay(preset.ga_passthrough)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No rate presets created yet.</p>
                    <p className="text-sm mt-1">Click the + button above to create your first preset.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Default Escalation Rate */}
            <Card>
              <CardHeader>
                <CardTitle>Default Escalation Rate</CardTitle>
                <CardDescription>
                  Default year-over-year escalation rate for labor costs (can be customized per proposal)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-md">
                  <Input
                    label="Annual Escalation Rate"
                    type="number"
                    value={toPercentageDisplay(settings.default_escalation_rate || 0)}
                    onChange={(e) => updateDefaultEscalationRate(e.target.value)}
                    placeholder="3.00"
                    suffix="%"
                  />
                  <p className="mt-2 text-xs text-muted-foreground flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    This rate will be used as the default for all year-to-year escalations. You can customize rates for each year when creating proposals.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Additional Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Settings</CardTitle>
                <CardDescription>
                  Other organization preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground mb-1">
                        Allow User Rate Overrides
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Allow non-admin users to override default rates in their proposals
                      </p>
                    </div>
                    <button
                      onClick={toggleUserRateOverride}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                        settings.allow_user_rate_override ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          settings.allow_user_rate_override ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
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
                    <Button variant="primary" onClick={() => { setActiveTab('invitations'); setInviteModalOpen(true); }}>
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
        )}

        {/* Invitations Tab */}
        {activeTab === 'invitations' && (
          <div className="space-y-6">
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
                                    Sent {formatDate(invitation.createdAt)}
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
                                {formatDate(invitation.expiresAt)}
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
        )}
      </div>

      {/* Create Preset Dialog */}
      <Dialog
        isOpen={showPresetDialog}
        onClose={() => {
          setShowPresetDialog(false);
          setPresetName('');
          setPresetRates({
            fringe: 0,
            oh: 0,
            ga: 0,
            fee: 0,
            smh: 0,
            sub_fee: 0,
            ga_passthrough: 0,
          });
        }}
        title="Create New Rate Preset"
        size="lg"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowPresetDialog(false);
                setPresetName('');
                setPresetRates({
                  fringe: 0,
                  oh: 0,
                  ga: 0,
                  fee: 0,
                  smh: 0,
                  sub_fee: 0,
                  ga_passthrough: 0,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreatePreset}
              disabled={!presetName.trim()}
            >
              Create Preset
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a reusable rate template that can be quickly applied in pricing workspaces.
          </p>

          <Input
            label="Preset Name"
            placeholder='e.g., "Federal Contract", "Commercial", "Non-Profit"'
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            autoFocus
          />

          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground mb-3">Rate Values</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Fringe Rate"
                type="number"
                value={presetRates.fringe || ''}
                onChange={(e) => setPresetRates({ ...presetRates, fringe: parseFloat(e.target.value) || 0 })}
                placeholder="24.70"
                suffix="%"
              />
              <Input
                label="Overhead (OH) Rate"
                type="number"
                value={presetRates.oh || ''}
                onChange={(e) => setPresetRates({ ...presetRates, oh: parseFloat(e.target.value) || 0 })}
                placeholder="7.11"
                suffix="%"
              />
              <Input
                label="G&A Rate"
                type="number"
                value={presetRates.ga || ''}
                onChange={(e) => setPresetRates({ ...presetRates, ga: parseFloat(e.target.value) || 0 })}
                placeholder="22.43"
                suffix="%"
              />
              <Input
                label="Fee Rate (Prime Labor)"
                type="number"
                value={presetRates.fee || ''}
                onChange={(e) => setPresetRates({ ...presetRates, fee: parseFloat(e.target.value) || 0 })}
                placeholder="7.00"
                suffix="%"
              />
              <Input
                label="S&MH Rate (Subcontractor)"
                type="number"
                value={presetRates.smh || ''}
                onChange={(e) => setPresetRates({ ...presetRates, smh: parseFloat(e.target.value) || 0 })}
                placeholder="6.50"
                suffix="%"
              />
              <Input
                label="Fee Rate (Sub Labor)"
                type="number"
                value={presetRates.sub_fee || ''}
                onChange={(e) => setPresetRates({ ...presetRates, sub_fee: parseFloat(e.target.value) || 0 })}
                placeholder="5.00"
                suffix="%"
              />
              <Input
                label="G&A Passthrough Rate"
                type="number"
                value={presetRates.ga_passthrough || ''}
                onChange={(e) => setPresetRates({ ...presetRates, ga_passthrough: parseFloat(e.target.value) || 0 })}
                placeholder="2.50"
                suffix="%"
              />
            </div>
          </div>
        </div>
      </Dialog>

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
