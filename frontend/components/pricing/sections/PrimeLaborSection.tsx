'use client';

import { useMemo, useCallback, useState } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { AdvancedPosition, IndirectRates, EscalationRates, GridRow, BreakdownType, ContextMenuItem } from '@/types';
import { ChevronDown, ChevronRight, Trash2, MoreVertical } from 'lucide-react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { ConvertToSubcontractorModal } from '@/components/pricing/ConvertToSubcontractorModal';

// Calculate averaged FBLR for an advanced position using proportional hourly rates
const calculateAveragedFBLR = (
  position: AdvancedPosition,
  rates: IndirectRates,
  escalationRates: EscalationRates,
  totalYears: number
) => {
  // Get base wage from selected percentile
  const baseWage = position[`wage_${position.percentile}`] || 0;

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
}

export const PrimeLaborSection = ({
  positions,
  rates,
  escalationRates,
  totalYears,
  expandedPositions,
  manualOverrides,
  onToggleExpand,
  onCellChange,
  onDeletePosition,
  onUpdatePosition,
}: PrimeLaborSectionProps) => {
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; position: AdvancedPosition } | null>(null);

  // Conversion modal state
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [positionToConvert, setPositionToConvert] = useState<AdvancedPosition | null>(null);

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
  const getContextMenuItems = useCallback((position: AdvancedPosition): ContextMenuItem[] => [
    {
      label: 'Convert to Subcontractor',
      icon: <MoreVertical className="w-4 h-4" />,
      onClick: () => {
        setPositionToConvert(position);
        setConversionModalOpen(true);
      },
    },
    {
      label: 'Delete Position',
      icon: <Trash2 className="w-4 h-4" />,
      onClick: () => {
        if (confirm(`Delete position "${position.labor_category}"?`)) {
          onDeletePosition(position.id);
        }
      },
      danger: true,
    },
  ], [onDeletePosition]);

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
  }, [positions, expandedPositions]);

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
      // Cost Element - Expandable indicator + labor category
      {
        key: 'cost_element',
        name: 'Cost Element',
        width: 250,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            const isExpanded = row.isExpanded;
            return (
              <div className="flex items-center h-full px-2">
                <button
                  onClick={() => onToggleExpand(row.positionId)}
                  className="mr-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
                <span className="font-semibold text-slate-50">
                  {pos.labor_category}
                </span>
              </div>
            );
          } else {
            // Breakdown row
            return (
              <div className="flex items-center h-full px-2 pl-10">
                <span className="text-sm text-slate-400">
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
                <span className="text-xs text-slate-400">{pos.soc_title || '-'}</span>
              </div>
            );
          }
          return <div className="h-full bg-slate-900/30" />;
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
                <span className="text-xs text-slate-400">{pos.soc_code || '-'}</span>
              </div>
            );
          }
          return <div className="h-full bg-slate-900/30" />;
        },
      },
      // Percentile - Editable dropdown
      {
        key: 'percentile',
        name: 'Percentile',
        width: 180,
        resizable: true,
        editable: (row) => row.type === 'position',
        renderEditCell: (props: RenderEditCellProps<GridRow>) => {
          if (props.row.type !== 'position') return null;
          const pos = props.row.data as AdvancedPosition;

          return (
            <select
              className="w-full h-full px-2 bg-slate-950 text-slate-50 outline-none cursor-pointer font-semibold"
              value={pos.percentile}
              onChange={(e) => {
                const newPercentile = e.target.value as AdvancedPosition['percentile'];
                // Update through store
                onUpdatePosition(pos.id, { percentile: newPercentile });
                // Also update the row for immediate UI feedback
                props.onRowChange({
                  ...props.row,
                  data: {
                    ...pos,
                    percentile: newPercentile,
                  },
                });
              }}
              onBlur={() => props.onClose(true)}
              autoFocus
            >
              <option value="10th">10th (${(pos.wage_10th || 0).toLocaleString()})</option>
              <option value="25th">25th (${(pos.wage_25th || 0).toLocaleString()})</option>
              <option value="50th">50th (${(pos.wage_50th || 0).toLocaleString()})</option>
              <option value="75th">75th (${(pos.wage_75th || 0).toLocaleString()})</option>
              <option value="90th">90th (${(pos.wage_90th || 0).toLocaleString()})</option>
            </select>
          );
        },
        renderCell: ({ row }) => {
          if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            return (
              <div className="flex items-center h-full px-2">
                <span className="font-semibold text-slate-50">{pos.percentile}</span>
                <span className="ml-2 text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                  ${(pos[`wage_${pos.percentile}`] || 0).toLocaleString()}
                </span>
              </div>
            );
          }
          return <div className="h-full bg-slate-900/30" />;
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
                <span className="text-slate-50">
                  {pos.total_hours.toLocaleString()}
                </span>
              </div>
            );
          }
          return <div className="h-full bg-slate-900/30" />;
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
                <span className="text-emerald-400 font-bold">
                  {formatCurrency(pos.total_amount)}
                </span>
              </div>
            );
          }
          return <div className="h-full bg-slate-900/30" />;
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
              <span className={row.type === 'position' ? 'text-emerald-400 font-semibold' : 'text-purple-400'}>
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
                <span className="text-slate-50">
                  {breakdown.hours.toLocaleString()}
                </span>
              </div>
            );
          }
          return <div className="h-full bg-slate-900/30" />;
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
              <span className={row.type === 'position' ? 'text-emerald-400 font-semibold' : 'text-purple-400'}>
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
                <span className="text-purple-400 font-semibold">
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
                <span className="text-purple-400 font-semibold">
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
                <span className="text-purple-400 font-semibold">
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
                <span className="text-purple-400 font-semibold">
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
                <span className="text-purple-400 font-semibold">
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
                <span className="text-emerald-400 font-bold">
                  ${calc.fblr.toFixed(2)}
                </span>
              </div>
            );
          }
          return <div />;
        },
      }
    );

    // Actions column
    cols.push({
      key: 'actions',
      name: 'Actions',
      width: 80,
      frozen: true,
      renderCell: ({ row }) => {
        if (row.type === 'position') {
          const pos = row.data as AdvancedPosition;
          return (
            <div className="flex items-center justify-center h-full">
              <button
                onClick={() => {
                  if (confirm(`Delete position "${pos.labor_category}"?`)) {
                    onDeletePosition(row.positionId);
                  }
                }}
                className="text-slate-400 hover:text-red-400 transition-colors p-1"
                title="Delete position"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        }
        return <div className="h-full bg-slate-900/30" />;
      },
    });

    return cols;
  }, [totalYears, expandedPositions, manualOverrides, onToggleExpand, onDeletePosition]);

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 bg-slate-900/30 rounded-lg border border-slate-800">
        <div className="text-center">
          <p className="text-slate-400 mb-2">No positions yet</p>
          <p className="text-sm text-slate-500">Add positions to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-50">Prime Labor</h3>
        <p className="text-sm text-slate-400">
          {positions.length} position{positions.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div
        className="h-[600px] overflow-auto border border-slate-800 rounded-lg"
        onContextMenu={(e) => {
          // Find which row was clicked
          const target = e.target as HTMLElement;
          const rowElement = target.closest('[role="row"]');
          if (rowElement) {
            const rowIndex = Array.from(rowElement.parentElement?.children || []).indexOf(rowElement) - 1; // Subtract 1 for header row
            if (rowIndex >= 0 && rowIndex < gridRows.length) {
              const row = gridRows[rowIndex];
              // Only show context menu for position rows, not breakdown rows
              if (row.type === 'position') {
                handleContextMenu(e, row.data as AdvancedPosition);
              }
            }
          }
        }}
      >
        <DataGrid
          columns={columns}
          rows={gridRows}
          rowKeyGetter={(row) => `${row.positionId}_${row.type}_${row.breakdownType || ''}`}
          className="rdg-light"
          style={{ height: '100%' }}
          rowHeight={45}
        />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.position)}
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
    </div>
  );
};

export default PrimeLaborSection;
