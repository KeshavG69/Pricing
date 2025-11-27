'use client';

import { useCallback, useMemo } from 'react';
import { usePricingStore } from '@/lib/stores/pricingStore';
import PrimeLaborSection from './sections/PrimeLaborSection';
import PrimeLaborAggregatesSection from './sections/PrimeLaborAggregatesSection';
import GrandTotalSection from './sections/GrandTotalSection';

export const AdvancedAnalysisGrid = () => {
  const {
    positionsAdvanced,
    rates,
    totalYears,
    expandedPositions,
    manualOverrides,
    aggregates,
    togglePositionExpansion,
    addManualOverride,
    updateAdvancedPosition,
    deletePosition,
  } = usePricingStore();

  // Handle cell changes (for manual overrides)
  const handleCellChange = useCallback(
    (positionId: string, year: string, field: string, value: number) => {
      // Mark as manual override
      addManualOverride(positionId, `${year}.${field}`);

      // TODO: Update the specific field in the position's breakdown
      // For now, we'll implement this when we add editable cells
      console.log('Cell changed:', { positionId, year, field, value });
    },
    [addManualOverride]
  );

  // Handle position deletion
  const handleDeletePosition = useCallback(
    (positionId: string) => {
      deletePosition(positionId);
    },
    [deletePosition]
  );

  // Calculate grand total
  const grandTotal = useMemo(() => {
    const byYear: { [year: string]: number } = {};
    let total = 0;

    // For now, grand total = prime labor total (will add subs, ODCs, etc. later)
    Object.entries(aggregates.byYear).forEach(([year, yearData]) => {
      byYear[year] = yearData.totalAmount;
      total += yearData.totalAmount;
    });

    return { byYear, total };
  }, [aggregates]);

  return (
    <div className="space-y-6">
      {/* Header with mode indicator */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-slate-50">
          Cost Proposal Spreadsheet
        </h2>
        <div className="text-sm text-emerald-400 font-semibold flex items-center">
          <div className="w-2 h-2 bg-emerald-400 rounded-full mr-2 animate-pulse" />
          Advanced Mode Active
        </div>
      </div>

      {/* Prime Labor Section */}
      <PrimeLaborSection
        positions={positionsAdvanced}
        rates={rates}
        totalYears={totalYears}
        expandedPositions={expandedPositions}
        manualOverrides={manualOverrides}
        onToggleExpand={togglePositionExpansion}
        onCellChange={handleCellChange}
        onDeletePosition={handleDeletePosition}
      />

      {/* Prime Labor Aggregates */}
      <PrimeLaborAggregatesSection
        aggregates={aggregates}
        totalYears={totalYears}
      />

      {/* TODO: Add more sections as they are implemented */}
      {/* SubcontractorSection (conditional) */}
      {/* PassThroughSection (conditional) */}
      {/* FeeSection */}
      {/* ODCSection (conditional) */}

      {/* Grand Total */}
      <GrandTotalSection
        grandTotal={grandTotal}
        totalYears={totalYears}
      />
    </div>
  );
};

export default AdvancedAnalysisGrid;
