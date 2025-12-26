'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { proposalsApi } from '@/lib/api/proposals';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import AdvancedAnalysisGrid from '@/components/pricing/AdvancedAnalysisGrid';
import OverviewTab from '@/components/pricing/OverviewTab';
import RateTableView from '@/components/pricing/RateTableView';
import PricingTabs from '@/components/pricing/PricingTabs';
import AddPositionModal from '@/components/pricing/AddPositionModal';
import { SubcontractorSection } from '@/components/pricing/SubcontractorSection';
import { Loader2, AlertCircle, ArrowLeft, Plus, Download, Pencil, Check, X } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';

export default function ProposalPage() {
  const params = useParams();
  const router = useRouter();
  const proposalId = params.id as string;
  const toast = useToast();

  const { currentProposal, fetchProposal, isLoading } = useProposalsStore();
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
    transformToAdvanced,
    advancedMode,
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

  useEffect(() => {
    if (proposalId) {
      fetchProposal(proposalId);
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
    try {
      await proposalsApi.update(currentProposal.id, {
        solicitation_number: editedSolicitation.trim() || undefined
      });
      await fetchProposal(proposalId);
      setIsEditingSolicitation(false);
    } catch (error) {
      console.error('Failed to update solicitation number:', error);
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
    try {
      await proposalsApi.update(proposalId, {
        name: editedName.trim(),
      });
      await fetchProposal(proposalId);
      setIsEditingName(false);
      toast.success('Proposal name updated successfully');
    } catch (error) {
      console.error('Failed to update proposal name:', error);
      toast.error('Failed to update proposal name');
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
    setIsSaving(true);
    try {
      const updatedName = editedPrimeContractor.trim() || 'TBD';
      await proposalsApi.update(proposalId, {
        prime_contractor_name: updatedName
      });

      // Reload proposal data
      await fetchProposal(proposalId);

      setIsEditingPrimeContractor(false);
      toast.success('Prime contractor name updated');
    } catch (error) {
      console.error('Failed to update prime contractor name:', error);
      toast.error('Failed to update prime contractor name');
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
            <Button variant="primary" onClick={() => router.push('/dashboard/upload')}>
              Try Again
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
    // Transform basic positions to advanced format
    transformToAdvanced();

    // Enable advanced mode
    enableAdvancedMode();

    // Call recalculate API
    await recalculate();
  };

  const renderPricingWorkspace = () => (
    <div className="space-y-2">
      {/* Pricing Workspace - Both initial and advanced show tabs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{advancedMode ? 'Advanced Analysis' : 'Initial Analysis'}</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {/* Tab Navigation - mode determines which tabs are shown */}
          <PricingTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hasSubcontractors={subcontractors.length > 0}
            mode={advancedMode ? 'advanced' : 'initial'}
          />

          {/* Tab Content */}
          <div className="mt-4">
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
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="w-full px-4">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            {/* Proposal Name with Inline Edit */}
            <div className="flex items-center gap-2 mb-2">
              {!isEditingName ? (
                <>
                  <h1 className="text-lg font-bold text-foreground">
                    {currentProposal.name}
                  </h1>
                  <button
                    onClick={handleStartEditName}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit proposal name"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveProposalName();
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        handleCancelEditName();
                      }
                    }}
                    placeholder="Enter proposal name"
                    className="w-96"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="p-2 text-green-600 hover:text-green-700 disabled:opacity-50 hover:bg-green-50 rounded transition-colors"
                    title="Save"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEditName}
                    disabled={isSaving}
                    className="p-2 text-red-600 hover:text-red-700 disabled:opacity-50 hover:bg-red-50 rounded transition-colors"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
            {/* Solicitation Number with Inline Edit */}
            <div className="flex items-center gap-2">
              {!isEditingSolicitation ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {currentProposal.solicitation_number || 'No solicitation number'}
                  </p>
                  <button
                    onClick={handleStartEdit}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit solicitation number"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={editedSolicitation}
                    onChange={(e) => setEditedSolicitation(e.target.value)}
                    placeholder="Enter solicitation number"
                    className="w-64"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveSolicitation}
                    disabled={isSaving}
                    className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                    title="Save"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="p-1 text-red-600 hover:text-red-700 disabled:opacity-50"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            {/* Prime Contractor with Inline Edit */}
            <div className="flex items-center gap-2 mt-1">
              {!isEditingPrimeContractor ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Prime Contractor: {currentProposal.prime_contractor_name || 'Not specified'}
                  </p>
                  <button
                    onClick={handleStartEditPrimeContractor}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit prime contractor name"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSavePrimeContractor();
                  }}
                  className="flex items-center gap-2"
                >
                  <span className="text-sm text-muted-foreground"> Prime Contractor Name:</span>
                  <Input
                    type="text"
                    value={editedPrimeContractor}
                    onChange={(e) => setEditedPrimeContractor(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        handleCancelEditPrimeContractor();
                      }
                    }}
                    placeholder="Enter prime contractor name"
                    className="w-64"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50 hover:bg-green-50 rounded transition-colors"
                    title="Save"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEditPrimeContractor}
                    disabled={isSaving}
                    className="p-1 text-red-600 hover:text-red-700 disabled:opacity-50 hover:bg-red-50 rounded transition-colors"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
          {/* Advanced Analysis or Export Excel button */}
          {currentProposal.status === 'completed' && (
            <>
              {!advancedMode ? (
                <Button
                  variant="primary"
                  onClick={handleAdvancedAnalysis}
                  disabled={isRecalculating}
                >
                  {isRecalculating ? (
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
    </DashboardLayout>
  );
}
