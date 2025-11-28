'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { ODCItem } from '@/types';
import PrimeLaborSection from './sections/PrimeLaborSection';
import PrimeLaborAggregatesSection from './sections/PrimeLaborAggregatesSection';
import { SubcontractorSection } from './SubcontractorSection';
import PassthroughSection from './sections/PassthroughSection';
import FeeSection from './sections/FeeSection';
import ODCSection from './sections/ODCSection';
import ODCFormModal from './ODCFormModal';
import RatesReferencePanel from './RatesReferencePanel';
import PricingTabs from './PricingTabs';
import RateTableView from './RateTableView';
import GrandTotalSection from './sections/GrandTotalSection';

export const AdvancedAnalysisGrid = () => {
  const {
    positionsAdvanced,
    subcontractors,
    odcs,
    rates,
    escalationRates,
    totalYears,
    expandedPositions,
    manualOverrides,
    aggregates,
    ratesReferenceExpanded,
    activeTab,
    togglePositionExpansion,
    addManualOverride,
    updateAdvancedPosition,
    deletePosition,
    addODC,
    updateODC,
    deleteODC,
    toggleRatesReference,
    setActiveTab,
    updateRates,
    updateEscalationRates,
  } = usePricingStore();

  // ODC modal state
  const [isODCModalOpen, setIsODCModalOpen] = useState(false);
  const [editingODC, setEditingODC] = useState<ODCItem | null>(null);

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

  // Handle ODC modal operations
  const handleAddODC = useCallback(() => {
    setEditingODC(null);
    setIsODCModalOpen(true);
  }, []);

  const handleEditODC = useCallback((odc: ODCItem) => {
    setEditingODC(odc);
    setIsODCModalOpen(true);
  }, []);

  const handleSaveODC = useCallback(
    (odcData: Omit<ODCItem, 'id'>) => {
      if (editingODC) {
        // Update existing ODC
        updateODC(editingODC.id, odcData);
      } else {
        // Add new ODC
        addODC(odcData);
      }
      setIsODCModalOpen(false);
      setEditingODC(null);
    },
    [editingODC, addODC, updateODC]
  );

  const handleCloseODCModal = useCallback(() => {
    setIsODCModalOpen(false);
    setEditingODC(null);
  }, []);

  // Calculate prime labor costs by year
  const primeLaborByYear = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(aggregates.byYear).forEach(([year, yearData]) => {
      result[year] = yearData.totalAmount;
    });
    return result;
  }, [aggregates]);

  // Calculate subcontractor costs by year
  const subcontractorCostsByYear = useMemo(() => {
    const result: Record<string, number> = {};
    subcontractors.forEach((sub) => {
      sub.positions.forEach((pos) => {
        Object.entries(pos.hours_per_year).forEach(([year, hours]) => {
          if (!result[year]) result[year] = 0;
          result[year] += hours * pos.rate;
        });
      });
    });
    return result;
  }, [subcontractors]);

  // Calculate passthrough costs by year
  const passthroughByYear = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(subcontractorCostsByYear).forEach(([year, cost]) => {
      result[year] = cost * ((rates.smh || 0) + (rates.ga_passthrough || 0));
    });
    return result;
  }, [subcontractorCostsByYear, rates]);

  // Calculate fee costs by year
  const feeByYear = useMemo(() => {
    const result: Record<string, number> = {};
    const allYears = new Set([
      ...Object.keys(primeLaborByYear),
      ...Object.keys(subcontractorCostsByYear),
    ]);

    allYears.forEach((year) => {
      const primeFee = (primeLaborByYear[year] || 0) * rates.fee;
      const subFee = (subcontractorCostsByYear[year] || 0) * (rates.sub_fee || 0);
      result[year] = primeFee + subFee;
    });

    return result;
  }, [primeLaborByYear, subcontractorCostsByYear, rates]);

  // Calculate grand total (includes prime labor, subcontractors, passthrough, and fee)
  const grandTotal = useMemo(() => {
    const byYear: { [year: string]: number } = {};
    let total = 0;

    // Get all years
    const allYears = new Set([
      ...Object.keys(primeLaborByYear),
      ...Object.keys(subcontractorCostsByYear),
      ...Object.keys(passthroughByYear),
      ...Object.keys(feeByYear),
    ]);

    allYears.forEach((year) => {
      const primeLabor = primeLaborByYear[year] || 0;
      const subLabor = subcontractorCostsByYear[year] || 0;
      const passthrough = passthroughByYear[year] || 0;
      const fee = feeByYear[year] || 0;

      byYear[year] = primeLabor + subLabor + passthrough + fee;
      total += byYear[year];
    });

    return { byYear, total };
  }, [primeLaborByYear, subcontractorCostsByYear, passthroughByYear, feeByYear]);

  return (
    <div className="space-y-2">
      {/* Header with mode indicator */}
      {/* Header with mode indicator */}
      <div className="flex justify-end items-center mb-2 px-6">
        <div className="text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 flex items-center">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2 animate-pulse" />
          Advanced Mode Active
        </div>
      </div>

      {/* Tab Navigation */}
      <PricingTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasSubcontractors={subcontractors.length > 0}
      />

      {/* Main View or Rate Table View */}
      {activeTab === 'main' ? (
        <>
          {/* Rates Reference Panel */}
      <RatesReferencePanel
        rates={rates}
        escalationRates={escalationRates}
        totalYears={totalYears}
        isExpanded={ratesReferenceExpanded}
        onToggle={toggleRatesReference}
        onUpdateRates={updateRates}
        onUpdateEscalationRates={updateEscalationRates}
      />

      {/* Prime Labor Section */}
      <PrimeLaborSection
        positions={positionsAdvanced}
        rates={rates}
        escalationRates={escalationRates}
        totalYears={totalYears}
        expandedPositions={expandedPositions}
        manualOverrides={manualOverrides}
        onToggleExpand={togglePositionExpansion}
        onCellChange={handleCellChange}
        onDeletePosition={handleDeletePosition}
        onUpdatePosition={updateAdvancedPosition}
      />

      {/* Prime Labor Aggregates */}
      <PrimeLaborAggregatesSection
        aggregates={aggregates}
        totalYears={totalYears}
      />

      {/* Subcontractor Section */}
      <SubcontractorSection />

      {/* Passthrough Section */}
      <PassthroughSection
        subcontractorCostsByYear={subcontractorCostsByYear}
        passthroughRates={{
          smh: rates.smh || 0,
          ga_passthrough: rates.ga_passthrough || 0,
        }}
        totalYears={totalYears}
      />

      {/* Fee Section */}
      <FeeSection
        primeLaborByYear={primeLaborByYear}
        subLaborByYear={subcontractorCostsByYear}
        feeRates={{
          prime_labor: rates.fee,
          sub_labor: rates.sub_fee || 0,
        }}
        totalYears={totalYears}
      />

      {/* ODC Section */}
      <ODCSection
        odcs={odcs}
        totalYears={totalYears}
        onAdd={handleAddODC}
        onEdit={handleEditODC}
        onDelete={deleteODC}
      />

          {/* Grand Total */}
          <GrandTotalSection
            grandTotal={grandTotal}
            primeLaborByYear={primeLaborByYear}
            subLaborByYear={subcontractorCostsByYear}
            passthroughByYear={passthroughByYear}
            feeByYear={feeByYear}
            totalYears={totalYears}
          />
        </>
      ) : (
        /* Rate Table View */
        <RateTableView
          subcontractors={subcontractors}
          feeRate={rates.sub_fee || 0}
          smhRate={rates.smh || 0}
        />
      )}

      {/* ODC Form Modal */}
      <ODCFormModal
        isOpen={isODCModalOpen}
        onClose={handleCloseODCModal}
        onSave={handleSaveODC}
        totalYears={totalYears}
        existingODC={editingODC}
      />
    </div>
  );
};

export default AdvancedAnalysisGrid;
