'use client';

import React, { useMemo, useCallback, useState } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';
import { AdvancedPosition, IndirectRates, EscalationRates, Extension, GridRow, BreakdownType, ContextMenuItem } from '@/types';
import { ChevronDown, ChevronRight, Trash2, MoreVertical, Plus, ArrowRightLeft } from 'lucide-react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { SalaryContextMenu } from '@/components/pricing/SalaryContextMenu';
import { SOCContextMenu } from '@/components/pricing/SOCContextMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ConvertToSubcontractorModal } from '@/components/pricing/ConvertToSubcontractorModal';
import { TransferSubcontractorModal } from '@/components/pricing/TransferSubcontractorModal';
import { SalarySelectionModal } from '@/components/pricing/SalarySelectionModal';
import { SOCSelectionModal } from '@/components/pricing/SOCSelectionModal';
import AddPositionModal from '@/components/pricing/AddPositionModal';
import { getAvailablePercentiles } from '@/lib/utils/percentileHelpers';
import { getEffectiveSalary, getSalaryDisplayLabel, getSalarySelectionCount, isMultiSelectMode, isGSAPosition, getGSARateForYear, reverseEngineerGSARate } from '@/lib/utils/salaryHelpers';
import Button from '@/components/ui/Button';
import { usePricingStore, isKeyPosition } from '@/lib/stores/pricingStore';
import apiClient from '@/lib/api/client';

// Calculate averaged FBLR for an advanced position using proportional hourly rates
const calculateAveragedFBLR = (
  position: AdvancedPosition,
  rates: IndirectRates,
  escalationRates: EscalationRates,
  totalYears: number
) => {
  const isGSA = isGSAPosition(position);

  // GSA positions: Reverse engineer averaged GSA rate for DISPLAY purposes
  if (isGSA) {
    let totalAmount = 0;
    let totalHours = 0;

    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      const breakdown = position.breakdown[yearStr];
      const hoursThisYear = breakdown?.hours || 0;
      const gsaRate = getGSARateForYear(position, year);

      if (hoursThisYear > 0 && gsaRate > 0) {
        totalAmount += gsaRate * hoursThisYear;
        totalHours += hoursThisYear;
      }
    }

    if (totalHours === 0) {
      return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0, isGSA: true };
    }

    const avgGsaRate = totalAmount / totalHours;

    // Reverse engineer the GSA rate to show breakdown (for display consistency)
    const gsaBreakdown = reverseEngineerGSARate(avgGsaRate, rates);

    return {
      dlRate: gsaBreakdown.dlRate,
      fringe: gsaBreakdown.fringe,
      oh: gsaBreakdown.oh,
      ga: gsaBreakdown.ga,
      fee: gsaBreakdown.fee,
      fblr: gsaBreakdown.fblr,
      isGSA: true
    };
  }

  // BLS positions: Calculate with indirect rates
  const baseWage = getEffectiveSalary(position);

  if (baseWage === 0 || totalYears === 0) {
    return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0, isGSA: false };
  }

  let totalSalary = 0;
  let totalHours = 0;
  let currentYearWage = baseWage;

  // Get FTE hours (always provided by jd_parser)
  const fteHours = position.standard_fte_hours!;

  for (let year = 1; year <= totalYears; year++) {
    const yearStr = year.toString();
    const breakdown = position.breakdown[yearStr];
    const hoursThisYear = breakdown?.hours || 0;

    // Calculate proportional salary for this year
    if (hoursThisYear > 0) {
      const hourlyRateThisYear = currentYearWage / fteHours;
      const salaryEarnedThisYear = hourlyRateThisYear * hoursThisYear;

      totalSalary += salaryEarnedThisYear;
      totalHours += hoursThisYear;
    }

    // Apply escalation for next year
    if (year < totalYears) {
      const escalationKey = `${year}_to_${year + 1}`;
      const escalationRate = escalationRates[escalationKey] || 0;
      currentYearWage = currentYearWage * (1 + escalationRate);
    }
  }

  if (totalHours === 0) {
    return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0, isGSA: false };
  }

  // Calculate averaged DL rate
  const dlRate = totalSalary / totalHours;

  // Apply FBLR cascade
  const fringe = dlRate * rates.fringe;
  // Determine which OH rate to use based on location_type
  // Fallback: oh_onsite/oh_offsite → oh → 0.0711
  const ohOnsite = rates.oh_onsite !== undefined ? rates.oh_onsite : (rates.oh !== undefined ? rates.oh : 0.0711);
  const ohOffsite = rates.oh_offsite !== undefined ? rates.oh_offsite : (rates.oh !== undefined ? rates.oh : 0.0711);
  const ohRate = position.location_type === 'On-Site' ? ohOnsite : ohOffsite;
  const oh = (dlRate + fringe) * ohRate;
  const ga = (dlRate + fringe + oh) * rates.ga;
  // Fee is calculated separately in Fee Section (not included in FBLR)
  // This matches government cost proposal format (Intprepix)
  const fee = (dlRate + fringe + oh + ga) * rates.fee;
  const fblr = dlRate + fringe + oh + ga;

  return { dlRate, fringe, oh, ga, fee, fblr, isGSA: false };
};

interface PrimeLaborSectionProps {
  positions: AdvancedPosition[];
  rates: IndirectRates;
  escalationRates: EscalationRates;
  totalYears: number;
  extensions: Extension[];  // Extension periods beyond regular years
  expandedPositions: Set<string>;
  manualOverrides: Map<string, Set<string>>;
  onToggleExpand: (positionId: string) => void;
  onCellChange: (positionId: string, year: string, field: string, value: number) => void;
  onDeletePosition: (positionId: string) => void;
  onUpdatePosition: (id: string, updates: Partial<AdvancedPosition>) => void;
  isAdvancedMode?: boolean; // Controls whether Convert to Subcontractor is available
}

export const PrimeLaborSection = ({
  positions,
  rates,
  escalationRates,
  totalYears,
  extensions,
  expandedPositions,
  manualOverrides,
  onToggleExpand,
  onCellChange: _onCellChange, // TODO: Implement editable cells
  onDeletePosition,
  onUpdatePosition,
  isAdvancedMode = true, // Default to true for backwards compatibility
}: PrimeLaborSectionProps) => {
  // Get wage source and subcontractors from store
  const wageSource = usePricingStore((state) => state.wageSource);
  const subcontractors = usePricingStore((state) => state.subcontractors);
  const updatePosition = usePricingStore((state) => state.updatePosition);
  const advancedModeVersion = usePricingStore((state) => state.advancedModeVersion);
  const isGSAProposal = wageSource?.type === 'gsa';

  // Helper to calculate escalated rate for subcontractors
  const getEscalatedRate = (baseRate: number, year: number): number => {
    let rate = baseRate;
    // Apply compound escalation for each year
    for (let y = 1; y < year; y++) {
      const escalationKey = `${y}_to_${y + 1}`;
      const escalation = escalationRates?.[escalationKey] || 0;
      rate = rate * (1 + escalation);
    }
    return rate;
  };

  // Helper to calculate marked-up subcontractor rate for DISPLAY ONLY
  // Formula: displayed_rate = escalated_base_rate × (1 + sub_fee) × (1 + smh)
  // This does NOT change any calculations - purely for display
  const getSubcontractorDisplayRate = (baseRate: number, year: number): number => {
    // First apply escalation to base rate
    const escalatedRate = getEscalatedRate(baseRate, year);
    // Then apply markup (sub_fee + smh)
    const subFee = rates?.sub_fee || 0;
    const smh = rates?.smh || 0;
    return escalatedRate * (1 + subFee) * (1 + smh);
  };

  // Create a version string that changes when rates change to force re-render
  const ratesVersion = useMemo(() => {
    return `${rates.fringe}-${rates.oh_onsite}-${rates.oh_offsite}-${rates.ga}-${rates.fee}-${Object.values(escalationRates).join('-')}`;
  }, [rates, escalationRates]);

  // Debug: Log when component re-renders
  console.log('[PrimeLaborSection] ========== RENDER START ==========');
  console.log('[PrimeLaborSection] Positions count:', positions.length);
  console.log('[PrimeLaborSection] Rates received:', {
    fringe: rates.fringe,
    oh_onsite: rates.oh_onsite,
    oh_offsite: rates.oh_offsite,
    ga: rates.ga,
    fee: rates.fee
  });
  console.log('[PrimeLaborSection] Escalation rates:', escalationRates);
  console.log('[PrimeLaborSection] Rates version (key):', ratesVersion);
  console.log('[PrimeLaborSection] Sample position breakdown (first position):', positions[0]?.breakdown);
  console.log('[PrimeLaborSection] ========== RENDER END ==========');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; position: AdvancedPosition; columnKey?: string } | null>(null);

  // Conversion modal state
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [positionToConvert, setPositionToConvert] = useState<AdvancedPosition | null>(null);

  // Transfer modal state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [positionToTransfer, setPositionToTransfer] = useState<AdvancedPosition | null>(null);

  // Salary selection modal state
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [positionToEdit, setPositionToEdit] = useState<AdvancedPosition | null>(null);

  // SOC selection modal state
  const [socModalOpen, setSOCModalOpen] = useState(false);
  const [positionToEditSOC, setPositionToEditSOC] = useState<AdvancedPosition | null>(null);

  // Add position modal state
  const [addPositionModalOpen, setAddPositionModalOpen] = useState(false);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [positionToDelete, setPositionToDelete] = useState<AdvancedPosition | null>(null);

  // Handle right-click on grid rows (BEFORE useMemo to maintain hook order)
  const handleContextMenu = useCallback((e: React.MouseEvent, position: AdvancedPosition) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      position,
    });
  }, []);

  // Get proposalId for SOC changes
  const proposalId = usePricingStore((state) => state.proposalId);

  // Handle SOC code change from context menu
  const handleSOCChange = useCallback(async (position: AdvancedPosition, socCode: string, socTitle: string): Promise<void> => {
    if (!proposalId) return;

    // Call wage refresh endpoint
    const response = await apiClient.post(
      `/proposals/${proposalId}/positions/${position.id}/refresh-wage`,
      {
        soc_code: socCode,
        soc_title: socTitle,
        location: position.location,
        experience: position.experience,
      }
    );

    // Update position with new SOC + wage data
    onUpdatePosition(position.id, {
      soc_code: socCode,
      soc_title: socTitle,
      ...response.data.wage_data,
    });
  }, [proposalId, onUpdatePosition]);

  // Context menu items
  const getContextMenuItems = useCallback((position: AdvancedPosition, columnKey?: string): ContextMenuItem[] => {
    // Salary/percentile column context menu
    if (columnKey === 'percentile') {
      const availablePercentiles = getAvailablePercentiles(position);
      const items: ContextMenuItem[] = [];

      // Add percentile options
      availablePercentiles.forEach((p) => {
        items.push({
          label: `${p.value} - $${p.wage.toLocaleString()}`,
          onClick: () => {
            onUpdatePosition(position.id, {
              percentile: p.value,
              custom_salary: undefined,
            });
            setContextMenu(null);
          },
        });
      });

      // Add separator and custom option
      items.push({
        label: 'Custom Amount...',
        onClick: () => {
          setPositionToEdit(position);
          setSalaryModalOpen(true);
          setContextMenu(null);
        },
      });

      return items;
    }

    // Default context menu for other columns
    const items: ContextMenuItem[] = [];

    // Only show "Convert to Subcontractor" in advanced mode
    if (isAdvancedMode) {
      items.push({
        label: 'Convert to Subcontractor',
        icon: <MoreVertical className="w-4 h-4" />,
        onClick: () => {
          setPositionToConvert(position);
          setConversionModalOpen(true);
        },
      });

      // Show "Transfer Subcontractor Hours" if position has linked subcontractors
      // Check if any subcontractor positions are linked to this prime position
      const hasLinkedSubs = subcontractors.some(sub =>
        sub.positions.some(pos => pos.original_position_id === position.id)
      );
      if (hasLinkedSubs) {
        items.push({
          label: 'Transfer Subcontractor Hours',
          icon: <ArrowRightLeft className="w-4 h-4" />,
          onClick: () => {
            setPositionToTransfer(position);
            setTransferModalOpen(true);
            setContextMenu(null);
          },
        });
      }
    }

    // Always show "Delete Position"
    items.push({
      label: 'Delete Position',
      icon: <Trash2 className="w-4 h-4" />,
      onClick: () => {
        setPositionToDelete(position);
        setDeleteDialogOpen(true);
        setContextMenu(null);
      },
      danger: true,
    });

    return items;
  }, [onDeletePosition, onUpdatePosition, isAdvancedMode, subcontractors]);

  // Calculate column totals for subtotal row
  const columnTotals = useMemo(() => {
    const totals: any = {
      totalHours: 0,
      totalAmount: 0,
      avgDL: 0,
      avgFringe: 0,
      avgOH: 0,
      avgGA: 0,
      avgFee: 0,
      avgFBLR: 0,
      byYear: {} as Record<string, { hours: number; amount: number; rate: number }>,
    };

    positions.forEach((pos) => {
      // Sum total hours and total amount
      totals.totalHours += pos.total_hours;
      totals.totalAmount += pos.total_amount;

      // Sum averaged FBLR components
      const calc = calculateAveragedFBLR(pos, rates, escalationRates, totalYears);
      totals.avgDL += calc.dlRate;
      totals.avgFringe += calc.fringe;
      totals.avgOH += calc.oh;
      totals.avgGA += calc.ga;
      totals.avgFee += calc.fee;
      totals.avgFBLR += calc.fblr;

      // Sum per-year hours, amounts, and rates
      for (let year = 1; year <= totalYears; year++) {
        const yearStr = year.toString();
        const breakdown = pos.breakdown[yearStr];
        if (!totals.byYear[yearStr]) {
          totals.byYear[yearStr] = { hours: 0, amount: 0, rate: 0 };
        }
        if (breakdown) {
          totals.byYear[yearStr].hours += breakdown.hours;
          totals.byYear[yearStr].amount += breakdown.totalAmount;
          totals.byYear[yearStr].rate += breakdown.fblr;
        }
      }
    });

    return totals;
  }, [positions, rates, escalationRates, totalYears, advancedModeVersion]);

  // Build order-based position mapping for subcontractors without original_position_id
  // Groups positions by labor_category and tracks which ones have been matched
  const getLinkedSubcontractorPositions = useMemo(() => {
    // Collect all subcontractor positions across all subcontractors
    const allSubPositions: Array<{
      subName: string;
      subPos: typeof subcontractors[0]['positions'][0];
    }> = [];

    for (const sub of subcontractors) {
      for (const subPos of sub.positions) {
        allSubPositions.push({ subName: sub.name, subPos });
      }
    }

    // Build mapping: positionId -> linked subcontractor positions
    const linkedMap = new Map<string, Array<{ subName: string; subPos: typeof allSubPositions[0]['subPos'] }>>();

    // First pass: handle positions with original_position_id (direct 1-to-1 linking)
    const matchedSubIndices = new Set<number>();
    allSubPositions.forEach((item, idx) => {
      if (item.subPos.original_position_id) {
        const posId = item.subPos.original_position_id;
        if (!linkedMap.has(posId)) {
          linkedMap.set(posId, []);
        }
        linkedMap.get(posId)!.push(item);
        matchedSubIndices.add(idx);
      }
    });

    // Second pass: order-based fallback for positions without original_position_id
    // Group prime positions by labor_category with their order
    const primeByLaborCat = new Map<string, string[]>(); // labor_category -> [positionId, ...]
    positions.forEach((pos) => {
      const lc = pos.labor_category;
      if (!primeByLaborCat.has(lc)) {
        primeByLaborCat.set(lc, []);
      }
      primeByLaborCat.get(lc)!.push(pos.id);
    });

    // Track how many subs have been assigned to each labor_category
    const assignedCountByLaborCat = new Map<string, number>();

    allSubPositions.forEach((item, idx) => {
      if (matchedSubIndices.has(idx)) return; // Already matched by original_position_id

      const lc = item.subPos.labor_category;
      const primeIds = primeByLaborCat.get(lc);
      if (!primeIds || primeIds.length === 0) return;

      // Get current assignment count for this labor_category
      const currentCount = assignedCountByLaborCat.get(lc) || 0;

      // Assign to nth prime position with this labor_category (order-based)
      const targetPrimeIndex = currentCount % primeIds.length;
      const targetPrimeId = primeIds[targetPrimeIndex];

      if (!linkedMap.has(targetPrimeId)) {
        linkedMap.set(targetPrimeId, []);
      }
      linkedMap.get(targetPrimeId)!.push(item);
      assignedCountByLaborCat.set(lc, currentCount + 1);
    });

    return linkedMap;
  }, [positions, subcontractors]);

  // Transform positions to grid rows with breakdown rows + subcontractor rows
  const gridRows = useMemo<GridRow[]>(() => {
    const rows: GridRow[] = [];

    positions.forEach((pos) => {
      // Add position row
      rows.push({
        type: 'position',
        positionId: pos.id,
        data: pos,
        isExpanded: expandedPositions.has(pos.id),
      });

      // If expanded, add 5 breakdown rows
      if (expandedPositions.has(pos.id)) {
        rows.push(
          {
            type: 'breakdown',
            positionId: pos.id,
            breakdownType: 'dl',
            data: pos,
          },
          {
            type: 'breakdown',
            positionId: pos.id,
            breakdownType: 'fringe',
            data: pos,
          },
          {
            type: 'breakdown',
            positionId: pos.id,
            breakdownType: 'oh',
            data: pos,
          },
          {
            type: 'breakdown',
            positionId: pos.id,
            breakdownType: 'ga',
            data: pos,
          },
          {
            type: 'breakdown',
            positionId: pos.id,
            breakdownType: 'fee',
            data: pos,
          }
        );
      }

      // Add subcontractor rows linked to this position
      const linkedSubs = getLinkedSubcontractorPositions.get(pos.id) || [];
      for (const { subName, subPos } of linkedSubs) {
        const totalSubHours = Object.values(subPos.hours_per_year || {})
          .reduce((a, b) => a + (b || 0), 0);

        rows.push({
          type: 'subcontractor',
          positionId: pos.id,
          data: pos,
          subcontractorName: subName,
          subcontractorHours: subPos.hours_per_year,
          subcontractorTotalHours: totalSubHours,
          subcontractorRate: subPos.rate,
          subcontractorLocationType: subPos.location_type || 'On-Site',
        });
      }
    });

    // Add subtotal row at the end
    rows.push({
      type: 'subtotal',
      positionId: 'subtotal',
      data: columnTotals as any,
    });

    return rows;
  }, [positions, expandedPositions, rates, escalationRates, totalYears, columnTotals, getLinkedSubcontractorPositions, advancedModeVersion]);

  // Get cell styling for manual overrides
  const getCellClassName = (positionId: string, year: string, field: string) => {
    const overrideKey = `${year}.${field}`;
    const isManual = manualOverrides.get(positionId)?.has(overrideKey);
    return isManual
      ? 'bg-amber-500/10 border-l-2 border-amber-500'
      : 'bg-transparent';
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Get breakdown label
  const getBreakdownLabel = (type: BreakdownType) => {
    switch (type) {
      case 'dl':
        return 'DL Rate';
      case 'fringe':
        return 'Fringe';
      case 'oh':
        return 'Overhead';
      case 'ga':
        return 'G&A';
      case 'fee':
        return 'Fee';
    }
  };

  // Generate columns dynamically
  const columns = useMemo<Column<GridRow>[]>(() => {
    const cols: Column<GridRow>[] = [
      // Actions column - leftmost
      {
        key: 'actions',
        name: '',
        width: 50,
        resizable: false,
        frozen: true,
        renderCell: ({ row }) => {
          // Subtotal row - show styled empty cell
          if (row.type === 'subtotal') {
            return <div className="h-full bg-blue-50 border-t-2 border-blue-200" />;
          }
          // Subcontractor row - show purple styled empty cell
          if (row.type === 'subcontractor') {
            return <div className="h-full bg-purple-50/50" />;
          }
          // Only show actions for position rows, not breakdown rows
          if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            return (
              <div className="flex items-center justify-center h-full">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e as any, pos);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            );
          }
          return null;
        },
      },
      // Location Type - Toggle between On-Site and Off-Site
      {
        key: 'location_type',
        name: 'Location',
        width: 100,
        resizable: true,
        frozen: true,
        editable: false,
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            return <div className="h-full bg-blue-50 border-t-2 border-blue-200" />;
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;

            // Optimistic update component for instant feedback
            const LocationTypeButton = () => {
              const [optimisticLocationType, setOptimisticLocationType] = React.useState<string | null>(null);
              const [isUpdating, setIsUpdating] = React.useState(false);

              const currentLocationType = optimisticLocationType || pos.location_type || 'On-Site';
              const isOnSite = currentLocationType === 'On-Site';

              const handleToggle = async (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();

                // Toggle between On-Site and Off-Site
                const newLocationType = isOnSite ? 'Off-Site' : 'On-Site';

                // Optimistic update - change UI immediately
                setOptimisticLocationType(newLocationType);
                setIsUpdating(true);

                // Actual store update (async)
                try {
                  updatePosition(pos.id, { location_type: newLocationType });

                  // Clear optimistic state after a brief delay to ensure store update propagated
                  setTimeout(() => {
                    setOptimisticLocationType(null);
                    setIsUpdating(false);
                  }, 300);
                } catch (error) {
                  // Rollback on error
                  console.error('Failed to update location type:', error);
                  setOptimisticLocationType(pos.location_type || 'On-Site');
                  setIsUpdating(false);
                }
              };

              return (
                <button
                  type="button"
                  className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium transition-all duration-150 cursor-pointer transform hover:scale-105 active:scale-95 ${
                    isOnSite
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200'
                      : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-200'
                  } ${isUpdating ? 'opacity-75 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                  onClick={handleToggle}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  title="Click to toggle between On-Site and Off-Site"
                >
                  {currentLocationType}
                </button>
              );
            };

            return (
              <div className="flex items-center justify-center h-full px-2">
                <LocationTypeButton />
              </div>
            );
          } else if (row.type === 'subcontractor') {
            // Show location type for subcontractor row (non-editable, inherits from prime)
            const locationType = row.subcontractorLocationType || 'On-Site';
            const isOnSite = locationType === 'On-Site';

            return (
              <div className="flex items-center justify-center h-full px-2 bg-purple-50/50">
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  isOnSite
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                }`}>
                  {locationType}
                </span>
              </div>
            );
          }
          return <div className="h-full bg-muted/30" />;
        },
      },
      // Labour Category - Expandable indicator + labor category
      {
        key: 'cost_element',
        name: 'Labour Category',
        width: 280, // Increased for larger text (+12%)
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            // Subtotal row
            return (
              <div className="flex items-center h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="font-bold text-blue-700 text-sm">
                  Prime Labor Subtotals
                </span>
              </div>
            );
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const isExpanded = row.isExpanded;
            const isKey = isKeyPosition(pos);
            return (
              <div
                className="flex items-center h-full w-full px-2 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => onToggleExpand(row.positionId)}
                onContextMenu={(e) => {
                  handleContextMenu(e, pos);
                }}
              >
                <div className="mr-2 text-muted-foreground flex-shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
                <span className="font-semibold text-foreground flex-shrink-0">
                  {pos.labor_category}
                </span>
                {isKey && (
                  <span
                    className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 flex-shrink-0"
                    title="Key Position - Protected from auto-allocation to subcontractors"
                  >
                    KEY
                  </span>
                )}
                {/* Fill remaining space to make entire cell clickable */}
                <div className="flex-1" />
              </div>
            );
          } else if (row.type === 'subcontractor') {
            // Subcontractor row - show subcontractor name with indent
            return (
              <div className="flex items-center h-full px-2 pl-10 bg-purple-50/50">
                <span className="text-sm text-purple-700 font-medium">
                  ↳ {row.subcontractorName}
                </span>
              </div>
            );
          } else {
            // Breakdown row
            return (
              <div className="flex items-center h-full px-2 pl-10">
                <span className="text-sm text-muted-foreground">
                  {getBreakdownLabel(row.breakdownType!)}
                </span>
              </div>
            );
          }
        },
      },
      // Category Title - Show GSA title or BLS category (position rows only)
      {
        key: 'bls_category',
        name: isGSAProposal ? 'GSA Labour Category' : 'BLS Labour Category',
        width: 269, // Increased for larger text (+12%)
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            return <div className="h-full bg-blue-50 border-t-2 border-blue-200" />;
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const isExpanded = row.isExpanded;
            const isGSA = isGSAPosition(pos);

            return (
              <div
                className="flex items-center h-full w-full px-2 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => {
                  // Open SOC modal for editing
                  setPositionToEditSOC(pos);
                  setSOCModalOpen(true);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    position: pos,
                    columnKey: 'bls_category',
                  });
                }}
              >
                <div className="mr-2 text-muted-foreground flex-shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {isGSA ? (pos.gsa_title || '-') : (pos.soc_title || '-')}
                </span>
                <div className="flex-1" />
              </div>
            );
          } else if (row.type === 'subcontractor') {
            return <div className="h-full bg-purple-50/50" />;
          }
          return <div className="h-full bg-muted/30" />;
        },
      },
      // Category Code - Show GSA lcat_id or BLS code (position rows only)
      {
        key: 'bls_code',
        name: isGSAProposal ? 'GSA Category Code' : 'BLS Category Code',
        width: 157, // Increased for larger text (+12%)
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            return <div className="h-full bg-blue-50 border-t-2 border-blue-200" />;
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const isExpanded = row.isExpanded;
            const isGSA = isGSAPosition(pos);

            return (
              <div
                className="flex items-center h-full w-full px-2 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => {
                  // Open SOC modal for editing
                  setPositionToEditSOC(pos);
                  setSOCModalOpen(true);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    position: pos,
                    columnKey: 'bls_code',
                  });
                }}
              >
                <div className="mr-2 text-muted-foreground flex-shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${isGSA ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}`}>
                    {isGSA ? 'GSA' : 'BLS'}
                  </span>
                  <span className="text-muted-foreground text-xs font-mono">
                    {isGSA ? (pos.gsa_lcat_id || '-') : (pos.soc_code || '-')}
                  </span>
                </div>
                <div className="flex-1" />
              </div>
            );
          } else if (row.type === 'subcontractor') {
            return <div className="h-full bg-purple-50/50" />;
          }
          return <div className="h-full bg-muted/30" />;
        },
      },
      // Salary - Click to expand/collapse, right-click for context menu
      {
        key: 'percentile',
        name: 'Salary',
        width: 202, // Increased for larger text (+12%)
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            return <div className="h-full bg-blue-50 border-t-2 border-blue-200" />;
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const isExpanded = row.isExpanded;
            const wage = getEffectiveSalary(pos);
            const label = getSalaryDisplayLabel(pos);
            const isMulti = isMultiSelectMode(pos);
            return (
              <div
                className="flex items-center h-full w-full px-2 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => {
                  // Open salary modal for editing
                  setPositionToEdit(pos);
                  setSalaryModalOpen(true);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    position: pos,
                    columnKey: 'percentile',
                  });
                }}
              >
                <div className="mr-2 text-muted-foreground flex-shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
                <div className="flex items-center flex-shrink-0">
                  {isMulti ? (
                    // Multi-select - show label + averaged amount
                    <>
                      <span className="text-purple-600 dark:text-purple-400 font-semibold">{label}</span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded text-purple-600 bg-purple-600/10">
                        ${wage.toLocaleString()}
                      </span>
                    </>
                  ) : label === 'Custom' ? (
                    // Custom salary - only show amount with icon
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">
                      ${wage.toLocaleString()} ✎
                    </span>
                  ) : (
                    // BLS percentile - show percentile + wage
                    <>
                      <span className="font-semibold text-foreground">{label}</span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded text-primary bg-primary/10">
                        ${wage.toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex-1" />
              </div>
            );
          } else if (row.type === 'subcontractor') {
            return <div className="h-full bg-purple-50/50" />;
          }
          return <div className="h-full bg-muted/30" />;
        },
      },
    ];

    // Add GSA Discount column (only for GSA proposals)
    if (isGSAProposal) {
      cols.push({
        key: 'gsa_discount',
        name: 'GSA Discount',
        width: 220,
        resizable: true,
        editable: true,
        renderEditCell: (props: RenderEditCellProps<GridRow>) => {
          // Only allow editing for position rows
          if (props.row.type !== 'position') {
            props.onClose(false);
            return null;
          }

          const pos = props.row.data as AdvancedPosition;
          const isGSA = isGSAPosition(pos);

          if (!isGSA) {
            props.onClose(false);
            return null;
          }

          const currentDiscount = pos.gsa_discount_rate || 0;

          const EditInput = () => {
            const [inputValue, setInputValue] = React.useState((currentDiscount * 100).toFixed(1));

            const handleSave = () => {
              const newDiscountPercent = parseFloat(inputValue) || 0;
              const newDiscountRate = newDiscountPercent / 100;

              console.log('[PrimeLaborSection] Updating GSA discount:', {
                positionId: pos.id,
                newDiscountRate
              });

              onUpdatePosition(pos.id, { gsa_discount_rate: newDiscountRate });
              props.onClose(true);
            };

            return (
              <input
                type="text"
                inputMode="decimal"
                className="w-full h-full px-2 bg-transparent text-foreground outline-none text-right font-mono"
                value={inputValue}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setInputValue(value);
                  }
                }}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  } else if (e.key === 'Escape') {
                    props.onClose(false);
                  }
                }}
                autoFocus
                onFocus={(e) => e.target.select()}
              />
            );
          };

          return <EditInput />;
        },
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            return <div className="h-full bg-blue-50 border-t-2 border-blue-200" />;
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const isGSA = isGSAPosition(pos);

            if (!isGSA) {
              return <div className="flex items-center justify-center h-full px-2 text-muted-foreground text-xs">N/A</div>;
            }

            const suggestedDiscount = pos.suggested_discount_rate || 0;
            const appliedDiscount = pos.gsa_discount_rate || 0;
            const blsComparison = pos.bls_comparison_fblr;
            const rationale = pos.discount_rationale;

            // Get first year GSA rate for comparison display
            const gsaRate = getGSARateForYear(pos, 1);

            return (
              <div
                className="flex flex-col justify-center h-full px-2 space-y-0.5"
                title={rationale || 'BLS comparison data not available'}
              >
                {suggestedDiscount > 0 ? (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Suggested:</span>
                      <span className="text-amber-600 font-semibold">
                        {(suggestedDiscount * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Applied:</span>
                      <span className={appliedDiscount > 0 ? "text-emerald-600 font-semibold" : "text-muted-foreground"}>
                        {appliedDiscount > 0 ? `${(appliedDiscount * 100).toFixed(1)}%` : '0%'}
                      </span>
                    </div>
                    {blsComparison && (
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>GSA vs BLS:</span>
                        <span>${gsaRate.toFixed(2)} / ${blsComparison.toFixed(2)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground text-center">
                    No discount needed
                  </div>
                )}
              </div>
            );
          } else if (row.type === 'subcontractor') {
            return <div className="h-full bg-purple-50/50" />;
          }
          return <div className="h-full bg-muted/30" />;
        },
      });
    }

    // Add year-based columns (Rate, Hours, Amount triplets)
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();

      // Check if this year is an extension
      const extension = extensions.find(ext => ext.year === year);
      const label = extension
        ? extension.label
        : (year === 1 ? 'Base Period' : `Option Year ${year - 1}`);

      // Rate column
      cols.push({
        key: `year${year}_rate`,
        name: `${label}\nRate ($/hr)`,
        width: 130, // Increased for larger text (+8%)
        resizable: true,
        renderCell: ({ row }) => {
          // Subtotal row - show sum of rates for this year
          if (row.type === 'subtotal') {
            const totals = row.data as any;
            const rateTotal = totals.byYear[yearStr]?.rate || 0;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold">
                  {formatCurrency(rateTotal)}
                </span>
              </div>
            );
          }

          // Subcontractor row - show escalated marked-up rate (escalated base + sub_fee + S&MH)
          if (row.type === 'subcontractor') {
            const baseRate = row.subcontractorRate || 0;
            const markedUpRate = getSubcontractorDisplayRate(baseRate, year);
            return (
              <div className="flex items-center justify-end h-full px-2 bg-purple-50/50">
                <span className="text-purple-700 font-semibold">
                  {formatCurrency(markedUpRate)}
                </span>
              </div>
            );
          }

          const pos = row.data as AdvancedPosition;
          const breakdown = pos.breakdown[yearStr];
          if (!breakdown) return <div className="h-full" />;

          let value = 0;
          let field = '';

          if (row.type === 'position') {
            value = breakdown.fblr;
            field = 'fblr';
          } else if (row.type === 'breakdown') {
            switch (row.breakdownType) {
              case 'dl':
                value = breakdown.dlRate;
                field = 'dlRate';
                break;
              case 'fringe':
                value = breakdown.fringe;
                field = 'fringe';
                break;
              case 'oh':
                value = breakdown.oh;
                field = 'oh';
                break;
              case 'ga':
                value = breakdown.ga;
                field = 'ga';
                break;
              case 'fee':
                value = breakdown.fee;
                field = 'fee';
                break;
            }
          }

          const className = getCellClassName(row.positionId, yearStr, field);

          return (
            <div className={`flex items-center justify-end h-full px-2 ${className}`}>
              <span className={row.type === 'position' ? 'text-emerald-600 font-semibold' : 'text-purple-600'}>
                {formatCurrency(value)}
              </span>
            </div>
          );
        },
      });

      // Hours column
      cols.push({
        key: `year${year}_hours`,
        name: `${label}\nHours`,
        width: 108, // Increased for larger text (+8%)
        resizable: true,
        editable: true, // Always true - we control editability in renderEditCell
        renderEditCell: (props: RenderEditCellProps<GridRow>) => {
          // Only allow editing for position rows
          if (props.row.type !== 'position') {
            props.onClose(false); // Close immediately without saving
            return null;
          }

          const pos = props.row.data as AdvancedPosition;
          const breakdown = pos.breakdown[yearStr];
          const currentHours = breakdown?.hours || 0;

          // Create a local input component with state
          const EditInput = () => {
            const [inputValue, setInputValue] = React.useState(currentHours.toString());

            const handleSave = () => {
              // Parse and validate
              const newHours = parseFloat(inputValue) || 0;

              // Build complete hours_per_year from current breakdown
              const hoursPerYear: Record<string, number> = {};
              Object.keys(pos.breakdown).forEach(y => {
                hoursPerYear[y] = y === yearStr ? newHours : (pos.breakdown[y]?.hours || 0);
              });

              console.log('[PrimeLaborSection] Directly updating position hours:', {
                positionId: pos.id,
                year: yearStr,
                newHours,
                hoursPerYear
              });

              // Directly update position through onUpdatePosition (bypass row change handler)
              // Note: hours_per_year updates the underlying SpreadsheetPosition, not AdvancedPosition
              onUpdatePosition(pos.id, { hours_per_year: hoursPerYear } as any);

              // Close the editor
              props.onClose(true);
            };

            return (
              <input
                type="text"
                inputMode="decimal"
                className="w-full h-full px-2 bg-transparent text-foreground outline-none text-right font-mono"
                value={inputValue}
                onChange={(e) => {
                  // Only allow numbers, decimal point, and basic editing
                  const value = e.target.value;
                  if (value === '' || /^\d*\.?\d*$/.test(value)) {
                    setInputValue(value);
                  }
                }}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSave();
                  } else if (e.key === 'Escape') {
                    props.onClose(false); // Cancel without saving
                  }
                }}
                autoFocus
                onFocus={(e) => e.target.select()} // Select all text on focus
              />
            );
          };

          return <EditInput />;
        },
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            // Subtotal row - show sum of hours for this year
            const totals = row.data as any;
            const yearTotal = totals.byYear[yearStr]?.hours || 0;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold">
                  {yearTotal.toLocaleString()}
                </span>
              </div>
            );
          } else if (row.type === 'subcontractor') {
            // Subcontractor row - show hours for this year
            const hours = row.subcontractorHours?.[yearStr] || 0;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-purple-50/50">
                <span className="text-purple-700 font-medium">
                  {hours.toLocaleString()}
                </span>
              </div>
            );
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const breakdown = pos.breakdown[yearStr];
            if (!breakdown) return <div className="h-full" />;

            return (
              <div className="flex items-center justify-end h-full px-2">
                <span className="text-foreground">
                  {breakdown.hours.toLocaleString()}
                </span>
              </div>
            );
          }
          return <div className="h-full bg-muted/30" />;
        },
      });

      // Amount column
      cols.push({
        key: `year${year}_amount`,
        name: `${label}\nAmount ($)`,
        width: 140, // Increased for larger text (+8%)
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            // Subtotal row - show sum of amounts for this year
            const totals = row.data as any;
            const yearTotal = totals.byYear[yearStr]?.amount || 0;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold">
                  {formatCurrency(yearTotal)}
                </span>
              </div>
            );
          }

          // Subcontractor row - show escalated marked-up rate (escalated base + sub_fee + S&MH)
          if (row.type === 'subcontractor') {
            const baseRate = row.subcontractorRate || 0;
            const markedUpRate = getSubcontractorDisplayRate(baseRate, year);
            return (
              <div className="flex items-center justify-end h-full px-2 bg-purple-50/50">
                <span className="text-purple-700 font-semibold">
                  {formatCurrency(markedUpRate)}
                </span>
              </div>
            );
          }

          const pos = row.data as AdvancedPosition;
          const breakdown = pos.breakdown[yearStr];
          if (!breakdown) return <div className="h-full" />;

          let value = 0;
          let field = '';

          if (row.type === 'position') {
            value = breakdown.totalAmount;
            field = 'totalAmount';
          } else if (row.type === 'breakdown') {
            switch (row.breakdownType) {
              case 'dl':
                value = breakdown.dlAmount;
                field = 'dlAmount';
                break;
              case 'fringe':
                value = breakdown.fringeAmount;
                field = 'fringeAmount';
                break;
              case 'oh':
                value = breakdown.ohAmount;
                field = 'ohAmount';
                break;
              case 'ga':
                value = breakdown.gaAmount;
                field = 'gaAmount';
                break;
              case 'fee':
                value = breakdown.feeAmount;
                field = 'feeAmount';
                break;
            }
          }

          const className = getCellClassName(row.positionId, yearStr, field);

          return (
            <div className={`flex items-center justify-end h-full px-2 ${className}`}>
              <span className={row.type === 'position' ? 'text-emerald-600 font-semibold' : 'text-purple-600'}>
                {formatCurrency(value)}
              </span>
            </div>
          );
        },
      });
    }

    // Averaged FBLR columns
    cols.push(
      {
        key: 'avg_dl_rate',
        name: 'Avg\nDL Rate ($/hr)',
        width: 140, // Increased for larger text (+8%)
        frozen: false,
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            const totals = row.data as any;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold">
                  ${totals.avgDL.toFixed(2)}
                </span>
              </div>
            );
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const calc = calculateAveragedFBLR(pos, rates, escalationRates, totalYears);
            return (
              <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
                <span className="text-purple-600 font-semibold">
                  ${calc.dlRate.toFixed(2)}
                </span>
              </div>
            );
          }
          return <div />;
        },
      },
      {
        key: 'avg_fringe',
        name: 'Avg\nFringe ($/hr)',
        width: 130, // Increased for larger text (+8%)
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            const totals = row.data as any;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold">
                  ${totals.avgFringe.toFixed(2)}
                </span>
              </div>
            );
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const calc = calculateAveragedFBLR(pos, rates, escalationRates, totalYears);
            return (
              <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
                <span className="text-purple-600 font-semibold">
                  ${calc.fringe.toFixed(2)}
                </span>
              </div>
            );
          }
          return <div />;
        },
      },
      {
        key: 'avg_oh',
        name: 'Avg\nOH ($/hr)',
        width: 119, // Increased for larger text (+8%)
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            const totals = row.data as any;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold">
                  ${totals.avgOH.toFixed(2)}
                </span>
              </div>
            );
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const calc = calculateAveragedFBLR(pos, rates, escalationRates, totalYears);
            return (
              <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
                <span className="text-purple-600 font-semibold">
                  ${calc.oh.toFixed(2)}
                </span>
              </div>
            );
          }
          return <div />;
        },
      },
      {
        key: 'avg_ga',
        name: 'Avg\nG&A ($/hr)',
        width: 119, // Increased for larger text (+8%)
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            const totals = row.data as any;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold">
                  ${totals.avgGA.toFixed(2)}
                </span>
              </div>
            );
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const calc = calculateAveragedFBLR(pos, rates, escalationRates, totalYears);
            return (
              <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
                <span className="text-purple-600 font-semibold">
                  ${calc.ga.toFixed(2)}
                </span>
              </div>
            );
          }
          return <div />;
        },
      },
      {
        key: 'avg_fee',
        name: 'Avg\nFee ($/hr)',
        width: 119, // Increased for larger text (+8%)
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            const totals = row.data as any;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold">
                  ${totals.avgFee.toFixed(2)}
                </span>
              </div>
            );
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const calc = calculateAveragedFBLR(pos, rates, escalationRates, totalYears);
            return (
              <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
                <span className="text-purple-600 font-semibold">
                  ${calc.fee.toFixed(2)}
                </span>
              </div>
            );
          }
          return <div />;
        },
      },
      {
        key: 'avg_fblr',
        name: 'Avg\nFBLR ($/hr)',
        width: 140, // Increased for larger text (+8%)
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            const totals = row.data as any;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold">
                  ${totals.avgFBLR.toFixed(2)}
                </span>
              </div>
            );
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const calc = calculateAveragedFBLR(pos, rates, escalationRates, totalYears);
            return (
              <div className="flex items-center justify-end h-full px-2 bg-emerald-500/10">
                <span className="text-emerald-600 font-bold">
                  ${calc.fblr.toFixed(2)}
                </span>
              </div>
            );
          }
          return <div />;
        },
      }
    );

    // Add Total Hours and Total Amount at the rightest corner
    cols.push(
      {
        key: 'total_hours',
        name: 'Total Hours',
        width: 130, // Increased for larger text (+8%)
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            const totals = row.data as any;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold text-base">
                  {totals.totalHours.toLocaleString()}
                </span>
              </div>
            );
          } else if (row.type === 'subcontractor') {
            return (
              <div className="flex items-center justify-end h-full px-2 bg-purple-50/50">
                <span className="text-purple-700 font-medium">
                  {(row.subcontractorTotalHours || 0).toLocaleString()}
                </span>
              </div>
            );
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            return (
              <div className="flex items-center justify-end h-full px-2">
                <span className="text-foreground font-semibold">
                  {pos.total_hours.toLocaleString()}
                </span>
              </div>
            );
          }
          return <div className="h-full bg-muted/30" />;
        },
      },
      {
        key: 'total_amount',
        name: 'Total Amount',
        width: 162, // Increased for larger text (+8%)
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'subtotal') {
            const totals = row.data as any;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-blue-50 border-t-2 border-blue-200">
                <span className="text-blue-700 font-bold text-base">
                  {formatCurrency(totals.totalAmount)}
                </span>
              </div>
            );
          } else if (row.type === 'subcontractor') {
            return <div className="h-full bg-purple-50/50" />;
          } else if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            return (
              <div className="flex items-center justify-end h-full px-2 bg-emerald-500/10">
                <span className="text-emerald-600 font-bold">
                  {formatCurrency(pos.total_amount)}
                </span>
              </div>
            );
          }
          return <div className="h-full bg-muted/30" />;
        },
      }
    );

    return cols;
  }, [totalYears, expandedPositions, manualOverrides, onToggleExpand, onDeletePosition, handleContextMenu, rates, escalationRates, isGSAProposal]);

  // Get store methods (positions for the modal) - must be before any early returns
  const { addPosition, positions: basicPositions } = usePricingStore();

  // Handle add position - open modal
  const handleAddPosition = useCallback(() => {
    setAddPositionModalOpen(true);
  }, []);

  // Handle modal submit
  const handleModalAddPosition = useCallback((positionData: any) => {
    addPosition(positionData);
  }, [addPosition]);

  // Handle row changes (for inline editing)
  const handleRowsChange = useCallback((newRows: GridRow[]) => {
    // Find changed position rows and update through store
    newRows.forEach((newRow) => {
      if (newRow.type === 'position') {
        const oldRow = gridRows.find((r) => r.positionId === newRow.positionId && r.type === 'position');
        if (oldRow && JSON.stringify(oldRow.data) !== JSON.stringify(newRow.data)) {
          const updatedPos = newRow.data as any; // Use 'any' since we're adding hours_per_year dynamically

          // Extract the changed fields
          const changes: any = {};

          // Check if hours_per_year was updated (from hours column editing)
          if (updatedPos.hours_per_year) {
            changes.hours_per_year = updatedPos.hours_per_year;
          }

          if (Object.keys(changes).length > 0) {
            console.log('[PrimeLaborSection] Updating position with hours change', { id: newRow.positionId, changes });
            onUpdatePosition(newRow.positionId, changes);
          }
        }
      }
    });
  }, [gridRows, onUpdatePosition]);

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 bg-muted/30 rounded-lg border border-border">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">No positions yet</p>
          <p className="text-sm text-muted-foreground">Add positions to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6">
        <div className="flex items-center space-x-3">
          <h3 className="text-base font-semibold text-foreground">Prime Labor</h3>
          <p className="text-xs text-muted-foreground">
            {positions.length} position{positions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleAddPosition}>
          <Plus className="w-4 h-4 mr-2" />
          Add Position
        </Button>
      </div>

      <div
        className="border border-border rounded-lg transition-all duration-200"
        style={{ height: 'calc(100vh - 280px)', minHeight: 400 }}
      >
        <DataGrid
          key={`${rates.fringe}-${rates.oh_onsite}-${rates.oh_offsite}-${rates.ga}-${rates.fee}-${Object.values(escalationRates).join('-')}-v${advancedModeVersion}`}
          columns={columns}
          rows={gridRows}
          onRowsChange={handleRowsChange}
          rowKeyGetter={(row) => `${row.positionId}_${row.type}_${row.breakdownType || ''}`}
          className={styles.excelGrid}
          style={{ height: '100%' }}
          rowHeight={45}
        />
      </div>

      {/* Context Menu - Use SalaryContextMenu for salary/percentile column */}
      {contextMenu && contextMenu.columnKey === 'percentile' && (
        <SalaryContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onApply={(updates) => {
            onUpdatePosition(contextMenu.position.id, updates);
          }}
          onOpenModal={() => {
            setPositionToEdit(contextMenu.position);
            setSalaryModalOpen(true);
          }}
        />
      )}
      {/* SOC Context Menu for Category Code and Category Title columns */}
      {contextMenu && (contextMenu.columnKey === 'bls_code' || contextMenu.columnKey === 'bls_category') && (
        <SOCContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onApply={(socCode, socTitle) =>
            handleSOCChange(contextMenu.position, socCode, socTitle)
          }
          onOpenModal={() => {
            setPositionToEditSOC(contextMenu.position);
            setSOCModalOpen(true);
            setContextMenu(null);
          }}
        />
      )}
      {/* Regular Context Menu for other columns */}
      {contextMenu && contextMenu.columnKey !== 'percentile' && contextMenu.columnKey !== 'bls_code' && contextMenu.columnKey !== 'bls_category' && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.position, contextMenu.columnKey)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Conversion Modal */}
      <ConvertToSubcontractorModal
        open={conversionModalOpen}
        onClose={() => {
          setConversionModalOpen(false);
          setPositionToConvert(null);
        }}
        position={positionToConvert}
      />

      {/* Salary Selection Modal */}
      <SalarySelectionModal
        open={salaryModalOpen}
        onClose={() => {
          setSalaryModalOpen(false);
          setPositionToEdit(null);
        }}
        position={positionToEdit}
        onUpdate={(updates) => {
          if (positionToEdit) {
            onUpdatePosition(positionToEdit.id, updates);
          }
        }}
      />

      {/* SOC Selection Modal */}
      <SOCSelectionModal
        open={socModalOpen}
        onClose={() => {
          setSOCModalOpen(false);
          setPositionToEditSOC(null);
        }}
        position={positionToEditSOC}
        onUpdate={(updates) => {
          if (positionToEditSOC) {
            onUpdatePosition(positionToEditSOC.id, updates);
          }
        }}
      />

      {/* Add Position Modal */}
      <AddPositionModal
        open={addPositionModalOpen}
        onClose={() => setAddPositionModalOpen(false)}
        positions={basicPositions}
        totalYears={totalYears}
        onAdd={handleModalAddPosition}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setPositionToDelete(null);
        }}
        onConfirm={() => {
          if (positionToDelete) {
            onDeletePosition(positionToDelete.id);
          }
          setDeleteDialogOpen(false);
          setPositionToDelete(null);
        }}
        title="Delete Position"
        message={`Are you sure you want to delete position "${positionToDelete?.labor_category}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />

      {/* Transfer Subcontractor Hours Modal */}
      <TransferSubcontractorModal
        open={transferModalOpen}
        onClose={() => {
          setTransferModalOpen(false);
          setPositionToTransfer(null);
        }}
        lockSource={false}
        primePositionId={positionToTransfer?.id}
      />
    </div>
  );
};

export default PrimeLaborSection;
