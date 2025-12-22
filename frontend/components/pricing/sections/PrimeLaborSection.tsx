'use client';

import { useMemo, useCallback, useState } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';
import { AdvancedPosition, IndirectRates, EscalationRates, GridRow, BreakdownType, ContextMenuItem } from '@/types';
import { ChevronDown, ChevronRight, Trash2, MoreVertical, Plus } from 'lucide-react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ConvertToSubcontractorModal } from '@/components/pricing/ConvertToSubcontractorModal';
import { SalarySelectionModal } from '@/components/pricing/SalarySelectionModal';
import AddPositionModal from '@/components/pricing/AddPositionModal';
import { getAvailablePercentiles } from '@/lib/utils/percentileHelpers';
import Button from '@/components/ui/Button';
import { usePricingStore } from '@/lib/stores/pricingStore';

// Calculate averaged FBLR for an advanced position using proportional hourly rates
const calculateAveragedFBLR = (
  position: AdvancedPosition,
  rates: IndirectRates,
  escalationRates: EscalationRates,
  totalYears: number
) => {
  // Prioritize custom_salary, then percentile wage
  const baseWage = position.custom_salary || position[`wage_${position.percentile}`] || 0;

  if (baseWage === 0 || totalYears === 0) {
    return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0 };
  }

  let totalSalary = 0;
  let totalHours = 0;
  let currentYearWage = baseWage;

  // Get FTE hours (fallback to 1880)
  const fteHours = position.standard_fte_hours || 1880;

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
    return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0 };
  }

  // Calculate averaged DL rate
  const dlRate = totalSalary / totalHours;

  // Apply FBLR cascade
  const fringe = dlRate * rates.fringe;
  const oh = (dlRate + fringe) * rates.oh;
  const ga = (dlRate + fringe + oh) * rates.ga;
  const fee = (dlRate + fringe + oh + ga) * rates.fee;
  const fblr = dlRate + fringe + oh + ga + fee;

  return { dlRate, fringe, oh, ga, fee, fblr };
};

interface PrimeLaborSectionProps {
  positions: AdvancedPosition[];
  rates: IndirectRates;
  escalationRates: EscalationRates;
  totalYears: number;
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
  expandedPositions,
  manualOverrides,
  onToggleExpand,
  onCellChange: _onCellChange, // TODO: Implement editable cells
  onDeletePosition,
  onUpdatePosition,
  isAdvancedMode = true, // Default to true for backwards compatibility
}: PrimeLaborSectionProps) => {
  // Debug: Log when component re-renders
  console.log('[PrimeLaborSection] Re-render with', positions.length, 'positions, rates:', {
    fringe: rates.fringe,
    oh: rates.oh,
    ga: rates.ga,
    fee: rates.fee
  });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; position: AdvancedPosition; columnKey?: string } | null>(null);

  // Conversion modal state
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [positionToConvert, setPositionToConvert] = useState<AdvancedPosition | null>(null);

  // Salary selection modal state
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [positionToEdit, setPositionToEdit] = useState<AdvancedPosition | null>(null);

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
  }, [onDeletePosition, onUpdatePosition, isAdvancedMode]);

  // Transform positions to grid rows with breakdown rows
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
    });

    return rows;
  }, [positions, expandedPositions, rates, escalationRates, totalYears]);

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
      // Labour Category - Expandable indicator + labor category
      {
        key: 'cost_element',
        name: 'Labour Category',
        width: 250,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const isExpanded = row.isExpanded;
            return (
              <div
                className="flex items-center h-full px-2"
                onContextMenu={(e) => {
                  handleContextMenu(e, pos);
                }}
              >
                <button
                  onClick={() => onToggleExpand(row.positionId)}
                  className="mr-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                <span className="font-semibold text-foreground">
                  {pos.labor_category}
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
      // BLS Category
      {
        key: 'bls_category',
        name: 'BLS Category',
        width: 220,
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            return (
              <div className="flex items-center h-full px-2">
                <span className="text-xs text-muted-foreground">{pos.soc_title || '-'}</span>
              </div>
            );
          }
          return <div className="h-full bg-muted/30" />;
        },
      },
      // BLS Code
      {
        key: 'bls_code',
        name: 'BLS Code',
        width: 100,
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            return (
              <div className="flex items-center h-full px-2">
                <span className="text-xs text-muted-foreground">{pos.soc_code || '-'}</span>
              </div>
            );
          }
          return <div className="h-full bg-muted/30" />;
        },
      },
      // Salary - Click to open modal
      {
        key: 'percentile',
        name: 'Salary',
        width: 180,
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const wage = pos.custom_salary || pos[`wage_${pos.percentile}`] || 0;
            const isCustom = !!pos.custom_salary;
            return (
              <div
                className="flex items-center h-full px-2 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => {
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
                {isCustom ? (
                  // Custom salary - only show amount with icon
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">
                    ${wage.toLocaleString()} ✎
                  </span>
                ) : (
                  // BLS percentile - show percentile + wage
                  <>
                    <span className="font-semibold text-foreground">{pos.percentile}</span>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded text-primary bg-primary/10">
                      ${wage.toLocaleString()}
                    </span>
                  </>
                )}
              </div>
            );
          }
          return <div className="h-full bg-muted/30" />;
        },
      },
      // Total Hours
      {
        key: 'total_hours',
        name: 'Total Hours',
        width: 120,
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            return (
              <div className="flex items-center justify-end h-full px-2">
                <span className="text-foreground">
                  {pos.total_hours.toLocaleString()}
                </span>
              </div>
            );
          }
          return <div className="h-full bg-muted/30" />;
        },
      },
      // Total Amount
      {
        key: 'total_amount',
        name: 'Total Amount',
        width: 150,
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
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
      },
    ];

    // Add year-based columns (Rate, Hours, Amount triplets)
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      const label = year === 1 ? 'Base Period' : `Option Year ${year - 1}`;

      // Rate column
      cols.push({
        key: `year${year}_rate`,
        name: `${label}\nRate ($/hr)`,
        width: 120,
        resizable: true,
        renderCell: ({ row }) => {
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
        width: 100,
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
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
        width: 130,
        resizable: true,
        renderCell: ({ row }) => {
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
        width: 130,
        frozen: false,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
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
        width: 120,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
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
        width: 110,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
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
        width: 110,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
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
        width: 110,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
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
        width: 130,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
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

    return cols;
  }, [totalYears, expandedPositions, manualOverrides, onToggleExpand, onDeletePosition, handleContextMenu, rates, escalationRates]);

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

  // Get store methods (positions for the modal)
  const { addPosition, positions: basicPositions } = usePricingStore();

  // Handle add position - open modal
  const handleAddPosition = useCallback(() => {
    setAddPositionModalOpen(true);
  }, []);

  // Handle modal submit
  const handleModalAddPosition = useCallback((positionData: any) => {
    addPosition(positionData);
  }, [addPosition]);

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
        className="overflow-auto border border-border rounded-lg transition-all duration-200"
        style={{ height: Math.min(Math.max(gridRows.length * 45 + 50, 200), 800) }}
      >
        <DataGrid
          columns={columns}
          rows={gridRows}
          rowKeyGetter={(row) => `${row.positionId}_${row.type}_${row.breakdownType || ''}`}
          className={styles.excelGrid}
          style={{ height: '100%' }}
          rowHeight={45}
        />
      </div>

      {/* Context Menu */}
      {contextMenu && (
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
    </div>
  );
};

export default PrimeLaborSection;
