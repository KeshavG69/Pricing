'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useOrganizationStore } from '@/lib/stores/organizationStore';
import { useBillingStore } from '@/lib/stores/billingStore';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Dialog from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import RoleBadge from '@/components/ui/RoleBadge';
import StatusBadge from '@/components/ui/StatusBadge';
import { StripeProvider } from '@/components/billing/StripeProvider';
import { PaymentMethodForm } from '@/components/billing/PaymentMethodForm';
import OrganizationDeletionModal from '@/components/settings/OrganizationDeletionModal';
import {
  Building,
  Save,
  Info,
  Users,
  Mail,
  Plus,
  Trash2,
  Clock,
  CheckCircle,
  UserX,
  CreditCard,
  DollarSign,
  Receipt,
  AlertCircle,
  Loader2,
  FileText,
} from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { isAdmin, canRemoveUser, getUserDisplayName, getUserInitials } from '@/lib/utils/permissions';
import { OrganizationSettings, InviteUserRequest } from '@/types';
import apiClient from '@/lib/api/client';
import { pricing } from '@/lib/config';

type TabType = 'settings' | 'team' | 'billing' | 'legal';

// Wrapper component to handle Suspense for useSearchParams
export default function OrganizationPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    }>
      <OrganizationPageContent />
    </Suspense>
  );
}

function OrganizationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const {
    status: billingStatus,
    paymentMethods,
    billingHistory,
    billingStats,
    setupIntentClientSecret,
    isLoadingStatus: isLoadingBillingStatus,
    isLoadingPaymentMethods,
    isLoadingHistory,
    isCreatingSetupIntent,
    fetchBillingStatus,
    fetchPaymentMethods,
    fetchBillingHistory,
    fetchBillingStats,
    createSetupIntent,
    removePaymentMethod,
    setAsDefaultPaymentMethod,
  } = useBillingStore();
  const toast = useToast();

  // Tab state - read initial value from URL
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(
    tabFromUrl && ['settings', 'team', 'billing', 'legal'].includes(tabFromUrl) ? tabFromUrl : 'settings'
  );

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

  // Company info editing state
  const [editingOrgName, setEditingOrgName] = useState(false);
  const [orgNameInput, setOrgNameInput] = useState('');
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteInput, setWebsiteInput] = useState('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState('');

  // Organization deletion modal state
  const [showDeleteOrgModal, setShowDeleteOrgModal] = useState(false);
  const [isSavingCompanyInfo, setIsSavingCompanyInfo] = useState(false);

  // Billing state
  const [showAddCard, setShowAddCard] = useState(false);
  const [deleteCardConfirmOpen, setDeleteCardConfirmOpen] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<{ id: string; last4: string } | null>(null);
  const [isDeletingCard, setIsDeletingCard] = useState(false);
  const [settingDefaultCardId, setSettingDefaultCardId] = useState<string | null>(null);

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
      // Fetch billing data
      fetchBillingStatus();
      fetchPaymentMethods();
      fetchBillingHistory();
      fetchBillingStats();
    }
  }, [user, router, fetchOrganization, fetchMembers, fetchInvitations, fetchBillingStatus, fetchPaymentMethods, fetchBillingHistory, fetchBillingStats]);

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

  // Company info handlers
  const handleSaveOrgName = async () => {
    const trimmedInput = orgNameInput.trim();

    // Don't save if input is empty or unchanged
    if (!trimmedInput || trimmedInput === organization?.name) {
      setEditingOrgName(false);
      setOrgNameInput('');
      return;
    }

    setIsSavingCompanyInfo(true);
    try {
      await updateSettings({ name: trimmedInput });
      await fetchOrganization(true);
      toast.success('Company name updated successfully');
      setEditingOrgName(false);
      setOrgNameInput('');
    } catch {
      toast.error('Failed to update company name');
    } finally {
      setIsSavingCompanyInfo(false);
    }
  };

  const handleSaveWebsite = async () => {
    const trimmedInput = websiteInput.trim();

    // Don't save if unchanged
    if (trimmedInput === (organization?.website || '')) {
      setEditingWebsite(false);
      setWebsiteInput('');
      return;
    }

    setIsSavingCompanyInfo(true);
    try {
      await updateSettings({ website: trimmedInput || null });
      await fetchOrganization(true);
      toast.success('Website updated successfully');
      setEditingWebsite(false);
      setWebsiteInput('');
    } catch {
      toast.error('Failed to update website');
    } finally {
      setIsSavingCompanyInfo(false);
    }
  };

  const handleSaveAddress = async () => {
    const trimmedInput = addressInput.trim();

    // Don't save if unchanged
    if (trimmedInput === (organization?.address || '')) {
      setEditingAddress(false);
      setAddressInput('');
      return;
    }

    setIsSavingCompanyInfo(true);
    try {
      await updateSettings({ address: trimmedInput || null });
      await fetchOrganization(true);
      toast.success('Address updated successfully');
      setEditingAddress(false);
      setAddressInput('');
    } catch {
      toast.error('Failed to update address');
    } finally {
      setIsSavingCompanyInfo(false);
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

  // Billing handlers
  const handleAddCard = async () => {
    const clientSecret = await createSetupIntent();
    if (clientSecret) {
      setShowAddCard(true);
    }
  };

  const handleCardAdded = () => {
    setShowAddCard(false);
    toast.success('Payment method added successfully');
  };

  const handleDeleteCardClick = (id: string, last4: string) => {
    setCardToDelete({ id, last4 });
    setDeleteCardConfirmOpen(true);
  };

  const handleDeleteCardConfirm = async () => {
    if (!cardToDelete) return;

    setIsDeletingCard(true);
    try {
      const success = await removePaymentMethod(cardToDelete.id);
      if (success) {
        toast.success('Payment method removed');
      }
    } catch {
      toast.error('Failed to remove payment method');
    } finally {
      setIsDeletingCard(false);
      setDeleteCardConfirmOpen(false);
      setCardToDelete(null);
    }
  };

  const handleSetDefaultCard = async (paymentMethodId: string) => {
    setSettingDefaultCardId(paymentMethodId);
    try {
      const success = await setAsDefaultPaymentMethod(paymentMethodId);
      if (success) {
        toast.success('Default payment method updated');
      }
    } catch {
      toast.error('Failed to set default payment method');
    } finally {
      setSettingDefaultCardId(null);
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

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
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
            <button
              onClick={() => setActiveTab('billing')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'billing'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <CreditCard className="w-4 h-4 inline-block mr-2" />
              Billing
            </button>
            <button
              onClick={() => setActiveTab('legal')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'legal'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <FileText className="w-4 h-4 inline-block mr-2" />
              Terms and Conditions
            </button>
          </nav>
        </div>

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Company Info */}
            <Card>
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
                <CardDescription>
                  Basic details about your company
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Company Name */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Company Name
                    </label>
                    {!editingOrgName ? (
                      <div
                        className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={() => {
                          if (user && isAdmin(user)) {
                            setEditingOrgName(true);
                            setOrgNameInput(organization.name);
                          }
                        }}
                        title={user && isAdmin(user) ? "Click to edit" : ""}
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
                          placeholder="Enter company name"
                          autoFocus
                          disabled={isSavingCompanyInfo}
                          className="flex-1 border-none focus:ring-0 bg-transparent"
                        />
                      </div>
                    )}
                  </div>

                  {/* Website */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Website
                    </label>
                    {!editingWebsite ? (
                      <div
                        className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={() => {
                          if (user && isAdmin(user)) {
                            setEditingWebsite(true);
                            setWebsiteInput(organization.website || '');
                          }
                        }}
                        title={user && isAdmin(user) ? "Click to edit" : ""}
                      >
                        <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                        <span className={`text-sm flex-1 ${organization.website ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                          {organization.website || 'Not set'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg">
                        <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                        <Input
                          value={websiteInput}
                          onChange={(e) => setWebsiteInput(e.target.value)}
                          onBlur={handleSaveWebsite}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveWebsite();
                            } else if (e.key === 'Escape') {
                              setEditingWebsite(false);
                              setWebsiteInput('');
                            }
                          }}
                          placeholder="https://www.example.com"
                          autoFocus
                          disabled={isSavingCompanyInfo}
                          className="flex-1 border-none focus:ring-0 bg-transparent"
                        />
                      </div>
                    )}
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Address
                    </label>
                    {!editingAddress ? (
                      <div
                        className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={() => {
                          if (user && isAdmin(user)) {
                            setEditingAddress(true);
                            setAddressInput(organization.address || '');
                          }
                        }}
                        title={user && isAdmin(user) ? "Click to edit" : ""}
                      >
                        <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className={`text-sm flex-1 ${organization.address ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                          {organization.address || 'Not set'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg">
                        <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <Input
                          value={addressInput}
                          onChange={(e) => setAddressInput(e.target.value)}
                          onBlur={handleSaveAddress}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveAddress();
                            } else if (e.key === 'Escape') {
                              setEditingAddress(false);
                              setAddressInput('');
                            }
                          }}
                          placeholder="123 Main St, City, State 12345"
                          autoFocus
                          disabled={isSavingCompanyInfo}
                          className="flex-1 border-none focus:ring-0 bg-transparent"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
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
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Team</CardTitle>
                  <CardDescription>
                    Active members and pending invitation requests
                  </CardDescription>
                </div>
                <Button
                  variant="primary"
                  onClick={() => setInviteModalOpen(true)}
                  className="shadow-md shadow-primary/10"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Send Invitation
                </Button>
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

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="hover-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                      Total Spent
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {formatCurrency(billingStats?.successful_amount_cents || 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Lifetime</p>
                </CardContent>
              </Card>

              <Card className="hover-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Receipt className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                      Transactions
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {billingStats?.successful_charges || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Successful charges</p>
                </CardContent>
              </Card>

              <Card className="hover-card">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-purple-600" />
                    </div>
                    <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-1 rounded-full">
                      Status
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-foreground mb-1">
                    {billingStatus?.has_payment_method ? 'Active' : 'Inactive'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {paymentMethods.length} payment method{paymentMethods.length !== 1 ? 's' : ''}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Add Card Form */}
            {showAddCard && (
              <Card>
                <CardHeader>
                  <CardTitle>Add Payment Method</CardTitle>
                  <CardDescription>
                    Enter your card details. Your information is encrypted and secure.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <StripeProvider clientSecret={setupIntentClientSecret || undefined}>
                    <PaymentMethodForm
                      onSuccess={handleCardAdded}
                      onCancel={() => setShowAddCard(false)}
                    />
                  </StripeProvider>
                </CardContent>
              </Card>
            )}

            {/* Payment Methods */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Payment Methods</CardTitle>
                  <CardDescription>
                    Cards saved for automatic billing
                  </CardDescription>
                </div>
                {!showAddCard && (
                  <Button
                    variant="primary"
                    onClick={handleAddCard}
                    isLoading={isCreatingSetupIntent}
                    className="shadow-md shadow-primary/10"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Payment Method
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {isLoadingPaymentMethods ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading payment methods...
                  </div>
                ) : paymentMethods.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                      <CreditCard className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">No payment methods</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto">
                      Add a payment method to enable proposal creation.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {paymentMethods.map((method) => (
                      <div
                        key={method.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <CreditCard className="w-8 h-8 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-foreground capitalize">
                              {method.brand} •••• {method.last4}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Expires {method.exp_month}/{method.exp_year}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {method.is_default ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                              <CheckCircle className="w-3 h-3" />
                              Default
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetDefaultCard(method.id)}
                              disabled={settingDefaultCardId === method.id}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {settingDefaultCardId === method.id ? (
                                <span className="animate-spin mr-1">⋯</span>
                              ) : null}
                              Set as Default
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteCardClick(method.id, method.last4)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Billing History */}
            <Card>
              <CardHeader>
                <CardTitle>Billing History</CardTitle>
                <CardDescription>
                  Recent transactions and charges
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingHistory ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading history...
                  </div>
                ) : billingHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <Receipt className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No billing history yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Description
                          </th>
                          <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Type
                          </th>
                          <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Status
                          </th>
                          <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {billingHistory.map((record) => (
                          <tr key={record.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-4 px-6">
                              <p className="text-sm font-medium text-foreground">
                                {record.description}
                              </p>
                            </td>
                            <td className="py-4 px-6">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                record.charge_type === 'basic'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}>
                                {record.charge_type === 'basic' ? 'Basic' : 'Advanced'}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <span className="text-sm font-medium text-foreground">
                                {formatCurrency(record.amount_cents)}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                record.status === 'succeeded'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : record.status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {record.status === 'succeeded' && <CheckCircle className="w-3 h-3" />}
                                {record.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                                {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <span className="text-sm text-muted-foreground">
                                {formatDateTime(record.created_at)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pricing Info */}
            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
                <CardDescription>
                  Current pricing for proposal processing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 border border-border rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Receipt className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Basic Proposal</p>
                        <p className="text-2xl font-bold text-primary">{pricing.basic}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Document processing with SOC matching and wage data lookup
                    </p>
                  </div>
                  <div className="p-4 border border-border rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Receipt className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">Advanced Analysis</p>
                        <p className="text-2xl font-bold text-primary">{pricing.advanced}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Deep competitive analysis and pricing recommendations
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Legal Tab */}
        {activeTab === 'legal' && (
          <div className="space-y-6">
            {/* Terms Acceptance Status Card */}
            <Card>
              <CardHeader>
                <CardTitle>Terms and Conditions</CardTitle>
                <CardDescription>
                  Your acceptance status and legal documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Acceptance Status */}
                  <div className="flex items-center justify-between p-4 bg-muted/50 border border-border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Terms Accepted
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Version {user?.terms_accepted_version || '1.0.0'} • Accepted on{' '}
                          {user?.terms_accepted_at
                            ? new Date(user.terms_accepted_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Legal Documents */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Legal Documents
                    </h3>
                    <div className="space-y-3">
                      {/* Full Terms */}
                      <a
                        href="/legal/terms?tab=terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                              Full Terms & Conditions
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Complete legal document
                            </p>
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>

                      {/* Plain English Summary */}
                      <a
                        href="/legal/terms?tab=summary"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                            <Info className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                              Plain English Summary
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Easy-to-read overview
                            </p>
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>

                      {/* Enterprise Addendum */}
                      <a
                        href="/legal/terms?tab=enterprise"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                            <Building className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                              Enterprise Addendum
                            </p>
                            <p className="text-xs text-muted-foreground">
                              For enterprise customers
                            </p>
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>

                  {/* Help Text */}
                  <div className="p-4 bg-muted/30 border border-border rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">Note:</strong> If our Terms and Conditions are updated, you'll be prompted to review and accept the new version before continuing to use PriceIQ.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Danger Zone - Admin Only */}
        {isAdmin(user) && (
          <div className="mt-8">
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader>
                <CardTitle className="text-red-600">Danger Zone</CardTitle>
                <CardDescription className="text-red-600/80">
                  Irreversible actions that will permanently affect this organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-background rounded-lg border border-red-200">
                  <h3 className="font-medium mb-2">Delete Organization</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Permanently delete this organization and all associated data.
                    All proposals will be deleted. Members with only this organization will have their accounts deleted.
                  </p>
                  <Button variant="danger" onClick={() => setShowDeleteOrgModal(true)}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Organization
                  </Button>
                </div>
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
                  onChange={() => setInviteRole('user')}
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
                  onChange={() => setInviteRole('admin')}
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

      {/* Delete Card Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteCardConfirmOpen}
        onClose={() => setDeleteCardConfirmOpen(false)}
        onConfirm={handleDeleteCardConfirm}
        title="Remove Payment Method?"
        message={`Are you sure you want to remove the card ending in ${cardToDelete?.last4}? You'll need to add a new payment method to continue creating proposals.`}
        confirmText="Remove"
        confirmVariant="danger"
        isLoading={isDeletingCard}
      />

      {/* Organization Deletion Modal */}
      <OrganizationDeletionModal
        isOpen={showDeleteOrgModal}
        onClose={() => setShowDeleteOrgModal(false)}
      />
    </DashboardLayout>
  );
}
