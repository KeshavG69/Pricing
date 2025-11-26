'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useProposalsStore } from '@/lib/stores/proposalsStore';
import { proposalsApi } from '@/lib/api/proposals';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';

export default function ProposalPage() {
  const params = useParams();
  const router = useRouter();
  const proposalId = params.id as string;

  const { currentProposal, fetchProposal, isLoading } = useProposalsStore();
  const [pollingStatus, setPollingStatus] = useState<any>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (proposalId) {
      fetchProposal(proposalId);
    }
  }, [proposalId, fetchProposal]);

  // Poll status if proposal is processing
  useEffect(() => {
    if (!currentProposal || currentProposal.status !== 'processing') {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    const pollInterval = setInterval(async () => {
      try {
        const status = await proposalsApi.getStatus(proposalId);
        setPollingStatus(status);

        // If completed or error, stop polling and refresh proposal
        if (status.status === 'completed' || status.status === 'error') {
          clearInterval(pollInterval);
          setIsPolling(false);
          await fetchProposal(proposalId);
        }
      } catch (error) {
        console.error('Polling error:', error);
        clearInterval(pollInterval);
        setIsPolling(false);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [currentProposal, proposalId, fetchProposal]);

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

  const renderCompletedView = () => (
    <div className="space-y-6">
      {/* Success message */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-50 mb-1">
                Processing Complete!
              </h3>
              <p className="text-sm text-slate-400">
                {currentProposal.metadata?.total_jobs || 0} job positions extracted and analyzed
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Proposal Details */}
      <Card>
        <CardHeader>
          <CardTitle>Proposal Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-400">Name</label>
              <p className="text-slate-50">{currentProposal.name}</p>
            </div>

            {currentProposal.solicitation_number && (
              <div>
                <label className="text-sm font-medium text-slate-400">Solicitation Number</label>
                <p className="text-slate-50">{currentProposal.solicitation_number}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 pt-4">
              <div>
                <label className="text-sm font-medium text-slate-400">Total Years</label>
                <p className="text-2xl font-semibold text-slate-50">
                  {currentProposal.metadata?.total_years || 0}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-400">Base Years</label>
                <p className="text-2xl font-semibold text-slate-50">
                  {currentProposal.metadata?.base_years || 0}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-400">Option Years</label>
                <p className="text-2xl font-semibold text-slate-50">
                  {currentProposal.metadata?.option_years || 0}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jobs preview */}
      {currentProposal.jobs && currentProposal.jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extracted Jobs ({currentProposal.jobs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {currentProposal.jobs.slice(0, 10).map((job: any, index: number) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-slate-900/30 border border-slate-800"
                >
                  <p className="text-sm font-medium text-slate-50">{job.labor_category}</p>
                  {job.soc_title && (
                    <p className="text-xs text-slate-400 mt-1">
                      SOC: {job.soc_code} - {job.soc_title}
                    </p>
                  )}
                </div>
              ))}
              {currentProposal.jobs.length > 10 && (
                <p className="text-sm text-slate-400 text-center pt-2">
                  + {currentProposal.jobs.length - 10} more positions
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next steps */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
        <Button variant="primary" onClick={() => router.push(`/proposals/${proposalId}/pricing`)}>
          Continue to Pricing →
        </Button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="p-8 max-w-5xl mx-auto">
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
        {currentProposal.status === 'completed' && renderCompletedView()}
      </div>
    </DashboardLayout>
  );
}
