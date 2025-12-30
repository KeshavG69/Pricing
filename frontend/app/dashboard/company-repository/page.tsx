'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { useCompanyRepositoryStore } from '@/lib/stores/companyRepositoryStore';
import { useOrganizationStore } from '@/lib/stores/organizationStore';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card, { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Dialog from '@/components/ui/Dialog';
import { Building2, Upload, Trash2, Calendar, FileText, CheckCircle, AlertCircle, Clock, RefreshCw, ChevronDown, ChevronRight, ExternalLink, Plus, Info } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { isAdmin } from '@/lib/utils/permissions';
import { GSAContract, GSALaborCategory, OrganizationSettings } from '@/types';
import apiClient from '@/lib/api/client';

export default function CompanyRepositoryPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    contracts,
    isLoading,
    isUploading,
    error,
    fetchContracts,
    fetchContract,
    uploadContract,
    updateStartDate,
    deleteContract,
    pollStatus,
    clearError,
  } = useCompanyRepositoryStore();
  const { organization, fetchOrganization } = useOrganizationStore();
  const toast = useToast();

  // Upload dialog state
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Date dialog state
  const [showDateDialog, setShowDateDialog] = useState(false);
  const [selectedContract, setSelectedContract] = useState<GSAContract | null>(null);
  const [startDate, setStartDate] = useState('');

  // Polling for processing contracts
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());

  // Expanded contract state (stores full contract data with labor_categories)
  const [expandedContract, setExpandedContract] = useState<GSAContract | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Create preset dialog state
  const [showCreatePresetDialog, setShowCreatePresetDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);

  // Manual preset creation dialog state
  const [showManualPresetDialog, setShowManualPresetDialog] = useState(false);
  const [manualPresetName, setManualPresetName] = useState('');
  const [manualPresetRates, setManualPresetRates] = useState({
    fringe: 0,
    oh: 0,
    ga: 0,
    fee: 0,
    smh: 0,
    sub_fee: 0,
    ga_passthrough: 0,
    escalation_rate: 0,
  });

  // Edit preset dialog state
  const [showEditPresetDialog, setShowEditPresetDialog] = useState(false);
  const [editingPreset, setEditingPreset] = useState<{ id: string; name: string } | null>(null);

  // Text modal state (for viewing full description/experience)
  const [textModal, setTextModal] = useState<{ title: string; content: string } | null>(null);
  const [editPresetName, setEditPresetName] = useState('');
  const [editPresetRates, setEditPresetRates] = useState({
    fringe: 0,
    oh: 0,
    ga: 0,
    fee: 0,
    smh: 0,
    sub_fee: 0,
    ga_passthrough: 0,
    escalation_rate: 0,
  });

  // Organization settings state (for user overrides)
  const [allowUserRateOverride, setAllowUserRateOverride] = useState(true);
  const [hasSettingsChanges, setHasSettingsChanges] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    // Fetch contracts and organization
    if (user) {
      fetchContracts();
      fetchOrganization();
    }
  }, [user, fetchContracts, fetchOrganization]);

  // Poll for processing contracts
  useEffect(() => {
    const processingContracts = contracts.filter((c) => c.status === 'processing');
    if (processingContracts.length === 0) return;

    const interval = setInterval(async () => {
      for (const contract of processingContracts) {
        // Skip if already polling this contract (prevent duplicate requests)
        if (pollingIds.has(contract.file_id)) continue;

        setPollingIds((prev) => new Set(prev).add(contract.file_id));
        try {
          const updated = await pollStatus(contract.file_id);
          // Always remove from polling set after request completes
          setPollingIds((prev) => {
            const next = new Set(prev);
            next.delete(contract.file_id);
            return next;
          });

          if (updated.status !== 'processing') {
            if (updated.status === 'active') {
              toast.success(`Contract "${contract.name}" is ready!`);
            } else if (updated.status === 'needs_date') {
              toast.info(`Contract "${contract.name}" needs a start date.`);
            }
          }
        } catch (e) {
          setPollingIds((prev) => {
            const next = new Set(prev);
            next.delete(contract.file_id);
            return next;
          });
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [contracts, pollStatus, pollingIds, toast]);

  // Load organization settings
  useEffect(() => {
    if (organization?.settings) {
      setAllowUserRateOverride(organization.settings.allow_user_rate_override ?? true);
    }
  }, [organization]);

  // Handler functions for organization settings
  const handleToggleUserRateOverride = () => {
    setAllowUserRateOverride(!allowUserRateOverride);
    setHasSettingsChanges(true);
  };

  const handleSaveSettings = async () => {
    if (!hasSettingsChanges) return;

    setIsSavingSettings(true);
    try {
      await apiClient.patch('/organizations/me/settings', {
        allow_user_rate_override: allowUserRateOverride,
      });
      toast.success('Settings updated successfully');
      setHasSettingsChanges(false);
      await fetchOrganization(); // Refresh organization data
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadName) {
        // Auto-fill name from filename
        setUploadName(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadName.trim()) return;

    try {
      await uploadContract(selectedFile, uploadName.trim());
      toast.success('Contract uploaded! Processing started...');
      setShowUploadDialog(false);
      setUploadName('');
      setSelectedFile(null);
    } catch (e) {
      toast.error('Failed to upload contract');
    }
  };

  const handleSetDate = async () => {
    if (!selectedContract || !startDate) return;

    try {
      await updateStartDate(selectedContract.file_id, startDate);
      toast.success('Contract start date updated!');
      setShowDateDialog(false);
      setSelectedContract(null);
      setStartDate('');
    } catch (e) {
      toast.error('Failed to update start date');
    }
  };

  const handleDelete = async (contract: GSAContract) => {
    if (!confirm(`Delete "${contract.name}"? This action cannot be undone.`)) return;

    try {
      await deleteContract(contract.file_id);
      toast.success('Contract deleted');
    } catch (e) {
      toast.error('Failed to delete contract');
    }
  };

  const handleToggleExpand = async (contract: GSAContract) => {
    // If already expanded, collapse
    if (expandedContract?.file_id === contract.file_id) {
      setExpandedContract(null);
      return;
    }

    // Fetch full contract details including labor_categories (with caching)
    try {
      setIsLoadingDetails(true);
      await fetchContract(contract.file_id);
      // Get the contract from selectedContract in store
      const fullContract = useCompanyRepositoryStore.getState().selectedContract;
      if (fullContract) {
        setExpandedContract(fullContract);
      }
    } catch (e) {
      toast.error('Failed to load contract details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleCreatePreset = async () => {
    if (!presetName.trim() || !expandedContract) return;

    setIsCreatingPreset(true);
    try {
      // For now, we'll create a preset with placeholder rates
      // In a real implementation, you'd extract these from the contract
      const presetData = {
        name: presetName.trim(),
        fringe: 0.247,
        oh: 0.0711,
        ga: 0.2243,
        fee: 0.07,
        smh: 0.065,
        sub_fee: 0.05,
        ga_passthrough: 0.025,
      };

      await apiClient.post('/organizations/me/rate-presets', presetData);
      toast.success(`Preset "${presetName}" created successfully!`);
      setShowCreatePresetDialog(false);
      setPresetName('');
      await fetchOrganization(); // Refresh to get updated presets
    } catch {
      toast.error('Failed to create preset');
    } finally {
      setIsCreatingPreset(false);
    }
  };

  const handleCreateManualPreset = async () => {
    if (!manualPresetName.trim()) return;

    setIsCreatingPreset(true);
    try {
      const presetData = {
        name: manualPresetName.trim(),
        fringe: manualPresetRates.fringe / 100,
        oh: manualPresetRates.oh / 100,
        ga: manualPresetRates.ga / 100,
        fee: manualPresetRates.fee / 100,
        smh: manualPresetRates.smh / 100,
        sub_fee: manualPresetRates.sub_fee / 100,
        ga_passthrough: manualPresetRates.ga_passthrough / 100,
        escalation_rate: manualPresetRates.escalation_rate / 100,
      };

      await apiClient.post('/organizations/me/rate-presets', presetData);
      toast.success(`Preset "${manualPresetName}" created successfully!`);
      setShowManualPresetDialog(false);
      setManualPresetName('');
      setManualPresetRates({
        fringe: 0,
        oh: 0,
        ga: 0,
        fee: 0,
        smh: 0,
        sub_fee: 0,
        ga_passthrough: 0,
        escalation_rate: 0,
      });
      await fetchOrganization(); // Refresh to get updated presets
    } catch {
      toast.error('Failed to create preset');
    } finally {
      setIsCreatingPreset(false);
    }
  };

  const handleDeletePreset = async (presetId: string, presetName: string) => {
    if (!confirm(`Delete preset "${presetName}"? This action cannot be undone.`)) return;

    try {
      await apiClient.delete(`/organizations/me/rate-presets/${presetId}`);
      toast.success(`Preset "${presetName}" deleted successfully`);
      await fetchOrganization(); // Refresh to get updated presets
    } catch {
      toast.error('Failed to delete preset');
    }
  };

  const handleEditPreset = (preset: any) => {
    setEditingPreset({ id: preset.id, name: preset.name });
    setEditPresetName(preset.name);
    setEditPresetRates({
      fringe: toPercentageNumber(preset.fringe),
      oh: toPercentageNumber(preset.oh),
      ga: toPercentageNumber(preset.ga),
      fee: toPercentageNumber(preset.fee),
      smh: toPercentageNumber(preset.smh),
      sub_fee: toPercentageNumber(preset.sub_fee),
      ga_passthrough: toPercentageNumber(preset.ga_passthrough),
      escalation_rate: toPercentageNumber(preset.escalation_rate || 0),
    });
    setShowEditPresetDialog(true);
  };

  const handleUpdatePreset = async () => {
    if (!editingPreset || !editPresetName.trim()) return;

    setIsCreatingPreset(true);
    try {
      const presetData = {
        name: editPresetName.trim(),
        fringe: editPresetRates.fringe / 100,
        oh: editPresetRates.oh / 100,
        ga: editPresetRates.ga / 100,
        fee: editPresetRates.fee / 100,
        smh: editPresetRates.smh / 100,
        sub_fee: editPresetRates.sub_fee / 100,
        ga_passthrough: editPresetRates.ga_passthrough / 100,
        escalation_rate: editPresetRates.escalation_rate / 100,
      };

      await apiClient.put(`/organizations/me/rate-presets/${editingPreset.id}`, presetData);
      toast.success(`Preset "${editPresetName}" updated successfully!`);
      setShowEditPresetDialog(false);
      setEditingPreset(null);
      setEditPresetName('');
      setEditPresetRates({
        fringe: 0,
        oh: 0,
        ga: 0,
        fee: 0,
        smh: 0,
        sub_fee: 0,
        ga_passthrough: 0,
        escalation_rate: 0,
      });
      await fetchOrganization(); // Refresh to get updated presets
    } catch {
      toast.error('Failed to update preset');
    } finally {
      setIsCreatingPreset(false);
    }
  };

  const toPercentageDisplay = (value: number): string => {
    return (value * 100).toFixed(2);
  };

  const toPercentageNumber = (value: number): number => {
    return parseFloat((value * 100).toFixed(2));
  };

  const handleViewContract = async (contract: GSAContract) => {
    try {
      const response = await apiClient.get(`/company-repository/${contract.file_id}/document-url`);
      if (response.data.url) {
        window.open(response.data.url, '_blank');
      }
    } catch (error) {
      toast.error('Failed to get document link');
      console.error('Error fetching document URL:', error);
    }
  };

  // Get year columns from labor categories with actual calendar years
  const getYearColumns = (laborCategories: GSALaborCategory[] | undefined, contract: GSAContract) => {
    if (!laborCategories || laborCategories.length === 0) return [];

    // Get all years that have data
    const years = new Set<string>();
    laborCategories.forEach((lc) => {
      Object.keys(lc.rates_by_year || {}).forEach((year) => {
        // Only include years that have actual rate values
        if (lc.rates_by_year?.[year]) {
          years.add(year);
        }
      });
    });

    // Sort years numerically
    const sortedYears = Array.from(years).sort((a, b) => parseInt(a) - parseInt(b));

    // Calculate actual calendar years based on contract start date
    const currentYear = new Date().getFullYear();
    const contractStartYear = contract.contract_start_date
      ? new Date(contract.contract_start_date).getFullYear()
      : currentYear;

    return sortedYears.map((yearNum) => ({
      yearNum,
      displayYear: contractStartYear + parseInt(yearNum) - 1
    }));
  };

  const getStatusBadge = (status: GSAContract['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckCircle className="w-3 h-3" />
            Active
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Processing
          </span>
        );
      case 'needs_date':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
            <Calendar className="w-3 h-3" />
            Needs Date
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        );
      default:
        return null;
    }
  };

  // Show loading state while checking auth
  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  const userIsAdmin = isAdmin(user);

  return (
    <DashboardLayout>
      <div className="space-y-2 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">Company Rates</h1>
            <p className="text-muted-foreground pl-1">
              Upload and manage GSA contracts for rate lookups
            </p>
          </div>
          {userIsAdmin && (
            <Button
              variant="primary"
              onClick={() => setShowUploadDialog(true)}
              className="shadow-md shadow-primary/10"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload a New Contract
            </Button>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm text-red-800">{error}</p>
            <button
              onClick={clearError}
              className="ml-auto text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Contracts List */}
        <Card>
          <CardHeader>
            <CardTitle>GSA Contracts</CardTitle>
            <CardDescription>
              Uploaded GSA rate schedules that can be used for proposal pricing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && contracts.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : contracts.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No contracts uploaded</h3>
                <p className="text-muted-foreground mb-4">
                  {userIsAdmin ? 'Upload a GSA rate schedule to get started' : 'No GSA contracts available yet'}
                </p>
                {userIsAdmin && (
                  <Button variant="outline" onClick={() => setShowUploadDialog(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload a New Contract
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {contracts.map((contract) => (
                  <div
                    key={contract.file_id}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    <div className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {/* Expand/Collapse Button */}
                          {contract.status === 'active' && contract.labor_categories_count > 0 && (
                            <button
                              onClick={() => handleToggleExpand(contract)}
                              className="p-2 hover:bg-muted rounded-lg transition-colors mt-0.5"
                              disabled={isLoadingDetails}
                            >
                              {isLoadingDetails && expandedContract?.file_id === contract.file_id ? (
                                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                              ) : expandedContract?.file_id === contract.file_id ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                            </button>
                          )}
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h4
                              className="font-medium text-foreground cursor-pointer hover:text-primary hover:underline transition-colors"
                              onClick={() => handleViewContract(contract)}
                              title="Click to view contract"
                            >
                              {contract.name}
                            </h4>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                              {contract.contract_number && (
                                <span>Contract: {contract.contract_number}</span>
                              )}
                              {contract.company_name && (
                                <span>Company: {contract.company_name}</span>
                              )}
                              {contract.status !== 'processing' && (
                                <span className="text-base font-bold text-foreground">
                                  {contract.labor_categories_count} Labour categories
                                </span>
                              )}
                            </div>
                            {contract.contract_start_date && (
                              <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                                <Calendar className="w-3 h-3" />
                                Start: {new Date(contract.contract_start_date).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(contract.status)}
                          {userIsAdmin && contract.status === 'needs_date' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedContract(contract);
                                setStartDate(contract.contract_start_date || '');
                                setShowDateDialog(true);
                              }}
                            >
                              <Calendar className="w-3 h-3 mr-1" />
                              Set Date
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewContract(contract)}
                            className="text-primary hover:text-primary/80"
                            title="View original contract"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          {userIsAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(contract)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Labor Categories Table */}
                    {expandedContract?.file_id === contract.file_id && expandedContract.labor_categories && (
                      <div className="border-t border-border bg-muted/20">
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="text-sm font-medium text-foreground">
                              Labor Categories ({expandedContract.labor_categories.length})
                            </h5>
                            {userIsAdmin && (
                              <button
                                onClick={() => setShowCreatePresetDialog(true)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                                Create Preset
                              </button>
                            )}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Title</th>
                                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">SIN</th>
                                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Description</th>
                                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Experience</th>
                                  {getYearColumns(expandedContract.labor_categories, contract).map(({ yearNum, displayYear }) => (
                                    <th key={yearNum} className="text-right py-2 px-3 font-medium text-muted-foreground">
                                      {displayYear}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {expandedContract.labor_categories.map((lc, index) => (
                                  <tr
                                    key={lc.lcat_id || index}
                                    className="border-b border-border/50 last:border-0 hover:bg-muted/30"
                                  >
                                    <td className="py-2 px-3 text-foreground">{lc.title}</td>
                                    <td className="py-2 px-3 text-muted-foreground">{lc.sin || '-'}</td>
                                    <td
                                      className="py-2 px-3 text-muted-foreground max-w-[200px] truncate cursor-pointer hover:bg-muted/50"
                                      title={lc.description || '-'}
                                      onDoubleClick={() => lc.description && setTextModal({ title: `${lc.title} - Description`, content: lc.description })}
                                    >
                                      {lc.description || '-'}
                                    </td>
                                    <td
                                      className="py-2 px-3 text-muted-foreground max-w-[200px] truncate cursor-pointer hover:bg-muted/50"
                                      title={lc.experience || '-'}
                                      onDoubleClick={() => lc.experience && setTextModal({ title: `${lc.title} - Experience`, content: lc.experience })}
                                    >
                                      {lc.experience || '-'}
                                    </td>
                                    {getYearColumns(expandedContract.labor_categories, contract).map(({ yearNum }) => (
                                      <td key={yearNum} className="py-2 px-3 text-right text-foreground font-mono">
                                        {lc.rates_by_year?.[yearNum]
                                          ? `$${lc.rates_by_year[yearNum].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                          : '-'}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rate Presets */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Rate Presets</CardTitle>
                <CardDescription>
                  Reusable rate templates that can be quickly applied in pricing workspaces
                </CardDescription>
              </div>
              {userIsAdmin && (
                <button
                  onClick={() => setShowManualPresetDialog(true)}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
                  title="Create new preset"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {organization?.settings?.rate_presets && organization.settings.rate_presets.length > 0 ? (
              <div className="space-y-3">
                {organization.settings.rate_presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-foreground">{preset.name}</h4>
                      {userIsAdmin && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleEditPreset(preset)}
                            className="text-primary hover:text-primary/80 text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeletePreset(preset.id, preset.name)}
                            className="text-red-600 hover:text-red-700 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      )}
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
                      <div>
                        <span className="text-muted-foreground">Escalation: </span>
                        <span className="font-mono font-semibold">{toPercentageDisplay(preset.escalation_rate || 0)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No rate presets created yet.</p>
                {userIsAdmin && (
                  <p className="text-sm mt-1">Click the + button above to create your first preset.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Additional Settings */}
        {userIsAdmin && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Additional Settings</CardTitle>
                  <CardDescription>
                    Other organization preferences
                  </CardDescription>
                </div>
                {hasSettingsChanges && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveSettings}
                    isLoading={isSavingSettings}
                    className="shadow-md shadow-primary/10"
                  >
                    Save Changes
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
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
                  onClick={handleToggleUserRateOverride}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    allowUserRateOverride ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      allowUserRateOverride ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground mb-1">
                  How it works
                </h4>
                <p className="text-sm text-muted-foreground">
                  Upload a GSA rate schedule (PDF, Excel, or RTF). We'll extract all labor categories
                  and rates. When creating a proposal, you can choose to use GSA rates instead of BLS data.
                  GSA rates are final - no indirect rates (fringe, OH, G&A, fee) are applied.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Dialog */}
      <Dialog
        isOpen={showUploadDialog}
        onClose={() => {
          setShowUploadDialog(false);
          setUploadName('');
          setSelectedFile(null);
        }}
        title="Upload GSA Contract"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadDialog(false);
                setUploadName('');
                setSelectedFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpload}
              isLoading={isUploading}
              disabled={!selectedFile || !uploadName.trim()}
            >
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload a GSA rate schedule document. Supported formats: PDF, Excel (.xlsx, .xls), RTF
          </p>

          <Input
            label="Contract Name"
            placeholder='e.g., "GSA MAS Contract 2024"'
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
          />

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Document File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.rtf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium text-foreground">{selectedFile.name}</span>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to select a file or drag and drop
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </Dialog>

      {/* Set Date Dialog */}
      <Dialog
        isOpen={showDateDialog}
        onClose={() => {
          setShowDateDialog(false);
          setSelectedContract(null);
          setStartDate('');
        }}
        title="Set Contract Start Date"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowDateDialog(false);
                setSelectedContract(null);
                setStartDate('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSetDate}
              disabled={!startDate}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The contract start date is needed to calculate which year's rates apply to your proposals.
          </p>

          <Input
            label="Contract Start Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
      </Dialog>

      {/* Create Preset Dialog */}
      <Dialog
        isOpen={showCreatePresetDialog}
        onClose={() => {
          setShowCreatePresetDialog(false);
          setPresetName('');
        }}
        title="Create Rate Preset from Contract"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreatePresetDialog(false);
                setPresetName('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreatePreset}
              disabled={!presetName.trim() || isCreatingPreset}
              isLoading={isCreatingPreset}
            >
              Create Preset
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create a reusable rate preset that can be quickly applied in pricing workspaces.
            The rates will be extracted from this contract's labor categories.
          </p>

          <Input
            label="Preset Name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="e.g., FSS 2024 Rates"
          />

          {expandedContract && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="text-muted-foreground mb-1">Source Contract:</p>
              <p className="font-medium text-foreground">{expandedContract.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {expandedContract.labor_categories?.length || 0} labor categories
              </p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Manual Create Preset Dialog */}
      <Dialog
        isOpen={showManualPresetDialog}
        onClose={() => {
          setShowManualPresetDialog(false);
          setManualPresetName('');
          setManualPresetRates({
            fringe: 0,
            oh: 0,
            ga: 0,
            fee: 0,
            smh: 0,
            sub_fee: 0,
            ga_passthrough: 0,
            escalation_rate: 0,
          });
        }}
        title="Create New Rate Preset"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowManualPresetDialog(false);
                setManualPresetName('');
                setManualPresetRates({
                  fringe: 0,
                  oh: 0,
                  ga: 0,
                  fee: 0,
                  smh: 0,
                  sub_fee: 0,
                  ga_passthrough: 0,
                  escalation_rate: 0,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateManualPreset}
              disabled={!manualPresetName.trim() || isCreatingPreset}
              isLoading={isCreatingPreset}
            >
              Create Preset
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Preset Name"
            placeholder='e.g., "Federal Contract", "Commercial"'
            value={manualPresetName}
            onChange={(e) => setManualPresetName(e.target.value)}
          />
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground mb-3">Rate Values (%)</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Fringe Rate"
                type="number"
                value={manualPresetRates.fringe || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, fringe: parseFloat(e.target.value) || 0 })}
                placeholder="24.70"
              />
              <Input
                label="Overhead (OH) Rate"
                type="number"
                value={manualPresetRates.oh || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, oh: parseFloat(e.target.value) || 0 })}
                placeholder="7.11"
              />
              <Input
                label="G&A Rate"
                type="number"
                value={manualPresetRates.ga || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, ga: parseFloat(e.target.value) || 0 })}
                placeholder="22.43"
              />
              <Input
                label="Fee Rate (Prime Labor)"
                type="number"
                value={manualPresetRates.fee || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, fee: parseFloat(e.target.value) || 0 })}
                placeholder="7.00"
              />
              <Input
                label="S&MH Rate (Subcontractor)"
                type="number"
                value={manualPresetRates.smh || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, smh: parseFloat(e.target.value) || 0 })}
                placeholder="6.50"
              />
              <Input
                label="Fee Rate (Sub Labor)"
                type="number"
                value={manualPresetRates.sub_fee || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, sub_fee: parseFloat(e.target.value) || 0 })}
                placeholder="5.00"
              />
              <Input
                label="G&A Passthrough Rate"
                type="number"
                value={manualPresetRates.ga_passthrough || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, ga_passthrough: parseFloat(e.target.value) || 0 })}
                placeholder="2.50"
              />
              <Input
                label="Escalation Rate"
                type="number"
                value={manualPresetRates.escalation_rate || ''}
                onChange={(e) => setManualPresetRates({ ...manualPresetRates, escalation_rate: parseFloat(e.target.value) || 0 })}
                placeholder="3.00"
              />
            </div>
          </div>
        </div>
      </Dialog>

      {/* Edit Preset Dialog */}
      <Dialog
        isOpen={showEditPresetDialog}
        onClose={() => {
          setShowEditPresetDialog(false);
          setEditingPreset(null);
          setEditPresetName('');
          setEditPresetRates({
            fringe: 0,
            oh: 0,
            ga: 0,
            fee: 0,
            smh: 0,
            sub_fee: 0,
            ga_passthrough: 0,
            escalation_rate: 0,
          });
        }}
        title="Edit Rate Preset"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditPresetDialog(false);
                setEditingPreset(null);
                setEditPresetName('');
                setEditPresetRates({
                  fringe: 0,
                  oh: 0,
                  ga: 0,
                  fee: 0,
                  smh: 0,
                  sub_fee: 0,
                  ga_passthrough: 0,
                  escalation_rate: 0,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpdatePreset}
              disabled={!editPresetName.trim() || isCreatingPreset}
              isLoading={isCreatingPreset}
            >
              Update Preset
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Preset Name"
            placeholder='e.g., "Federal Contract", "Commercial"'
            value={editPresetName}
            onChange={(e) => setEditPresetName(e.target.value)}
          />
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground mb-3">Rate Values (%)</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Fringe Rate"
                type="number"
                value={editPresetRates.fringe || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, fringe: parseFloat(e.target.value) || 0 })}
                placeholder="24.70"
              />
              <Input
                label="Overhead (OH) Rate"
                type="number"
                value={editPresetRates.oh || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, oh: parseFloat(e.target.value) || 0 })}
                placeholder="7.11"
              />
              <Input
                label="G&A Rate"
                type="number"
                value={editPresetRates.ga || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, ga: parseFloat(e.target.value) || 0 })}
                placeholder="22.43"
              />
              <Input
                label="Fee Rate (Prime Labor)"
                type="number"
                value={editPresetRates.fee || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, fee: parseFloat(e.target.value) || 0 })}
                placeholder="7.00"
              />
              <Input
                label="S&MH Rate (Subcontractor)"
                type="number"
                value={editPresetRates.smh || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, smh: parseFloat(e.target.value) || 0 })}
                placeholder="6.50"
              />
              <Input
                label="Fee Rate (Sub Labor)"
                type="number"
                value={editPresetRates.sub_fee || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, sub_fee: parseFloat(e.target.value) || 0 })}
                placeholder="5.00"
              />
              <Input
                label="G&A Passthrough Rate"
                type="number"
                value={editPresetRates.ga_passthrough || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, ga_passthrough: parseFloat(e.target.value) || 0 })}
                placeholder="2.50"
              />
              <Input
                label="Escalation Rate"
                type="number"
                value={editPresetRates.escalation_rate || ''}
                onChange={(e) => setEditPresetRates({ ...editPresetRates, escalation_rate: parseFloat(e.target.value) || 0 })}
                placeholder="3.00"
              />
            </div>
          </div>
        </div>
      </Dialog>

      {/* Text View Modal (for full description/experience) */}
      <Dialog
        isOpen={!!textModal}
        onClose={() => setTextModal(null)}
        title={textModal?.title || ''}
      >
        <div className="whitespace-pre-wrap text-sm text-foreground">
          {textModal?.content}
        </div>
      </Dialog>
    </DashboardLayout>
  );
}
