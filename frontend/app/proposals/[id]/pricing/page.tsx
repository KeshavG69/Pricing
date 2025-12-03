'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usePricingStore } from '@/lib/stores/pricingStore';

import PositionsGrid from '@/components/pricing/PositionsGrid';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ArrowLeft, Plus } from 'lucide-react';

export default function PricingWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const proposalId = params.id as string;

  const { loadProposal, proposalName, positions, error, reset, addPosition } =
    usePricingStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await loadProposal(proposalId);
      setIsLoading(false);
    };

    load();

    // Cleanup on unmount
    return () => {
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  const handleAddPosition = () => {
    // Add a blank position
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

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-screen">
          {/* Spreadsheet area */}
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <Button variant="outline" onClick={() => router.back()}>
              Go Back
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex h-screen flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              onClick={() => router.push(`/proposals/${proposalId}`)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-slate-50">{proposalName}</h1>
              <p className="text-sm text-slate-400">Pricing Workspace</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={handleAddPosition}>
              <Plus className="w-4 h-4 mr-2" />
              Add Position
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Spreadsheet (Full Width) */}
          <div className="flex-1 p-6 overflow-auto">
            <div className="h-full">
              <PositionsGrid />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
