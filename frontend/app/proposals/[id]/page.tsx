'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { proposalsApi } from '@/lib/api/proposals';
import { chargeForProposal, getProposalBilling } from '@/lib/api/billing';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import AdvancedAnalysisGrid from '@/components/pricing/AdvancedAnalysisGrid';
import OverviewTab from '@/components/pricing/OverviewTab';
import PricingTabs from '@/components/pricing/PricingTabs';
import FilesTab from '@/components/pricing/FilesTab';
import AddPositionModal from '@/components/pricing/AddPositionModal';
import { SubcontractorSection } from '@/components/pricing/SubcontractorSection';
import { WageDataSection } from '@/components/pricing/sections/WageDataSection';
import { AdvancedAnalysisModal, SubcontractorInfo } from '@/components/pricing/AdvancedAnalysisModal';
import PricingChatPanel from '@/components/pricing/PricingChatPanel';
import ChargeConfirmationModal from '@/components/ui/ChargeConfirmationModal';
import ParserEventFeed from '@/components/ui/ParserEventFeed';
import { useProposalEvents } from '@/lib/hooks/useProposalEvents';
import { Loader2, AlertCircle, Download, Share2, CheckCircle, XCircle, Send, ChevronDown, Save } from 'lucide-react';
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
    positionsAdvanced,
    subcontractors,
    rates,
    totalYears,
    addPosition,
    reset,
    recalculate,
    isRecalculating,
    enableAdvancedMode,
    transformToAdvanced,
    advancedMode,
    subcontractorConfigured,
    preCreateSubcontractors,
    activeTab,
    setActiveTab,
    exportToExcel,
    saveProposal,
    isSaving: isPricingSaving,
  } = usePricingStore();
  const [pollingStatus, setPollingStatus] = useState<any>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Stream intelligent-parser events while the proposal is processing — same
  // feed the upload page shows, so a user who navigates away and reopens a
  // still-processing proposal sees the live reasoning instead of a spinner.
  const isProcessingStatus =
    (pollingStatus?.status ?? currentProposal?.status) === 'processing';
  const parserEvents = useProposalEvents(
    isProcessingStatus ? proposalId : null,
  );
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
  const [showAdvancedChargeConfirmation, setShowAdvancedChargeConfirmation] = useState(false);
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
      console.log('[ProposalPage] Fetching proposal:', proposalId);
      fetchProposal(proposalId).then(() => {
        // fetchProposal updates currentProposal in the store
        const proposal = useProposalsStore.getState().currentProposal;
        console.log('[ProposalPage] Proposal fetched:', {
          id: proposal?.id,
          status: proposal?.status,
          message: proposal?.message,
          progress: proposal?.progress
        });

        // Refresh document URLs once after loading proposal (prevent duplicate calls)
        if (!urlsRefreshedRef.current && proposal) {
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

    console.log('[Polling] Starting status polling for proposal:', proposalId);
    setIsPolling(true);
    let isActive = true;
    let pollCount = 0;
    let consecutiveErrors = 0;

    const poll = async () => {
      if (!isActive) return;
      pollCount++;

      try {
        console.log(`[Polling] Poll #${pollCount} - Checking status...`);
        const status = await proposalsApi.getStatus(proposalId);
        console.log(`[Polling] Poll #${pollCount} - Status:`, status);
        setPollingStatus(status);

        // Reset error counter on successful poll
        consecutiveErrors = 0;

        // If completed or error, stop polling and refresh proposal
        if (status.status === 'completed' || status.status === 'error') {
          console.log(`[Polling] Processing ${status.status}, stopping poll and refreshing proposal`);
          setIsPolling(false);
          await fetchProposal(proposalId);

          // Reload page on completion to ensure fresh state
          if (status.status === 'completed') {
            toast.success('Processing complete! Reloading...');
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          }
          return;
        }

        // Schedule next poll only if still processing
        if (isActive && status.status === 'processing') {
          console.log('[Polling] Still processing, scheduling next poll in 30 seconds...');
          setTimeout(poll, 30000); // Poll every 30 seconds
        }
      } catch (error: any) {
        consecutiveErrors++;
        console.error(`[Polling] Error (${consecutiveErrors}/3):`, error);

        // After 3 consecutive failures, stop polling and show message
        if (consecutiveErrors >= 3) {
          console.error('[Polling] Too many consecutive errors, stopping');
          setIsPolling(false);
          toast.error('Unable to check processing status. Please refresh the page.');
        } else if (isActive) {
          // Retry after 30 seconds
          console.log('[Polling] Retrying in 30 seconds...');
          setTimeout(poll, 30000);
        }
      }
    };

    // Start polling immediately
    poll();

    // Cleanup function
    return () => {
      console.log('[Polling] Cleanup - stopping poll');
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

  const handleManualSave = async () => {
    const result = await saveProposal();
    if (result.success) {
      toast.success('Saved successfully');
    } else {
      toast.error(result.error || 'Failed to save');
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
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const renderProcessingView = () => (
    <Card>
      <CardContent className="py-10">
        <ParserEventFeed
          events={parserEvents}
          status="processing"
          fallbackMessage={
            pollingStatus?.message ||
            currentProposal?.message ||
            'Processing your documents…'
          }
        />
        <p className="text-xs text-muted-foreground text-center mt-8">
          You can safely close this page — processing will continue in the background.
        </p>
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
    // Check if already paid for advanced analysis
    try {
      const billing = await getProposalBilling(proposalId);
      const advancedBilling = billing.advanced;

      if (advancedBilling && advancedBilling.status === 'succeeded') {
        // Already paid - check if subcontractors configured
        if (!subcontractorConfigured) {
          // Show questionnaire modal
          setAdvancedModalOpen(true);
          return;
        }

        // Already paid and configured - activate directly
        toast.success('Advanced mode activated');
        transformToAdvanced();
        enableAdvancedMode();
        await recalculate();
        return;
      }

      // Not paid yet - show charge confirmation modal FIRST
      setShowAdvancedChargeConfirmation(true);
    } catch (error: any) {
      console.error('Failed to check billing:', error);
      toast.error('Failed to check payment status. Please try again.');
    }
  };

  const confirmAndActivateAdvanced = async () => {
    setIsProcessingPayment(true);

    try {
      // Charge for advanced mode
      const result = await chargeForProposal(proposalId, 'advanced');

      if (result.already_charged) {
        toast.success('Advanced mode already activated');
      } else {
        toast.success('Payment successful!');
      }

      // Close charge modal
      setShowAdvancedChargeConfirmation(false);

      // Check if subcontractors configured
      if (!subcontractorConfigured) {
        // Show subcontractor questionnaire modal AFTER payment
        setIsProcessingPayment(false);
        setAdvancedModalOpen(true);
        return;
      }

      // Already configured - activate directly
      transformToAdvanced();
      enableAdvancedMode();
      await recalculate();
      toast.success('Advanced mode activated');
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

    try {
      // Pre-create subcontractors if any were specified
      if (subs.length > 0) {
        preCreateSubcontractors(subs);

        // Auto-allocate workshare % from eligible positions (excludes key positions like PM, FA)
        await usePricingStore.getState().autoAllocateWorkshare();
      } else {
        // Mark as configured even if no subs (user clicked Skip or Continue with 0 subs)
        usePricingStore.setState({ subcontractorConfigured: true });
      }

      // Now proceed to advanced mode (payment already done)
      transformToAdvanced();
      enableAdvancedMode();
      await recalculate();
      toast.success('Advanced mode activated');
    } catch (error: any) {
      console.error('Failed to activate advanced mode:', error);
      toast.error('Failed to activate advanced mode. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const renderPricingWorkspace = () => (
    <div className="space-y-2">
      {/* Pricing Workspace - Both initial and advanced show tabs */}
      <Card>
        {/* Tab Navigation - mode determines which tabs are shown */}
        <PricingTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          hasFiles={(currentProposal?.documents?.length ?? 0) > 0}
          mode={advancedMode ? 'advanced' : 'initial'}
        />

        <CardContent className="pt-0">
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
            {activeTab === 'wage-data' && <WageDataSection positions={positionsAdvanced} />}
            {activeTab === 'subcontractors' && advancedMode && <SubcontractorSection />}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <>
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
            {/* Save button (shows in both basic and advanced mode) */}
            {currentProposal.status === 'completed' && (
              <Button
                variant="outline"
                onClick={handleManualSave}
                disabled={isPricingSaving || isRecalculating}
              >
                {isPricingSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </>
                )}
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

      {/* Advanced Mode Charge Confirmation Modal */}
      <ChargeConfirmationModal
        isOpen={showAdvancedChargeConfirmation}
        onClose={() => setShowAdvancedChargeConfirmation(false)}
        onConfirm={confirmAndActivateAdvanced}
        title="Confirm Advanced Analysis"
        description="Unlock advanced features including FBLR breakdown, subcontractor management, and rate table calculations."
        amount={Number(process.env.NEXT_PUBLIC_ADVANCED_ANALYSIS_PRICE) || 250}
        currency="USD"
        isLoading={isProcessingPayment}
        features={[
          'Subcontractor labor management',
          'Automatic workshare allocation',
          'Target rate table for subcontractors',
          'Excel export with detailed calculations',
        ]}
      />

      {/* Pricing chat assistant — floating panel */}
      <PricingChatPanel />
    </>
  );
}
