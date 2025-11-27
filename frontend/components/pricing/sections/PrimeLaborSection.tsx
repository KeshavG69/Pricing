'use client';

import { useMemo, useCallback } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { AdvancedPosition, IndirectRates, GridRow, BreakdownType } from '@/types';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

interface PrimeLaborSectionProps {
  positions: AdvancedPosition[];
  rates: IndirectRates;
  totalYears: number;
  expandedPositions: Set<string>;
  manualOverrides: Map<string, Set<string>>;
  onToggleExpand: (positionId: string) => void;
  onCellChange: (positionId: string, year: string, field: string, value: number) => void;
  onDeletePosition: (positionId: string) => void;
}

export const PrimeLaborSection = ({
  positions,
  rates,
  totalYears,
  expandedPositions,
  manualOverrides,
  onToggleExpand,
  onCellChange,
  onDeletePosition,
}: PrimeLaborSectionProps) => {
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
      // Percentile
      {
        key: 'percentile',
        name: 'Percentile',
        width: 120,
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'position') {
            const pos = row.data as AdvancedPosition;
            return (
              <div className="flex items-center h-full px-2">
                <span className="font-semibold text-slate-50">{pos.percentile}</span>
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

      <div className="h-[600px] overflow-auto border border-slate-800 rounded-lg">
        <DataGrid
          columns={columns}
          rows={gridRows}
          rowKeyGetter={(row) => `${row.positionId}_${row.type}_${row.breakdownType || ''}`}
          className="rdg-light"
          style={{ height: '100%' }}
          rowHeight={45}
        />
      </div>
    </div>
  );
};

export default PrimeLaborSection;
