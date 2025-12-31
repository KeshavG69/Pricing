'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { proposalsApi } from '@/lib/api/proposals';
import { chargeForProposal, getProposalBilling } from '@/lib/api/billing';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import AdvancedAnalysisGrid from '@/components/pricing/AdvancedAnalysisGrid';
import OverviewTab from '@/components/pricing/OverviewTab';
import RateTableView from '@/components/pricing/RateTableView';
import PricingTabs from '@/components/pricing/PricingTabs';
import FilesTab from '@/components/pricing/FilesTab';
import AddPositionModal from '@/components/pricing/AddPositionModal';
import { SubcontractorSection } from '@/components/pricing/SubcontractorSection';
import { AdvancedAnalysisModal, SubcontractorInfo } from '@/components/pricing/AdvancedAnalysisModal';
import { Loader2, AlertCircle, ArrowLeft, Plus, Download, Share2, CheckCircle, XCircle, Send, ChevronDown } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { ShareOrInviteModal } from '@/components/proposals/ShareOrInviteModal';
import { useAuthStore } from '@/lib/stores/authStore';

export default function ProposalPage() {
  const params = useParams();
  const router = useRouter();
  const proposalId = params.id as string;
  const toast = useToast();
  const { user } = useAuthStore();

  const { currentProposal, fetchProposal, setCurrentProposal, isLoading } = useProposalsStore();
  const {
    loadProposal,
    proposalName,
    positions,
    subcontractors,
    rates,
    totalYears,
    addPosition,
    reset,
    recalculate,
    isRecalculating,
    enableAdvancedMode,
    disableAdvancedMode,
    transformToAdvanced,
    advancedMode,
    subcontractorConfigured,
    preCreateSubcontractors,
    activeTab,
    setActiveTab,
    exportToExcel,
  } = usePricingStore();
  const [pollingStatus, setPollingStatus] = useState<any>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const [isEditingSolicitation, setIsEditingSolicitation] = useState(false);
  const [editedSolicitation, setEditedSolicitation] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isEditingPrimeContractor, setIsEditingPrimeContractor] = useState(false);
  const [editedPrimeContractor, setEditedPrimeContractor] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [addPositionModalOpen, setAddPositionModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [advancedModalOpen, setAdvancedModalOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const urlsRefreshedRef = useRef(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (proposalId) {
      fetchProposal(proposalId).then(() => {
        // Refresh document URLs once after loading proposal (prevent duplicate calls)
        if (!urlsRefreshedRef.current) {
          urlsRefreshedRef.current = true;
          proposalsApi.refreshDocumentUrls(proposalId).then((updatedProposal) => {
            // Update store directly with fresh URLs (no re-fetch needed)
            setCurrentProposal(updatedProposal);
          }).catch(err => console.error('Failed to refresh document URLs:', err));
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  // Load pricing data when proposal is completed
  useEffect(() => {
    const loadPricingData = async () => {
      if (currentProposal?.status === 'completed' && proposalId && !pricingLoaded) {
        // Always fetch fresh data from API (don't use cached currentProposal)
        await loadProposal(proposalId);
        // Transform to advanced format immediately so we can show expandable grid in initial view
        transformToAdvanced();
        setPricingLoaded(true);
      }
    };

    loadPricingData();

    return () => {
      if (pricingLoaded) {
        reset();
        setPricingLoaded(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProposal?.status, proposalId, pricingLoaded]);

  // Poll status if proposal is processing
  useEffect(() => {
    // Only start polling if status is 'processing'
    if (!currentProposal || currentProposal.status !== 'processing') {
      return;
    }

    setIsPolling(true);
    let isActive = true;

    const poll = async () => {
      if (!isActive) return;

      try {
        const status = await proposalsApi.getStatus(proposalId);
        setPollingStatus(status);

        // If completed or error, stop polling and refresh proposal
        if (status.status === 'completed' || status.status === 'error') {
          setIsPolling(false);
          await fetchProposal(proposalId);
          // Don't schedule next poll
          return;
        }

        // Schedule next poll only if still processing
        if (isActive && status.status === 'processing') {
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error('Polling error:', error);
        setIsPolling(false);
      }
    };

    // Start polling
    poll();

    // Cleanup function
    return () => {
      isActive = false;
      setIsPolling(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProposal?.status, proposalId]);

  const handleSaveSolicitation = async () => {
    if (!currentProposal) return;

    setIsSaving(true);
    const oldSolicitation = currentProposal.solicitation_number;

    try {
      // Optimistically update local state immediately
      const { setCurrentProposal } = useProposalsStore.getState();
      setCurrentProposal({
        ...currentProposal,
        solicitation_number: editedSolicitation.trim() || undefined,
      });

      setIsEditingSolicitation(false);

      // Save to MongoDB in background (no page refresh)
      await proposalsApi.update(currentProposal.id, {
        solicitation_number: editedSolicitation.trim() || undefined
      });
    } catch (error) {
      console.error('Failed to update solicitation number:', error);
      toast.error('Failed to update solicitation number');
      // Revert on error
      const { setCurrentProposal } = useProposalsStore.getState();
      setCurrentProposal({
        ...currentProposal,
        solicitation_number: oldSolicitation,
      });
      setEditedSolicitation(oldSolicitation || '');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingSolicitation(false);
    setEditedSolicitation(currentProposal?.solicitation_number || '');
  };

  const handleStartEdit = () => {
    setEditedSolicitation(currentProposal?.solicitation_number || '');
    setIsEditingSolicitation(true);
  };

  const handleSaveProposalName = async () => {
    console.log('Saving proposal name:', editedName);
    if (!editedName.trim()) {
      toast.error('Proposal name cannot be empty');
      return;
    }

    setIsSaving(true);
    const oldName = currentProposal?.name;

    try {
      // Optimistically update local state immediately
      if (currentProposal) {
        const { setCurrentProposal } = useProposalsStore.getState();
        setCurrentProposal({
          ...currentProposal,
          name: editedName.trim(),
        });
      }

      setIsEditingName(false);

      // Save to MongoDB in background (no page refresh)
      await proposalsApi.update(proposalId, {
        name: editedName.trim(),
      });
    } catch (error) {
      console.error('Failed to update proposal name:', error);
      toast.error('Failed to update proposal name');
      // Revert on error
      if (currentProposal && oldName) {
        const { setCurrentProposal } = useProposalsStore.getState();
        setCurrentProposal({
          ...currentProposal,
          name: oldName,
        });
        setEditedName(oldName);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditedName(currentProposal?.name || '');
  };

  const handleStartEditName = () => {
    setEditedName(currentProposal?.name || '');
    setIsEditingName(true);
  };

  const handleSavePrimeContractor = async () => {
    if (!currentProposal) return;

    setIsSaving(true);
    const oldPrimeContractor = currentProposal.prime_contractor_name;
    const updatedName = editedPrimeContractor.trim() || 'TBD';

    try {
      // Optimistically update local state immediately
      const { setCurrentProposal } = useProposalsStore.getState();
      setCurrentProposal({
        ...currentProposal,
        prime_contractor_name: updatedName,
      });

      setIsEditingPrimeContractor(false);

      // Save to MongoDB in background (no page refresh)
      await proposalsApi.update(proposalId, {
        prime_contractor_name: updatedName
      });
    } catch (error) {
      console.error('Failed to update prime contractor name:', error);
      toast.error('Failed to update prime contractor name');
      // Revert on error
      const { setCurrentProposal } = useProposalsStore.getState();
      setCurrentProposal({
        ...currentProposal,
        prime_contractor_name: oldPrimeContractor,
      });
      setEditedPrimeContractor(oldPrimeContractor || '');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEditPrimeContractor = () => {
    setIsEditingPrimeContractor(false);
    setEditedPrimeContractor(currentProposal?.prime_contractor_name || '');
  };

  const handleStartEditPrimeContractor = () => {
    setEditedPrimeContractor(currentProposal?.prime_contractor_name || '');
    setIsEditingPrimeContractor(true);
  };

  const handleRetryProcessing = async () => {
    setIsRetrying(true);
    try {
      await proposalsApi.retry(proposalId);
      // Refresh proposal to get updated status (should be "processing")
      await fetchProposal(proposalId);
      toast.success('Processing restarted');
    } catch (error: any) {
      console.error('Retry failed:', error);
      toast.error(error?.response?.data?.detail || 'Failed to retry processing');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleUpdateBusinessStatus = async (newStatus: 'active' | 'no-bid' | 'submitted') => {
    if (!currentProposal || currentProposal.business_status === newStatus) {
      setStatusDropdownOpen(false);
      return;
    }

    setStatusDropdownOpen(false);
    setIsUpdatingStatus(true);
    const oldStatus = currentProposal.business_status;

    try {
      // Optimistically update local state
      setCurrentProposal({
        ...currentProposal,
        business_status: newStatus,
      });

      // Update in backend
      await proposalsApi.updateBusinessStatus(proposalId, newStatus);

      const statusLabels = {
        'active': 'Active',
        'no-bid': 'No-Bid',
        'submitted': 'Submitted'
      };
      toast.success(`Proposal marked as ${statusLabels[newStatus]}`);
    } catch (error: any) {
      console.error('Failed to update business status:', error);
      toast.error(error?.response?.data?.detail || 'Failed to update status');
      // Revert on error
      setCurrentProposal({
        ...currentProposal,
        business_status: oldStatus,
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (isLoading || !currentProposal) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const renderProcessingView = () => (
    <Card>
      <CardHeader>
        <CardTitle>Processing Documents</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12">
          <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto mb-4" />
          <p className="text-lg text-foreground mb-2">
            {pollingStatus?.message || 'Processing your documents...'}
          </p>
          <div className="w-full max-w-md mx-auto mt-6">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${pollingStatus?.progress || 0}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {pollingStatus?.progress || 0}% complete
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderErrorView = () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-red-600">Processing Error</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <p className="text-lg text-foreground mb-2">Failed to process documents</p>
          <p className="text-sm text-muted-foreground mb-6">
            {currentProposal.message || 'An error occurred during processing'}
          </p>
          <div className="flex items-center justify-center space-x-4">
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Back to Dashboard
            </Button>
            <Button
              variant="primary"
              onClick={handleRetryProcessing}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                'Retry Processing'
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const handleAddPosition = () => {
    setAddPositionModalOpen(true);
  };

  const handleAdvancedAnalysis = async () => {
    // Check if first time (subcontractors not yet configured)
    if (!subcontractorConfigured) {
      // Show questionnaire modal first
      setAdvancedModalOpen(true);
      return;
    }

    setIsProcessingPayment(true);

    // Check if already paid for advanced analysis
    try {
      const billing = await getProposalBilling(proposalId);
      const advancedBilling = billing.advanced;

      if (advancedBilling && advancedBilling.status === 'succeeded') {
        // Already paid - skip payment flow
        toast.success('Advanced mode activated');
        transformToAdvanced();
        enableAdvancedMode();
        await recalculate();
        return;
      }

      // Not paid yet - charge for advanced mode
      const result = await chargeForProposal(proposalId, 'advanced');

      if (result.already_charged) {
        toast.success('Advanced mode already activated');
      } else {
        toast.success('Payment successful! Advanced mode activated');
      }

      // Proceed to advanced mode
      transformToAdvanced();
      enableAdvancedMode();
      await recalculate();
    } catch (error: any) {
      console.error('Payment failed:', error);
      const errorMsg = error.response?.data?.detail || 'Payment failed. Please check your payment method.';
      toast.error(errorMsg);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleAdvancedModalSubmit = async (subs: SubcontractorInfo[]) => {
    // Close modal first
    setAdvancedModalOpen(false);
    setIsProcessingPayment(true);

    // Check if already paid for advanced analysis
    try {
      const billing = await getProposalBilling(proposalId);
      const advancedBilling = billing.advanced;

      if (advancedBilling && advancedBilling.status === 'succeeded') {
        // Already paid - skip payment flow
        toast.success('Advanced mode activated');
      } else {
        // Not paid yet - charge for advanced mode
        const result = await chargeForProposal(proposalId, 'advanced');

        if (result.already_charged) {
          toast.success('Advanced mode already activated');
        } else {
          toast.success('Payment successful! Advanced mode activated');
        }
      }

      // Pre-create subcontractors if any were specified
      if (subs.length > 0) {
        preCreateSubcontractors(subs);

        // Auto-allocate workshare % from eligible positions (excludes key positions like PM, FA)
        // This runs after preCreateSubcontractors so subcontractors have worksharePercent
        await usePricingStore.getState().autoAllocateWorkshare();
      } else {
        // Mark as configured even if no subs (user clicked Skip or Continue with 0 subs)
        usePricingStore.setState({ subcontractorConfigured: true });
      }

      // Now proceed to advanced mode
      transformToAdvanced();
      enableAdvancedMode();
      await recalculate();
    } catch (error: any) {
      console.error('Payment failed:', error);
      const errorMsg = error.response?.data?.detail || 'Payment failed. Please check your payment method.';
      toast.error(errorMsg);
      // Don't enable advanced mode if payment fails
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const renderPricingWorkspace = () => (
    <div className="space-y-2">
      {/* Pricing Workspace - Both initial and advanced show tabs */}
      <Card>
        <CardContent className="pt-4">
          {/* Tab Navigation - mode determines which tabs are shown */}
          <PricingTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hasSubcontractors={subcontractors.length > 0}
            hasFiles={(currentProposal?.documents?.length ?? 0) > 0}
            mode={advancedMode ? 'advanced' : 'initial'}
          />

          {/* Tab Content */}
          <div className="mt-4">
            {activeTab === 'files' && (
              <FilesTab
                documents={currentProposal?.documents || []}
                proposalId={proposalId}
                onUrlsRefreshed={(updatedDocs) => {
                  if (currentProposal) {
                    setCurrentProposal({ ...currentProposal, documents: updatedDocs });
                  }
                }}
              />
            )}
            {activeTab === 'overview' && <OverviewTab key={`${rates.fringe}-${rates.oh}-${rates.ga}-${rates.fee}`} />}
            {activeTab === 'main' && (
              <div>
                <AdvancedAnalysisGrid isAdvancedMode={advancedMode} />
              </div>
            )}
            {activeTab === 'subcontractors' && advancedMode && <SubcontractorSection />}
            {activeTab === 'rate-table' && advancedMode && (
              <RateTableView
                subcontractors={subcontractors}
                feeRate={rates.sub_fee || 0.05}
                smhRate={rates.smh || 0.065}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Back button */}
      <div>
        {advancedMode ? (
          <Button variant="outline" onClick={disableAdvancedMode}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Initial Analysis
          </Button>
        ) : (
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="w-full px-6">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-wrap mt-2">
            {/* Proposal Name with Inline Edit */}
            <div className="flex items-center gap-2">
              {!isEditingName ? (
                <h1
                  className="text-lg font-bold text-foreground cursor-text hover:bg-muted/30 px-2 py-1 rounded transition-colors"
                  onDoubleClick={handleStartEditName}
                  title="Double-click to edit"
                >
                  {currentProposal.name}
                </h1>
              ) : (
                <Input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onBlur={handleSaveProposalName}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      handleCancelEditName();
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveProposalName();
                    }
                  }}
                  placeholder="Enter proposal name"
                  className="w-96"
                  autoFocus
                />
              )}
            </div>
            {/* Solicitation Number with Inline Edit */}
            <div className="flex items-center gap-2">
              {!isEditingSolicitation ? (
                <p
                  className="text-sm text-muted-foreground cursor-text hover:bg-muted/30 px-2 py-1 rounded transition-colors"
                  onDoubleClick={handleStartEdit}
                  title="Double-click to edit"
                >
                  {currentProposal.solicitation_number || 'No solicitation number'}
                </p>
              ) : (
                <Input
                  type="text"
                  value={editedSolicitation}
                  onChange={(e) => setEditedSolicitation(e.target.value)}
                  onBlur={handleSaveSolicitation}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      handleCancelEdit();
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveSolicitation();
                    }
                  }}
                  placeholder="Enter solicitation number"
                  className="w-64"
                  autoFocus
                />
              )}
            </div>
            {/* Prime Contractor with Inline Edit */}
            <div className="flex items-center gap-2">
              {!isEditingPrimeContractor ? (
                <p
                  className="text-sm text-muted-foreground cursor-text hover:bg-muted/30 px-2 py-1 rounded transition-colors"
                  onDoubleClick={handleStartEditPrimeContractor}
                  title="Double-click to edit"
                >
                  Prime Contractor: {currentProposal.prime_contractor_name || 'Not specified'}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Prime Contractor:</span>
                  <Input
                    type="text"
                    value={editedPrimeContractor}
                    onChange={(e) => setEditedPrimeContractor(e.target.value)}
                    onBlur={handleSavePrimeContractor}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        handleCancelEditPrimeContractor();
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSavePrimeContractor();
                      }
                    }}
                    placeholder="Enter prime contractor name"
                    className="w-64"
                    autoFocus
                  />
                </div>
              )}
            </div>
          </div>
          {/* Action buttons */}
          <div className="mt-2 flex items-center gap-2">
            {/* Business Status Dropdown - only show for completed proposals */}
            {currentProposal.status === 'completed' && (
              <div className="relative" ref={statusDropdownRef}>
                <button
                  onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                  disabled={isUpdatingStatus}
                  className={`
                    inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-all duration-200
                    ${currentProposal.business_status === 'active'
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : currentProposal.business_status === 'no-bid'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : currentProposal.business_status === 'submitted'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-background border-border text-foreground'}
                    hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {isUpdatingStatus ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : currentProposal.business_status === 'active' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : currentProposal.business_status === 'no-bid' ? (
                    <XCircle className="w-4 h-4" />
                  ) : currentProposal.business_status === 'submitted' ? (
                    <Send className="w-4 h-4" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  <span>
                    {currentProposal.business_status === 'active' ? 'Active' :
                     currentProposal.business_status === 'no-bid' ? 'No-Bid' :
                     currentProposal.business_status === 'submitted' ? 'Submitted' : 'Active'}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${statusDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {statusDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-44 bg-background border border-border rounded-lg shadow-lg py-1 z-50">
                    <button
                      onClick={() => handleUpdateBusinessStatus('active')}
                      className={`
                        w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors
                        ${currentProposal.business_status === 'active'
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-foreground hover:bg-muted'}
                      `}
                    >
                      <CheckCircle className={`w-4 h-4 ${currentProposal.business_status === 'active' ? 'text-blue-600' : 'text-muted-foreground'}`} />
                      <span>Active</span>
                      {currentProposal.business_status === 'active' && (
                        <CheckCircle className="w-3.5 h-3.5 ml-auto text-blue-600" />
                      )}
                    </button>
                    <button
                      onClick={() => handleUpdateBusinessStatus('no-bid')}
                      className={`
                        w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors
                        ${currentProposal.business_status === 'no-bid'
                          ? 'bg-amber-50 text-amber-700'
                          : 'text-foreground hover:bg-muted'}
                      `}
                    >
                      <XCircle className={`w-4 h-4 ${currentProposal.business_status === 'no-bid' ? 'text-amber-600' : 'text-muted-foreground'}`} />
                      <span>No-Bid</span>
                      {currentProposal.business_status === 'no-bid' && (
                        <CheckCircle className="w-3.5 h-3.5 ml-auto text-amber-600" />
                      )}
                    </button>
                    <button
                      onClick={() => handleUpdateBusinessStatus('submitted')}
                      className={`
                        w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors
                        ${currentProposal.business_status === 'submitted'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'text-foreground hover:bg-muted'}
                      `}
                    >
                      <Send className={`w-4 h-4 ${currentProposal.business_status === 'submitted' ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                      <span>Submitted</span>
                      {currentProposal.business_status === 'submitted' && (
                        <CheckCircle className="w-3.5 h-3.5 ml-auto text-emerald-600" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Share button (admin only) */}
            {currentProposal.status === 'completed' && user?.role === 'admin' && (
              <Button
                variant="outline"
                onClick={() => setShareModalOpen(true)}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            )}
            {/* Advanced Analysis or Export Excel button */}
            {currentProposal.status === 'completed' && (
              <>
                {!advancedMode ? (
                  <Button
                    variant="primary"
                    onClick={handleAdvancedAnalysis}
                    disabled={isRecalculating || isProcessingPayment}
                  >
                    {isProcessingPayment ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing Payment...
                      </>
                    ) : isRecalculating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Calculating...
                      </>
                    ) : (
                      'Advanced Analysis'
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Pass current prime contractor name to export
                      exportToExcel({
                        primeContractorName: currentProposal?.prime_contractor_name || 'TBD'
                      });
                    }}
                    disabled={isRecalculating}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export to Excel
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {currentProposal.status === 'processing' && renderProcessingView()}
        {currentProposal.status === 'error' && renderErrorView()}
        {currentProposal.status === 'completed' && renderPricingWorkspace()}
      </div>

      {/* Add Position Modal */}
      <AddPositionModal
        open={addPositionModalOpen}
        onClose={() => setAddPositionModalOpen(false)}
        positions={positions}
        totalYears={totalYears}
        onAdd={(positionData) => {
          addPosition(positionData);
          setAddPositionModalOpen(false);
        }}
      />

      {/* Share/Invite Modal */}
      <ShareOrInviteModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        proposalId={proposalId}
        proposalName={currentProposal?.name || ''}
      />

      {/* Advanced Analysis Questionnaire Modal */}
      <AdvancedAnalysisModal
        open={advancedModalOpen}
        onClose={() => setAdvancedModalOpen(false)}
        onSubmit={handleAdvancedModalSubmit}
      />
    </DashboardLayout>
  );
}
