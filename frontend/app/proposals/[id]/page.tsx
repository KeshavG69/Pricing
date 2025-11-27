'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { proposalsApi } from '@/lib/api/proposals';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PricingSidebar from '@/components/pricing/PricingSidebar';
import PositionsGrid from '@/components/pricing/PositionsGrid';
import AdvancedAnalysisGrid from '@/components/pricing/AdvancedAnalysisGrid';
import { Loader2, CheckCircle, AlertCircle, ArrowLeft, Plus } from 'lucide-react';

export default function ProposalPage() {
  const params = useParams();
  const router = useRouter();
  const proposalId = params.id as string;

  const { currentProposal, fetchProposal, isLoading } = useProposalsStore();
  const {
    loadProposal,
    proposalName,
    addPosition,
    reset,
    recalculate,
    isRecalculating,
    enableAdvancedMode,
    transformToAdvanced,
    advancedMode,
  } = usePricingStore();
  const [pollingStatus, setPollingStatus] = useState<any>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pricingLoaded, setPricingLoaded] = useState(false);

  useEffect(() => {
    if (proposalId) {
      fetchProposal(proposalId);
    }
  }, [proposalId, fetchProposal]);

  // Load pricing data when proposal is completed
  useEffect(() => {
    if (currentProposal?.status === 'completed' && proposalId && !pricingLoaded) {
      loadProposal(proposalId);
      setPricingLoaded(true);
    }

    return () => {
      if (pricingLoaded) {
        reset();
        setPricingLoaded(false);
      }
    };
  }, [currentProposal, proposalId, loadProposal, reset, pricingLoaded]);

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
  }, [currentProposal?.status, proposalId, fetchProposal]);

  if (isLoading || !currentProposal) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
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
          <Loader2 className="w-16 h-16 text-sky-400 animate-spin mx-auto mb-4" />
          <p className="text-lg text-slate-50 mb-2">
            {pollingStatus?.message || 'Processing your documents...'}
          </p>
          <div className="w-full max-w-md mx-auto mt-6">
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-500"
                style={{ width: `${pollingStatus?.progress || 0}%` }}
              />
            </div>
            <p className="text-sm text-slate-400 mt-2">
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
        <CardTitle className="text-red-400">Processing Error</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <p className="text-lg text-slate-50 mb-2">Failed to process documents</p>
          <p className="text-sm text-slate-400 mb-6">
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
    addPosition({
      labor_category: 'New Position',
      percentile: '50th',
      hours_per_year: { '1': 1880 },
      wage_10th: 0,
      wage_25th: 0,
      wage_50th: 0,
      wage_75th: 0,
      wage_90th: 0,
    });
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
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-50 mb-1">
                  Processing Complete!
                </h3>
                <p className="text-sm text-slate-400">
                  {currentProposal.metadata?.total_jobs || 0} job positions extracted - view and edit data below
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
                  '🚀 Advanced Analysis'
                )}
              </Button>
            )}
            {advancedMode && (
              <div className="text-sm text-emerald-400 font-semibold">
                ✓ Advanced Mode Active
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pricing Workspace */}
      <div className="flex gap-6">
        {/* Left: Spreadsheet (70%) */}
        <div className="flex-1">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {advancedMode ? 'Cost Proposal Spreadsheet' : 'Job Positions & Pricing'}
                </CardTitle>
                {!advancedMode && (
                  <Button variant="outline" size="sm" onClick={handleAddPosition}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Position
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className={advancedMode ? 'h-[800px] overflow-y-auto' : 'h-[600px]'}>
                {advancedMode ? (
                  <AdvancedAnalysisGrid />
                ) : (
                  <PositionsGrid />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Sidebar (30%) */}
        <div className="w-96">
          <PricingSidebar />
        </div>
      </div>

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
      <div className="p-8 max-w-[1800px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-50 mb-2">
            {currentProposal.name}
          </h1>
          <p className="text-slate-400">
            {currentProposal.solicitation_number || 'No solicitation number'}
          </p>
        </div>

        {currentProposal.status === 'processing' && renderProcessingView()}
        {currentProposal.status === 'error' && renderErrorView()}
        {currentProposal.status === 'completed' && renderPricingWorkspace()}
      </div>
    </DashboardLayout>
  );
}
