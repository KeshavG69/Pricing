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
import PositionsGrid from '@/components/pricing/PositionsGrid';
import AdvancedAnalysisGrid from '@/components/pricing/AdvancedAnalysisGrid';
import OverviewTab from '@/components/pricing/OverviewTab';
import RateTableView from '@/components/pricing/RateTableView';
import PricingTabs from '@/components/pricing/PricingTabs';
import AddPositionModal from '@/components/pricing/AddPositionModal';
import { Loader2, CheckCircle, AlertCircle, ArrowLeft, Plus, Download, Pencil, Check, X } from 'lucide-react';

export default function ProposalPage() {
  const params = useParams();
  const router = useRouter();
  const proposalId = params.id as string;

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
    if (currentProposal?.status === 'completed' && proposalId && !pricingLoaded) {
      // Always fetch fresh data from API (don't use cached currentProposal)
      loadProposal(proposalId);
      setPricingLoaded(true);
    }

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
    <div className="space-y-6">
      {/* Success message with Advanced Analysis button */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  Processing Complete!
                </h3>
                <p className="text-sm text-muted-foreground">
                  {positions.length} job position{positions.length !== 1 ? 's' : ''} extracted - view and edit data below
                </p>
              </div>
            </div>
            {!advancedMode && (
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
            )}
            {advancedMode && (
              <div className="text-sm text-emerald-600 font-semibold">
                ✓ Advanced Mode Active
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pricing Workspace */}
      {!advancedMode ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Job Positions & Pricing</CardTitle>
              <Button variant="outline" size="sm" onClick={handleAddPosition}>
                <Plus className="w-4 h-4 mr-2" />
                Add Position
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pl-0">
            <div className="h-[600px]">
              <PositionsGrid />
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Advanced Mode with Tabs */
        <Card>
          <CardHeader>
            <CardTitle>Advanced Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Tab Navigation */}
            <PricingTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              hasSubcontractors={subcontractors.length > 0}
            />

            {/* Tab Content */}
            <div className="mt-6">
              {activeTab === 'overview' && <OverviewTab />}
              {activeTab === 'main' && (
                <div className="overflow-y-auto" style={{ maxHeight: '800px' }}>
                  <AdvancedAnalysisGrid />
                </div>
              )}
              {activeTab === 'rate-table' && (
                <RateTableView
                  subcontractors={subcontractors}
                  feeRate={rates.sub_fee || 0.05}
                  smhRate={rates.smh || 0.065}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
      <div className="max-w-[1800px] mx-auto">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-foreground mb-2">
              {currentProposal.name}
            </h1>
            {/* Solicitation Number with Inline Edit */}
            <div className="flex items-center gap-2">
              {!isEditingSolicitation ? (
                <>
                  <p className="text-muted-foreground">
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
          </div>
          {currentProposal.status === 'completed' && (
            <Button
              variant="outline"
              onClick={exportToExcel}
              disabled={isRecalculating}
            >
              <Download className="w-4 h-4 mr-2" />
              Export to Excel
            </Button>
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
