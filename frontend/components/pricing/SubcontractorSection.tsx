'use client';

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TransferSubcontractorModal } from './TransferSubcontractorModal';
import { AddSubcontractorModal } from './AddSubcontractorModal';
import { Trash2, Building2, ChevronDown, ArrowRightLeft, Plus } from 'lucide-react';
import { getEffectiveSalary, isGSAPosition, getGSARateForYear } from '@/lib/utils/salaryHelpers';

interface YearData {
  rate: number;      // Escalated rate for this year
  hours: number;     // Hours for this year
  amount: number;    // rate × hours
  otHours: number;   // OT hours for this year
  otAmount: number;  // rate × OT multiplier × OT hours
}

interface SubcontractorGridRow {
  id: string;
  posIndex: number; // Track position index for operations
  labor_category: string;
  baseRate: number; // Base rate (Year 1)
  originalBaseRate: number; // Original rate at conversion (immutable)
  hours_per_year: Record<string, number>;
  ot_hours_per_year?: Record<string, number>;
  yearData: Record<string, YearData>; // Per-year rate, hours, amount, OT
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  row: SubcontractorGridRow | null;
}

export const SubcontractorSection = () => {
  const {
    subcontractors,
    totalYears,
    escalationRates,
    positions,
    travel,
    odcs,
    rates,
    deleteSubcontractor,
    renameSubcontractor,
    deleteSubcontractorPosition,
    updateSubcontractorPosition,
    updateLinkedBaseRate,
    addSubcontractor
  } = usePricingStore();

  // Helper to calculate escalated rate for a given year
  // Uses escalation rates from Rates Reference table
  const getEscalatedRate = useCallback((baseRate: number, year: number): number => {
    let rate = baseRate;
    // Apply compound escalation for each year
    for (let y = 1; y < year; y++) {
      const escalationKey = `${y}_to_${y + 1}`;
      const escalation = escalationRates?.[escalationKey] || 0;
      rate = rate * (1 + escalation);
    }
    return rate;
  }, [escalationRates]);

  // Check if proposal has any OT hours (to conditionally show OT columns)
  const hasOvertimeHours = useMemo(() => {
    // Check prime positions
    const primeHasOT = positions.some(pos => {
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
  }, [positions, subcontractors]);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subToDelete, setSubToDelete] = useState<{ id: string; name: string; positionCount: number } | null>(null);

  // Rename modal state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [subToRename, setSubToRename] = useState<{ id: string; name: string } | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Position delete confirmation state
  const [deletePosDialogOpen, setDeletePosDialogOpen] = useState(false);
  const [posToDelete, setPosToDelete] = useState<{ subId: string; posIndex: number; laborCategory: string } | null>(null);

  // Transfer modal state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferSource, setTransferSource] = useState<{ subId: string; posIndex: number } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    row: null,
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Track which subcontractor is selected (default to first one)
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Track overflow menu state
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  // Add subcontractor modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const MAX_VISIBLE_TABS = 4; // Show max 4 tabs before overflow

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, row: null });
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu.visible]);

  // Close overflow menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(event.target as Node)) {
        setShowOverflowMenu(false);
      }
    };

    if (showOverflowMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOverflowMenu]);

  // Select all text when rename dialog opens
  useEffect(() => {
    if (renameDialogOpen && renameInputRef.current) {
      // Small delay to ensure the input is focused
      setTimeout(() => {
        renameInputRef.current?.select();
      }, 100);
    }
  }, [renameDialogOpen]);

  // Set default selection when subcontractors change
  useEffect(() => {
    if (subcontractors.length > 0 && !selectedSubId) {
      setSelectedSubId(subcontractors[0].id);
    } else if (subcontractors.length > 0 && !subcontractors.find(s => s.id === selectedSubId)) {
      // Selected sub was deleted, select first one
      setSelectedSubId(subcontractors[0].id);
    } else if (subcontractors.length === 0) {
      setSelectedSubId(null);
    }
  }, [subcontractors, selectedSubId]);

  // Track previous subcontractor count to detect new additions
  const prevSubCountRef = useRef(subcontractors.length);

  useEffect(() => {
    // If subcontractors increased, select the newly added one
    if (subcontractors.length > prevSubCountRef.current) {
      const newSub = subcontractors[subcontractors.length - 1];
      setSelectedSubId(newSub.id);
    }
    prevSubCountRef.current = subcontractors.length;
  }, [subcontractors]);

  // Get the selected subcontractor's data
  const selectedSub = useMemo(() => {
    return subcontractors.find((s) => s.id === selectedSubId);
  }, [subcontractors, selectedSubId]);

  // Transform positions into grid rows with escalated rates
  const gridRows: SubcontractorGridRow[] = useMemo(() => {
    if (!selectedSub) return [];

    // Get OT multiplier from rates (default 1.5x)
    const otMultiplier = rates.ot_multiplier || 1.5;

    return selectedSub.positions.map((pos, index) => {
      const baseRate = pos.rate;
      const originalBaseRate = pos.original_base_rate || pos.rate; // Fallback for old data
      const yearData: Record<string, YearData> = {};

      // Calculate per-year data with escalation
      for (let year = 1; year <= totalYears; year++) {
        const yearStr = year.toString();
        const escalatedRate = getEscalatedRate(baseRate, year);
        const hours = pos.hours_per_year[yearStr] || 0;
        const amount = escalatedRate * hours;

        // Calculate OT costs
        const otHours = pos.ot_hours_per_year?.[yearStr] || 0;
        const otAmount = escalatedRate * otMultiplier * otHours;

        yearData[yearStr] = {
          rate: escalatedRate,
          hours,
          amount,
          otHours,
          otAmount,
        };
      }

      return {
        id: `${selectedSub.id}-${index}`,
        posIndex: index,
        labor_category: pos.labor_category,
        baseRate,
        originalBaseRate,
        hours_per_year: pos.hours_per_year,
        ot_hours_per_year: pos.ot_hours_per_year,
        yearData,
      };
    });
  }, [selectedSub, totalYears, escalationRates, getEscalatedRate, rates.ot_multiplier]);

  // Context menu handlers
  const handleContextMenu = useCallback((event: React.MouseEvent, row: SubcontractorGridRow) => {
    event.preventDefault();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      row,
    });
  }, []);

  const handleTransferClick = useCallback(() => {
    if (contextMenu.row && selectedSubId) {
      setTransferSource({
        subId: selectedSubId,
        posIndex: contextMenu.row.posIndex,
      });
      setTransferModalOpen(true);
    }
    setContextMenu({ visible: false, x: 0, y: 0, row: null });
  }, [contextMenu.row, selectedSubId]);

  const handleDeletePositionClick = useCallback(() => {
    if (contextMenu.row && selectedSubId) {
      setPosToDelete({
        subId: selectedSubId,
        posIndex: contextMenu.row.posIndex,
        laborCategory: contextMenu.row.labor_category,
      });
      setDeletePosDialogOpen(true);
    }
    setContextMenu({ visible: false, x: 0, y: 0, row: null });
  }, [contextMenu.row, selectedSubId]);

  // Add subcontractor modal handlers
  const handleAddSubcontractor = useCallback(() => {
    setIsAddModalOpen(true);
  }, []);

  const handleSaveSubcontractor = useCallback((name: string) => {
    addSubcontractor({ name, positions: [] });
    setIsAddModalOpen(false);
  }, [addSubcontractor]);

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
  }, []);

  // Define columns
  const columns: Column<SubcontractorGridRow>[] = useMemo(() => {
    const cols: Column<SubcontractorGridRow>[] = [
      {
        key: 'labor_category',
        name: 'Labor Category',
        width: 300,
        frozen: true,
        resizable: true,
        headerCellClass: 'bg-muted/50 font-semibold text-foreground border-r border-border',
        cellClass: 'border-r border-border',
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-3 bg-muted/20">
            <span className="font-semibold text-sm text-foreground whitespace-normal break-words overflow-wrap">{row.labor_category}</span>
          </div>
        ),
      },
      {
        key: 'baseRate',
        name: 'Base Rate\n($/hr)',
        width: 120,
        frozen: true,
        resizable: true,
        headerCellClass: 'bg-emerald-50 font-semibold text-emerald-700 border-r border-border whitespace-pre-line text-center',
        cellClass: 'border-r border-border',
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-3 bg-emerald-50/30">
            <span className="font-bold text-emerald-600">
              ${row.baseRate.toFixed(2)}
            </span>
          </div>
        ),
        editable: true,
        renderEditCell: (props: RenderEditCellProps<SubcontractorGridRow>) => {
          const [inputValue, setInputValue] = useState(props.row.baseRate.toFixed(2));

          const handleSave = () => {
            const newRate = parseFloat(inputValue) || 0;
            if (!selectedSub) return;

            const posIndex = selectedSub.positions.findIndex(p => p.labor_category === props.row.labor_category);
            if (posIndex >= 0) {
              const subPos = selectedSub.positions[posIndex];
              const originalPositionId = subPos.original_position_id;

              if (originalPositionId) {
                // Use bidirectional update method for positions linked to main grid
                updateLinkedBaseRate(originalPositionId, newRate);
              } else {
                // Fallback to direct update for positions without original_position_id
                updateSubcontractorPosition(selectedSub.id, posIndex, { rate: newRate });
              }
            }
            props.onClose(true);
          };

          return (
            <input
              className="w-full h-full px-2 border-2 border-emerald-500 focus:outline-none text-right font-bold text-emerald-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') props.onClose(false);
              }}
              autoFocus
            />
          );
        },
      },
      {
        key: 'originalBaseRate',
        name: 'Original Rate\n($/hr)',
        width: 135,
        frozen: true,
        resizable: true,
        headerCellClass: 'bg-gray-50 font-semibold text-gray-700 border-r border-border whitespace-pre-line text-center',
        cellClass: 'border-r border-border',
        renderCell: ({ row }) => {
          const originalRate = row.originalBaseRate;
          return (
            <div className="flex items-center justify-end h-full px-3 bg-gray-50/30">
              <span className="font-medium text-gray-600">
                ${originalRate.toFixed(2)}
              </span>
            </div>
          );
        },
      },
    ];

    // Add year columns: Rate, Hours, Amount for each year
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      const label = year === 1 ? 'Base Period' : `Option Year ${year - 1}`;

      // Rate column (escalated, read-only) - shows escalated rate for this year
      cols.push({
        key: `rate_${year}`,
        name: `${label}\nRate ($/hr)`,
        width: 115,
        resizable: true,
        headerCellClass: 'bg-emerald-50 font-semibold text-emerald-700 whitespace-pre-line text-center',
        renderCell: ({ row }) => {
          const yearData = row.yearData[yearStr];
          const rate = yearData?.rate || 0;
          return (
            <div className="flex items-center justify-end h-full px-2 bg-emerald-50/30">
              <span className="text-sm font-bold text-emerald-600">
                ${rate.toFixed(2)}
              </span>
            </div>
          );
        },
      });

      // Hours column (editable)
      cols.push({
        key: `hours_${year}`,
        name: `${label}\nHours`,
        width: 100,
        resizable: true,
        headerCellClass: 'bg-blue-50 font-medium text-blue-600 whitespace-pre-line text-center',
        renderCell: ({ row }) => {
          const yearData = row.yearData[yearStr];
          return (
            <div className="flex items-center justify-end h-full px-2 bg-blue-50/30">
              <span className="text-sm font-semibold text-blue-600">
                {(yearData?.hours || 0).toLocaleString('en-US')}
              </span>
            </div>
          );
        },
        editable: true,
        renderEditCell: (props: RenderEditCellProps<SubcontractorGridRow>) => {
          const currentHours = props.row.hours_per_year[yearStr] || 0;
          const [inputValue, setInputValue] = useState(currentHours.toString());

          const handleSave = () => {
            const newHours = parseFloat(inputValue) || 0;
            if (!selectedSub) return;

            const posIndex = selectedSub.positions.findIndex(p => p.labor_category === props.row.labor_category);
            if (posIndex >= 0) {
              const updatedHours = { ...props.row.hours_per_year, [yearStr]: newHours };
              updateSubcontractorPosition(selectedSub.id, posIndex, { hours_per_year: updatedHours });
            }
            props.onClose(true);
          };

          return (
            <input
              className="w-full h-full px-2 border-2 border-blue-500 focus:outline-none text-right font-semibold text-blue-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') props.onClose(false);
              }}
              autoFocus
            />
          );
        },
      });

      // Amount column (read-only, rate × hours)
      cols.push({
        key: `amount_${year}`,
        name: `${label}\nAmount ($)`,
        width: 120,
        resizable: true,
        headerCellClass: 'bg-purple-50 font-medium text-purple-600 whitespace-pre-line text-center',
        renderCell: ({ row }) => {
          const yearData = row.yearData[yearStr];
          return (
            <div className="flex items-center justify-end h-full px-2 bg-purple-50/30">
              <span className="text-sm font-bold text-purple-600">
                ${(yearData?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          );
        },
      });

      // OT Hours column (editable) - only show if proposal has OT hours
      if (hasOvertimeHours) {
        cols.push({
          key: `ot_hours_${year}`,
          name: `${label}\nOT Hours`,
          width: 100,
          resizable: true,
          headerCellClass: 'bg-amber-50 font-medium text-amber-600 whitespace-pre-line text-center',
          renderCell: ({ row }) => {
            const yearData = row.yearData[yearStr];
            return (
              <div className="flex items-center justify-end h-full px-2 bg-amber-50/30">
                <span className="text-sm font-semibold text-amber-600">
                  {(yearData?.otHours || 0).toLocaleString('en-US')}
                </span>
              </div>
            );
          },
          editable: true,
          renderEditCell: (props: RenderEditCellProps<SubcontractorGridRow>) => {
            const currentOTHours = props.row.ot_hours_per_year?.[yearStr] || 0;
            const [inputValue, setInputValue] = useState(currentOTHours.toString());

            const handleSave = () => {
              const newOTHours = parseFloat(inputValue) || 0;
              if (!selectedSub) return;

              const posIndex = selectedSub.positions.findIndex(p => p.labor_category === props.row.labor_category);
              if (posIndex >= 0) {
                const updatedOTHours = { ...props.row.ot_hours_per_year, [yearStr]: newOTHours };
                updateSubcontractorPosition(selectedSub.id, posIndex, { ot_hours_per_year: updatedOTHours });
              }
              props.onClose(true);
            };

            return (
              <input
                className="w-full h-full px-2 border-2 border-amber-500 focus:outline-none text-right font-semibold text-amber-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') props.onClose(false);
                }}
                autoFocus
              />
            );
          },
        });
      }

      // OT Amount column (read-only, rate × OT multiplier × OT hours) - only show if proposal has OT hours
      if (hasOvertimeHours) {
        cols.push({
          key: `ot_amount_${year}`,
          name: `${label}\nOT Amount ($)`,
          width: 120,
          resizable: true,
          headerCellClass: 'bg-amber-50 font-medium text-amber-600 border-r border-border whitespace-pre-line text-center',
          cellClass: 'border-r border-border',
          renderCell: ({ row }) => {
            const yearData = row.yearData[yearStr];
            return (
              <div className="flex items-center justify-end h-full px-2 bg-amber-50/30">
                <span className="text-sm font-bold text-amber-600">
                  ${(yearData?.otAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            );
          },
        });
      }
    }

    return cols;
  }, [totalYears, selectedSub, updateSubcontractorPosition]);

  // Calculate grand total for selected subcontractor (including OT)
  const grandTotal = useMemo(() => {
    return gridRows.reduce((sum, row) => {
      // Sum all amounts from yearData (regular + OT)
      const rowTotal = Object.values(row.yearData).reduce((yearSum, yearData) => {
        return yearSum + yearData.amount + yearData.otAmount;
      }, 0);
      return sum + rowTotal;
    }, 0);
  }, [gridRows]);

  // Calculate total for all subcontractors (with escalation and OT)
  const allSubsTotal = useMemo(() => {
    const otMultiplier = rates.ot_multiplier || 1.5;

    return subcontractors.reduce((sum, sub) => {
      const subTotal = sub.positions.reduce((posSum, pos) => {
        let positionTotal = 0;
        for (let year = 1; year <= totalYears; year++) {
          const yearStr = year.toString();
          const escalatedRate = getEscalatedRate(pos.rate, year);
          const hours = pos.hours_per_year[yearStr] || 0;
          const otHours = pos.ot_hours_per_year?.[yearStr] || 0;
          positionTotal += escalatedRate * hours + escalatedRate * otMultiplier * otHours;
        }
        return posSum + positionTotal;
      }, 0);
      return sum + subTotal;
    }, 0);
  }, [subcontractors, totalYears, escalationRates, getEscalatedRate, rates.ot_multiplier]);

  // Calculate percentage of dollars allocated to subcontractors
  // Formula: (Subcontractor Total + Passthrough) / (Total Contract Value - ODC - Travel)
  const subcontractorPercentages = useMemo(() => {
    // Calculate prime labor total
    let primeLaborTotal = 0;
    positions.forEach((pos) => {
      const isGSA = isGSAPosition(pos);

      Object.entries(pos.hours_per_year).forEach(([yearStr, hours]) => {
        const yearNum = parseInt(yearStr);

        if (isGSA) {
          const originalGsaRate = getGSARateForYear(pos, yearNum);
          const discountRate = pos.gsa_discount_rate || 0;
          const gsaRate = originalGsaRate * (1 - discountRate);
          primeLaborTotal += gsaRate * hours;
        } else {
          const baseWage = getEffectiveSalary(pos);
          if (!baseWage || baseWage === 0 || !pos.standard_fte_hours || pos.standard_fte_hours === 0) {
            return;
          }

          // Apply compound escalation
          let wage = baseWage;
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            wage *= (1 + escRate);
          }

          const dlRate = wage / pos.standard_fte_hours;
          const fringe = dlRate * rates.fringe;
          const ohOnsite = rates.oh_onsite !== undefined ? rates.oh_onsite : (rates.oh !== undefined ? rates.oh : 0.0711);
          const ohOffsite = rates.oh_offsite !== undefined ? rates.oh_offsite : (rates.oh !== undefined ? rates.oh : 0.0711);
          const locType = pos.location_type || 'On-Site';
          const ohRate = locType === 'On-Site' ? ohOnsite : ohOffsite;
          const oh = (dlRate + fringe) * ohRate;
          const ga = (dlRate + fringe + oh) * rates.ga;
          const fee = (dlRate + fringe + oh + ga) * rates.fee;
          const fblr = dlRate + fringe + oh + ga + fee;
          primeLaborTotal += fblr * hours;
        }
      });
    });

    // Calculate subcontractor total with escalation (already calculated in allSubsTotal)
    const subcontractorTotal = allSubsTotal;

    // Calculate passthrough (S&MH + G&A on subs)
    const passthroughTotal = subcontractorTotal * ((rates.smh || 0) + (rates.ga_passthrough || 0));

    // Calculate sub fee
    const subFee = subcontractorTotal * (rates.sub_fee || 0);

    // Calculate travel total with G&A and escalation
    let travelTotal = 0;
    travel.forEach((travelItem) => {
      Object.entries(travelItem.amount_per_year).forEach(([yearStr, amount]) => {
        const yearNum = parseInt(yearStr);
        let escalatedAmount = amount;

        if (travelItem.escalate) {
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedAmount *= (1 + escRate);
          }
        }

        const travelWithGA = escalatedAmount * (1 + rates.ga);
        travelTotal += travelWithGA;
      });
    });

    // Calculate ODC total with S&MH and escalation
    let odcTotal = 0;
    odcs.forEach((odc) => {
      Object.entries(odc.amount_per_year).forEach(([yearStr, amount]) => {
        const yearNum = parseInt(yearStr);
        let escalatedAmount = amount;

        if (odc.escalate) {
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedAmount *= (1 + escRate);
          }
        }

        const odcWithSMH = escalatedAmount * (1 + (rates.smh || 0));
        odcTotal += odcWithSMH;
      });
    });

    // Calculate grand total
    const grandTotal = primeLaborTotal + subFee + subcontractorTotal + passthroughTotal + travelTotal + odcTotal;

    // Calculate labor-only total (excluding ODC and Travel)
    const laborTotal = grandTotal - odcTotal - travelTotal;

    // Calculate percentage for each subcontractor
    const percentages: Record<string, { percentage: number; laborTotal: number }> = {};
    subcontractors.forEach((sub) => {
      const subTotal = sub.positions.reduce((posSum, pos) => {
        let positionTotal = 0;
        for (let year = 1; year <= totalYears; year++) {
          const yearStr = year.toString();
          const escalatedRate = getEscalatedRate(pos.rate, year);
          const hours = pos.hours_per_year[yearStr] || 0;
          positionTotal += escalatedRate * hours;
        }
        return posSum + positionTotal;
      }, 0);

      // Calculate passthrough for this specific sub
      const subPassthrough = subTotal * ((rates.smh || 0) + (rates.ga_passthrough || 0));

      // Percentage includes both subcontractor cost and passthrough
      const subTotalWithPassthrough = subTotal + subPassthrough;
      const percentage = laborTotal > 0 ? (subTotalWithPassthrough / laborTotal) * 100 : 0;

      percentages[sub.id] = {
        percentage,
        laborTotal,
      };
    });

    return percentages;
  }, [positions, subcontractors, travel, odcs, rates, escalationRates, totalYears, allSubsTotal, getEscalatedRate]);

  if (subcontractors.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2 px-6">
          Subcontractor Labor
        </h3>
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm">No subcontractor positions yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Right-click on a position and select "Convert to Subcontractor"
            </p>
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={handleAddSubcontractor}
                className="text-muted-foreground hover:text-green-600 hover:bg-green-50 hover:border-green-200"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Subcontractor
              </Button>
            </div>
          </div>
        </Card>

        {/* Add Subcontractor Modal */}
        <AddSubcontractorModal
          isOpen={isAddModalOpen}
          onClose={handleCloseModal}
          onSave={handleSaveSubcontractor}
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Header with Tabs */}
      <div className="px-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">
            Subcontractor Labor
          </h3>

          <div className="flex items-center gap-3">
            {/* Add Subcontractor Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddSubcontractor}
              className="text-muted-foreground hover:text-green-600 hover:bg-green-50 hover:border-green-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Subcontractor
            </Button>

            {/* Delete Button for Selected Sub */}
            {selectedSub && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSubToDelete({
                    id: selectedSub.id,
                    name: selectedSub.name,
                    positionCount: selectedSub.positions.length,
                  });
                  setDeleteDialogOpen(true);
                }}
                className="text-muted-foreground hover:text-red-600 hover:bg-red-50 hover:border-red-200"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Subcontractor
              </Button>
            )}
          </div>
        </div>

        {/* Tabs for Subcontractors */}
        <div className="flex items-center gap-1 border-b border-border">
          {/* Visible Tabs */}
          {subcontractors.slice(0, MAX_VISIBLE_TABS).map((sub) => (
            <button
              key={sub.id}
              onClick={() => setSelectedSubId(sub.id)}
              onDoubleClick={() => {
                setSubToRename({
                  id: sub.id,
                  name: sub.name,
                });
                setNewSubName(sub.name);
                setRenameDialogOpen(true);
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                selectedSubId === sub.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Double-click to rename"
            >
              {sub.name}
              <span className="ml-2 text-xs opacity-70">
                ({sub.positions.length})
              </span>
            </button>
          ))}

          {/* Overflow Menu Button */}
          {subcontractors.length > MAX_VISIBLE_TABS && (
            <div className="relative" ref={overflowMenuRef}>
              <button
                onClick={() => setShowOverflowMenu(!showOverflowMenu)}
                className={`px-3 py-2 text-sm font-medium transition-colors flex items-center gap-1 ${
                  showOverflowMenu ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ChevronDown className="w-4 h-4" />
                More ({subcontractors.length - MAX_VISIBLE_TABS})
              </button>

              {/* Overflow Dropdown */}
              {showOverflowMenu && (
                <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-lg shadow-lg py-1 z-50 min-w-[200px]">
                  {subcontractors.slice(MAX_VISIBLE_TABS).map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => {
                        setSelectedSubId(sub.id);
                        setShowOverflowMenu(false);
                      }}
                      onDoubleClick={() => {
                        setSubToRename({
                          id: sub.id,
                          name: sub.name,
                        });
                        setNewSubName(sub.name);
                        setRenameDialogOpen(true);
                        setShowOverflowMenu(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center justify-between ${
                        selectedSubId === sub.id ? 'bg-muted font-medium' : ''
                      }`}
                      title="Double-click to rename"
                    >
                      <span>{sub.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({sub.positions.length})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selected Subcontractor Details */}
      {selectedSub && (
        <Card className="overflow-hidden">
          {/* Subcontractor Summary Header */}
          <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
            <div>
              <h4 className="text-lg font-semibold text-foreground">{selectedSub.name}</h4>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selectedSub.positions.length} position{selectedSub.positions.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="text-xl font-bold text-purple-600">
                ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {subcontractorPercentages[selectedSub.id] && (
                <p className="text-lg font-bold text-purple-600 mt-1">
                  {subcontractorPercentages[selectedSub.id].percentage.toFixed(1)}% of labor dollars
                  {subcontractorPercentages[selectedSub.id].percentage > 70 && (
                    <span className="ml-1 text-amber-600 font-medium" title="Exceeds FAR 70% threshold">⚠</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Data Grid */}
          <div className="p-4">
            <div
              style={{ height: `${Math.min(gridRows.length * 45 + 100, 600)}px` }}
              onContextMenu={(e) => {
                // Find which row was right-clicked
                const target = e.target as HTMLElement;
                const rowElement = target.closest('[role="row"]');
                if (rowElement) {
                  const rowIndex = parseInt(rowElement.getAttribute('aria-rowindex') || '0', 10) - 2; // Subtract 2 for header
                  if (rowIndex >= 0 && rowIndex < gridRows.length) {
                    handleContextMenu(e, gridRows[rowIndex]);
                  }
                }
              }}
            >
              <DataGrid
                columns={columns}
                rows={gridRows}
                rowKeyGetter={(row) => row.id}
                className="rdg-light"
                style={{ height: '100%' }}
                rowHeight={45}
                headerRowHeight={60}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Grand Total for All Subcontractors */}
      {(() => {
        // Calculate combined percentage for all subcontractors
        const totalPassthrough = allSubsTotal * ((rates.smh || 0) + (rates.ga_passthrough || 0));
        const totalWithPassthrough = allSubsTotal + totalPassthrough;
        const laborTotal = subcontractorPercentages[subcontractors[0]?.id]?.laborTotal || 1;
        const combinedPercentage = laborTotal > 0 ? (totalWithPassthrough / laborTotal) * 100 : 0;

        return (
          <Card className="p-4 bg-purple-50 border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-base font-semibold text-foreground">
                  Total Subcontractor Cost
                </span>
                <p className="text-lg font-bold text-purple-600 mt-1">
                  {combinedPercentage.toFixed(1)}% of labor dollars
                  {combinedPercentage > 70 && (
                    <span className="ml-1 text-amber-600 font-medium" title="Exceeds FAR 70% threshold">⚠</span>
                  )}
                </p>
              </div>
              <span className="text-xl font-bold text-purple-600">
                $
                {allSubsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </Card>
        );
      })()}

      {/* Rename Subcontractor Modal */}
      {renameDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Rename Subcontractor
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enter a new name for: <span className="font-medium">{subToRename?.name}</span>
            </p>
            <input
              ref={renameInputRef}
              type="text"
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSubName.trim()) {
                  if (subToRename) {
                    renameSubcontractor(subToRename.id, newSubName);
                  }
                  setRenameDialogOpen(false);
                  setSubToRename(null);
                  setNewSubName('');
                } else if (e.key === 'Escape') {
                  setRenameDialogOpen(false);
                  setSubToRename(null);
                  setNewSubName('');
                }
              }}
              placeholder="Enter new name"
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRenameDialogOpen(false);
                  setSubToRename(null);
                  setNewSubName('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (subToRename && newSubName.trim()) {
                    renameSubcontractor(subToRename.id, newSubName);
                    setRenameDialogOpen(false);
                    setSubToRename(null);
                    setNewSubName('');
                  }
                }}
                disabled={!newSubName.trim()}
              >
                Rename
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Subcontractor Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setSubToDelete(null);
        }}
        onConfirm={() => {
          if (subToDelete) {
            deleteSubcontractor(subToDelete.id);
          }
          setDeleteDialogOpen(false);
          setSubToDelete(null);
        }}
        title="Delete Subcontractor"
        message={`Are you sure you want to delete subcontractor "${subToDelete?.name}" and all ${subToDelete?.positionCount} position(s)? Hours will be returned to prime positions.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />

      {/* Delete Position Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deletePosDialogOpen}
        onClose={() => {
          setDeletePosDialogOpen(false);
          setPosToDelete(null);
        }}
        onConfirm={() => {
          if (posToDelete) {
            deleteSubcontractorPosition(posToDelete.subId, posToDelete.posIndex);
          }
          setDeletePosDialogOpen(false);
          setPosToDelete(null);
        }}
        title="Delete Position"
        message={`Are you sure you want to delete "${posToDelete?.laborCategory}" from this subcontractor? Hours will be returned to the prime position.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />

      {/* Transfer Modal */}
      <TransferSubcontractorModal
        open={transferModalOpen}
        onClose={() => {
          setTransferModalOpen(false);
          setTransferSource(null);
        }}
        lockSource={true}
        sourceSubcontractorId={transferSource?.subId}
        sourcePositionIndex={transferSource?.posIndex}
      />

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="fixed bg-background border border-border rounded-lg shadow-lg py-1 z-50 min-w-[180px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
            onClick={handleTransferClick}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Transfer to Subcontractor
          </button>
          <div className="border-t border-border my-1" />
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
            onClick={handleDeletePositionClick}
          >
            <Trash2 className="w-4 h-4" />
            Delete Position
          </button>
        </div>
      )}

      {/* Add Subcontractor Modal */}
      <AddSubcontractorModal
        isOpen={isAddModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveSubcontractor}
      />
    </div>
  );
};

export default SubcontractorSection;
