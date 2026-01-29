'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { TravelItem, ODCItem } from '@/types';
import PrimeLaborSection from './sections/PrimeLaborSection';
import PrimeLaborAggregatesSection from './sections/PrimeLaborAggregatesSection';
import CombinedLaborTotalsSection from './sections/CombinedLaborTotalsSection';
import PassthroughSection from './sections/PassthroughSection';
import FeeSection from './sections/FeeSection';
import TravelSection from './sections/TravelSection';
import ODCSection from './sections/ODCSection';
import TravelFormModal from './TravelFormModal';
import ODCFormModal from './ODCFormModal';
import RatesReferencePanel from './RatesReferencePanel';
import GrandTotalSection from './sections/GrandTotalSection';

interface AdvancedAnalysisGridProps {
  isAdvancedMode?: boolean; // true = full advanced mode, false = initial view mode
}

export const AdvancedAnalysisGrid = ({ isAdvancedMode = true }: AdvancedAnalysisGridProps) => {
  const {
    positionsAdvanced,
    subcontractors,
    travel,
    odcs,
    surge,  // NEW: Surge option data
    extensions,
    rates,
    escalationRates,
    totalYears,
    expandedPositions,
    manualOverrides,
    aggregates,
    ratesReferenceExpanded,
    advancedModeVersion,
    togglePositionExpansion,
    addManualOverride,
    updateAdvancedPosition,
    deletePosition,
    addTravel,
    updateTravel,
    deleteTravel,
    addODC,
    updateODC,
    deleteODC,
    toggleRatesReference,
    updateRates,
    updateEscalationRates,
    recalculate,
  } = usePricingStore();

  // Debug: Log when component re-renders
  console.log('[AdvancedAnalysisGrid] Re-render with', positionsAdvanced.length, 'positions, aggregates:', {
    totalFringe: aggregates.totalFringe,
    totalOH: aggregates.totalOH,
    totalGA: aggregates.totalGA
  });

  // Check if proposal has any OT hours (to conditionally show OT columns)
  const hasOvertimeHours = useMemo(() => {
    // Check prime positions
    const primeHasOT = positionsAdvanced.some(pos => {
      if (!pos.ot_hours_per_year) return false;
      return Object.values(pos.ot_hours_per_year).some(hours => hours > 0);
    });

    // Check subcontractor positions
    const subHasOT = subcontractors.some(sub =>
      sub.positions.some(pos => {
        if (!pos.ot_hours_per_year) return false;
        return Object.values(pos.ot_hours_per_year).some(hours => hours > 0);
      })
    );

    return primeHasOT || subHasOT;
  }, [positionsAdvanced, subcontractors]);

  // Travel modal state
  const [isTravelModalOpen, setIsTravelModalOpen] = useState(false);
  const [editingTravel, setEditingTravel] = useState<TravelItem | null>(null);

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

  // Handle Travel modal operations
  const handleAddTravel = useCallback(() => {
    setEditingTravel(null);
    setIsTravelModalOpen(true);
  }, []);

  const handleEditTravel = useCallback((travel: TravelItem) => {
    setEditingTravel(travel);
    setIsTravelModalOpen(true);
  }, []);

  const handleSaveTravel = useCallback(
    (travelData: Omit<TravelItem, 'id'>) => {
      if (editingTravel) {
        // Update existing Travel
        updateTravel(editingTravel.id, travelData);
      } else {
        // Add new Travel
        addTravel(travelData);
      }
      setIsTravelModalOpen(false);
      setEditingTravel(null);
    },
    [editingTravel, addTravel, updateTravel]
  );

  const handleCloseTravelModal = useCallback(() => {
    setIsTravelModalOpen(false);
    setEditingTravel(null);
  }, []);

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

  // Calculate prime labor BASE costs by year (DL + Fringe + OH + G&A, WITHOUT fee)
  // This is used by FeeSection to calculate fee on the base
  const primeLaborByYear = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(aggregates.byYear).forEach(([year, yearData]) => {
      // Base = DL + Fringe + OH + G&A (fee is calculated separately)
      result[year] = yearData.dl + yearData.fringe + yearData.oh + yearData.ga;
    });
    return result;
  }, [aggregates]);

  // Calculate OT costs by year
  const otCostsByYear = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(aggregates.byYear).forEach(([year, yearData]) => {
      result[year] = yearData.ot || 0;
    });
    return result;
  }, [aggregates]);

  // Calculate subcontractor costs by year with compound escalation (including OT)
  const subcontractorCostsByYear = useMemo(() => {
    const result: Record<string, number> = {};
    const otMultiplier = rates.ot_multiplier || 1.5;

    subcontractors.forEach((sub) => {
      sub.positions.forEach((pos) => {
        Object.entries(pos.hours_per_year).forEach(([yearStr, hours]) => {
          if (!result[yearStr]) result[yearStr] = 0;

          const yearNum = parseInt(yearStr);
          // Apply compound escalation to base rate
          let escalatedRate = pos.rate;
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedRate *= (1 + escRate);
          }

          // Regular hours cost
          result[yearStr] += hours * escalatedRate;

          // OT hours cost
          const otHours = pos.ot_hours_per_year?.[yearStr] || 0;
          if (otHours > 0) {
            result[yearStr] += otHours * escalatedRate * otMultiplier;
          }
        });
      });
    });
    return result;
  }, [subcontractors, escalationRates, rates.ot_multiplier]);

  // Calculate prime hours by year from positionsAdvanced
  const primeHoursByYear = useMemo(() => {
    const result: Record<string, number> = {};
    positionsAdvanced.forEach((pos) => {
      Object.entries(pos.breakdown).forEach(([year, breakdown]) => {
        if (!result[year]) result[year] = 0;
        result[year] += breakdown.hours;
      });
    });
    return result;
  }, [positionsAdvanced]);

  // Calculate subcontractor hours by year (regular hours only, OT tracked separately)
  const subcontractorHoursByYear = useMemo(() => {
    const result: Record<string, number> = {};
    subcontractors.forEach((sub) => {
      sub.positions.forEach((pos) => {
        Object.entries(pos.hours_per_year).forEach(([year, hours]) => {
          if (!result[year]) result[year] = 0;
          result[year] += hours;
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

  // Calculate fee costs by year (per Excel: Fee applied to Prime Labor + Sub Labor separately)
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

  // Calculate subcontractor fee by year (for aggregate display)
  const subFeeByYear = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(subcontractorCostsByYear).forEach(([year, cost]) => {
      result[year] = cost * (rates.sub_fee || 0);
    });
    return result;
  }, [subcontractorCostsByYear, rates]);

    // Calculate Travel costs by year with G&A markup and escalation
  // Formula: Travel Total = (Travel Base with escalation) × (1 + G&A Rate)
  const travelCostsByYear = useMemo(() => {
    const result: Record<string, number> = {};
    const gaRate = rates.ga || 0;

    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      let travelBase = 0;

      travel.forEach((item) => {
        const baseAmount = item.amount_per_year[yearStr] || 0;
        let escalatedAmount = baseAmount;

        // Apply compound escalation if flag is set
        if (item.escalate) {
          for (let y = 1; y < year; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedAmount *= (1 + escRate);
          }
        }

        travelBase += escalatedAmount;
      });

      // Apply G&A markup to all Travel
      result[yearStr] = travelBase * (1 + gaRate);
    }

    return result;
  }, [travel, rates.ga, totalYears, escalationRates]);

  // Calculate ODC costs by year with S&MH markup and escalation
  // Formula: ODC Total = (ODC Base with escalation) × (1 + S&MH Rate)
  const odcCostsByYear = useMemo(() => {
    const result: Record<string, number> = {};
    const smhRate = rates.smh || 0;

    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      let odcBase = 0;

      odcs.forEach((odc) => {
        const baseAmount = odc.amount_per_year[yearStr] || 0;
        let escalatedAmount = baseAmount;

        // Apply compound escalation if flag is set
        if (odc.escalate) {
          for (let y = 1; y < year; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedAmount *= (1 + escRate);
          }
        }

        odcBase += escalatedAmount;
      });

      // Apply S&MH markup to all ODCs
      result[yearStr] = odcBase * (1 + smhRate);
    }

    return result;
  }, [odcs, rates.smh, totalYears, escalationRates]);

  // Calculate Surge costs by year (base labor cost × surge percentage × surge multiplier)
  // Formula: Surge Cost = Base Prime Labor Cost × Surge Percentage × Surge Multiplier
  const surgeCostsByYear = useMemo(() => {
    const result: Record<string, number> = {};

    // If no surge option or no percentage, return zero costs
    if (!surge || !surge.percentage) {
      for (let year = 1; year <= totalYears; year++) {
        result[year.toString()] = 0;
      }
      return result;
    }

    const surgePercentage = surge.percentage;
    const surgeMultiplier = rates.surge_multiplier || 1.15;  // Default 1.15x (15% premium)

    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      const baseLaborCost = primeLaborByYear[yearStr] || 0;

      // Surge = Base Labor × Percentage × Multiplier
      result[yearStr] = baseLaborCost * surgePercentage * surgeMultiplier;
    }

    return result;
  }, [surge, primeLaborByYear, rates.surge_multiplier, totalYears]);

  // Calculate grand total (includes prime labor, subcontractors, passthrough, fee, Travel, ODCs, and Surge)
  // Formula: Grand Total = Labor CPFF (prime + OT + sub + passthrough + fee) + Total Travel (with G&A) + Total ODCs (with S&MH) + Surge
  const grandTotal = useMemo(() => {
    const byYear: { [year: string]: number } = {};
    let total = 0;

    // Get all years
    const allYears = new Set([
      ...Object.keys(primeLaborByYear),
      ...Object.keys(otCostsByYear),
      ...Object.keys(subcontractorCostsByYear),
      ...Object.keys(passthroughByYear),
      ...Object.keys(feeByYear),
      ...Object.keys(travelCostsByYear),
      ...Object.keys(odcCostsByYear),
      ...Object.keys(surgeCostsByYear),  // NEW: Include surge costs
    ]);

    allYears.forEach((year) => {
      const primeLabor = primeLaborByYear[year] || 0;
      const otCost = otCostsByYear[year] || 0;
      const subLabor = subcontractorCostsByYear[year] || 0;
      const passthrough = passthroughByYear[year] || 0;
      const fee = feeByYear[year] || 0;
      const travelCost = travelCostsByYear[year] || 0;
      const odc = odcCostsByYear[year] || 0;
      const surgeCost = surgeCostsByYear[year] || 0;  // NEW: Add surge costs

      byYear[year] = primeLabor + otCost + subLabor + passthrough + fee + travelCost + odc + surgeCost;
      total += byYear[year];
    });

    return { byYear, total };
  }, [primeLaborByYear, otCostsByYear, subcontractorCostsByYear, passthroughByYear, feeByYear, travelCostsByYear, odcCostsByYear, surgeCostsByYear]);

  return (
    <div className="space-y-1">
      {/* Rates Reference Panel */}
      <RatesReferencePanel
        rates={rates}
        escalationRates={escalationRates}
        totalYears={totalYears}
        isExpanded={ratesReferenceExpanded}
        onToggle={toggleRatesReference}
        onUpdateRates={updateRates}
        onUpdateEscalationRates={updateEscalationRates}
        onRecalculate={recalculate}
        extensions={extensions}
      />

      {/* Prime Labor Section */}
      <PrimeLaborSection
        key={`${rates.fringe}-${rates.oh}-${rates.ga}-${rates.fee}-${Object.values(escalationRates).join('-')}-v${advancedModeVersion}`}
        positions={positionsAdvanced}
        rates={rates}
        escalationRates={escalationRates}
        totalYears={totalYears}
        extensions={extensions}
        expandedPositions={expandedPositions}
        manualOverrides={manualOverrides}
        onToggleExpand={togglePositionExpansion}
        onCellChange={handleCellChange}
        hasOvertimeHours={hasOvertimeHours}
        onDeletePosition={handleDeletePosition}
        onUpdatePosition={updateAdvancedPosition}
        isAdvancedMode={isAdvancedMode}
      />

      {/* Labor Subtotals (Prime + Subcontractor) */}
      <PrimeLaborAggregatesSection
        aggregates={aggregates}
        totalYears={totalYears}
        extensions={extensions}
        subLaborByYear={subcontractorCostsByYear}
        passthroughByYear={passthroughByYear}
        subFeeByYear={subFeeByYear}
      />

      {/* Combined Labor Totals */}
      <CombinedLaborTotalsSection
        primeHoursByYear={primeHoursByYear}
        subHoursByYear={subcontractorHoursByYear}
        primeLaborByYear={primeLaborByYear}
        otCostsByYear={otCostsByYear}
        subLaborByYear={subcontractorCostsByYear}
        passthroughByYear={passthroughByYear}
        feeByYear={feeByYear}
        totalYears={totalYears}
        extensions={extensions}
      />

      {/* Passthrough Section */}
      <PassthroughSection
        subcontractorCostsByYear={subcontractorCostsByYear}
        passthroughRates={{
          smh: rates.smh || 0,
          ga_passthrough: rates.ga_passthrough || 0,
        }}
        totalYears={totalYears}
        extensions={extensions}
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
        extensions={extensions}
      />

      {/* Travel Section - SEPARATE from ODCs, uses G&A Rate */}
      <TravelSection
        travel={travel}
        totalYears={totalYears}
        extensions={extensions}
        gaRate={rates.ga}
        escalationRates={escalationRates}
        onAdd={handleAddTravel}
        onEdit={handleEditTravel}
        onDelete={deleteTravel}
      />

      {/* ODC Section - Materials, Equipment, etc., uses SMH Rate */}
      <ODCSection
        odcs={odcs}
        totalYears={totalYears}
        extensions={extensions}
        smhRate={rates.smh || 0}
        escalationRates={escalationRates}
        onAdd={handleAddODC}
        onEdit={handleEditODC}
        onDelete={deleteODC}
      />

          {/* Grand Total */}
          <GrandTotalSection
            grandTotal={grandTotal}
            primeLaborByYear={primeLaborByYear}
            otCostsByYear={otCostsByYear}
            subLaborByYear={subcontractorCostsByYear}
            passthroughByYear={passthroughByYear}
            feeByYear={feeByYear}
            travelByYear={travelCostsByYear}
            odcByYear={odcCostsByYear}
            surgeByYear={surgeCostsByYear}  // NEW: Pass surge costs
            totalYears={totalYears}
            extensions={extensions}
          />

      {/* Travel Form Modal */}
      <TravelFormModal
        isOpen={isTravelModalOpen}
        onClose={handleCloseTravelModal}
        onSave={handleSaveTravel}
        totalYears={totalYears}
        escalationRates={escalationRates}
        existingTravel={editingTravel}
      />

      {/* ODC Form Modal */}
      <ODCFormModal
        isOpen={isODCModalOpen}
        onClose={handleCloseODCModal}
        onSave={handleSaveODC}
        totalYears={totalYears}
        escalationRates={escalationRates}
        existingODC={editingODC}
      />
    </div>
  );
};

export default AdvancedAnalysisGrid;
