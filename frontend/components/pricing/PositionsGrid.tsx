'use client';

import { useMemo, useCallback } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { SpreadsheetPosition } from '@/types';
import { Trash2 } from 'lucide-react';

export const PositionsGrid = () => {
  const { positions, totalYears, rates, updatePosition, deletePosition } = usePricingStore();

  // Handle row changes (for inline editing)
  const handleRowsChange = useCallback((newRows: SpreadsheetPosition[]) => {
    // Find what changed and update through store
    newRows.forEach((newRow) => {
      const oldRow = positions.find((p) => p.id === newRow.id);
      if (oldRow && JSON.stringify(oldRow) !== JSON.stringify(newRow)) {
        // Extract only the changed fields
        const changes: Partial<SpreadsheetPosition> = {};
        (Object.keys(newRow) as Array<keyof SpreadsheetPosition>).forEach((key) => {
          if (newRow[key] !== oldRow[key]) {
            (changes as any)[key] = newRow[key];
          }
        });

        if (Object.keys(changes).length > 0) {
          updatePosition(newRow.id, changes);
        }
      }
    });
  }, [positions, updatePosition]);

  // Calculate FBLR for a position
  const calculateFBLR = (position: SpreadsheetPosition) => {
    const selectedWage = position[`wage_${position.percentile}`] || 0;
    const totalHours = Object.values(position.hours_per_year).reduce((sum, h) => sum + h, 0);

    if (totalHours === 0) return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0 };

    const dlRate = selectedWage / totalHours;
    const fringe = dlRate * rates.fringe;
    const oh = (dlRate + fringe) * rates.oh;
    const ga = (dlRate + fringe + oh) * rates.ga;
    const fee = (dlRate + fringe + oh + ga) * rates.fee;
    const fblr = dlRate + fringe + oh + ga + fee;

    return { dlRate, fringe, oh, ga, fee, fblr };
  };

  // Generate columns dynamically
  const columns = useMemo<Column<SpreadsheetPosition>[]>(() => {
    const cols: Column<SpreadsheetPosition>[] = [
      // Labor Category - Editable
      {
        key: 'labor_category',
        name: 'Labor Category',
        width: 200,
        resizable: true,
        editable: true,
      },
      // Experience - Editable
      {
        key: 'experience',
        name: 'Experience (yrs)',
        width: 120,
        resizable: true,
        editable: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span>{row.experience || '-'}</span>
          </div>
        ),
      },
      // Location - Editable
      {
        key: 'location',
        name: 'Location',
        width: 150,
        resizable: true,
        editable: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span>{row.location || '-'}</span>
          </div>
        ),
      },
      // SOC Code - Read-only
      {
        key: 'soc_code',
        name: 'BLS Code',
        width: 100,
        resizable: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span className="text-slate-400 text-xs">{row.soc_code || '-'}</span>
          </div>
        ),
      },
      // SOC Title - Read-only
      {
        key: 'soc_title',
        name: 'BLS Labour Category',
        width: 220,
        resizable: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span className="text-slate-400 text-xs">{row.soc_title || '-'}</span>
          </div>
        ),
      },
      // Percentile Dropdown - Shows all 5 wage options
      {
        key: 'percentile',
        name: 'Percentile',
        width: 180,
        resizable: true,
        editable: true,
        renderEditCell: (props: RenderEditCellProps<SpreadsheetPosition>) => (
          <select
            className="w-full h-full px-2 bg-slate-950 text-slate-50 outline-none cursor-pointer font-semibold"
            value={props.row.percentile}
            onChange={(e) => {
              props.onRowChange({
                ...props.row,
                percentile: e.target.value as SpreadsheetPosition['percentile'],
              });
            }}
            onBlur={() => props.onClose(true)}
            autoFocus
          >
            <option value="10th">10th (${(props.row.wage_10th || 0).toLocaleString()})</option>
            <option value="25th">25th (${(props.row.wage_25th || 0).toLocaleString()})</option>
            <option value="50th">50th (${(props.row.wage_50th || 0).toLocaleString()})</option>
            <option value="75th">75th (${(props.row.wage_75th || 0).toLocaleString()})</option>
            <option value="90th">90th (${(props.row.wage_90th || 0).toLocaleString()})</option>
          </select>
        ),
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span className="font-semibold">{row.percentile}</span>
            <span className="ml-2 text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
              ${(row[`wage_${row.percentile}`] || 0).toLocaleString()}
            </span>
          </div>
        ),
      },
      // Salary - Editable (custom edit cell to handle dynamic wage field)
      {
        key: 'salary',
        name: 'Salary ($)',
        width: 130,
        resizable: true,
        editable: true,
        renderEditCell: (props: RenderEditCellProps<SpreadsheetPosition>) => {
          const wageKey = `wage_${props.row.percentile}` as keyof SpreadsheetPosition;
          return (
            <input
              type="number"
              className="w-full h-full px-2 bg-slate-950 text-slate-50 outline-none"
              value={(props.row[wageKey] as number) || 0}
              onChange={(e) => {
                props.onRowChange({
                  ...props.row,
                  [wageKey]: parseFloat(e.target.value) || 0,
                });
              }}
              onBlur={() => props.onClose(true)}
              autoFocus
            />
          );
        },
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2">
            <span>${(row[`wage_${row.percentile}`] || 0).toLocaleString()}</span>
          </div>
        ),
      },
    ];

    // Add year-based hours columns
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      cols.push({
        key: `year${year}_hours`,
        name: year === 1 ? `Base Year\nHours` : `Option ${year - 1}\nHours`,
        width: 120,
        resizable: true,
        editable: true,
        renderEditCell: (props: RenderEditCellProps<SpreadsheetPosition>) => (
          <input
            type="number"
            className="w-full h-full px-2 bg-slate-950 text-slate-50 outline-none"
            value={props.row.hours_per_year[yearStr] || 0}
            onChange={(e) => {
              const newHours = { ...props.row.hours_per_year };
              newHours[yearStr] = parseFloat(e.target.value) || 0;
              props.onRowChange({
                ...props.row,
                hours_per_year: newHours,
              });
            }}
            onBlur={() => props.onClose(true)}
            autoFocus
          />
        ),
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2">
            <span>
              {(row.hours_per_year[yearStr] || 0).toLocaleString('en-US')}
            </span>
          </div>
        ),
      });
    }

    // Calculated columns (FBLR breakdown)
    cols.push(
      {
        key: 'dl_rate',
        name: 'DL Rate ($/hr)',
        width: 120,
        resizable: true,
        renderCell: ({ row }) => {
          const calc = calculateFBLR(row);
          return (
            <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
              <span className="text-purple-400 font-semibold">${calc.dlRate.toFixed(2)}</span>
            </div>
          );
        },
      },
      {
        key: 'fringe',
        name: 'Fringe ($/hr)',
        width: 120,
        resizable: true,
        renderCell: ({ row }) => {
          const calc = calculateFBLR(row);
          return (
            <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
              <span className="text-purple-400 font-semibold">${calc.fringe.toFixed(2)}</span>
            </div>
          );
        },
      },
      {
        key: 'oh',
        name: 'OH ($/hr)',
        width: 110,
        resizable: true,
        renderCell: ({ row }) => {
          const calc = calculateFBLR(row);
          return (
            <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
              <span className="text-purple-400 font-semibold">${calc.oh.toFixed(2)}</span>
            </div>
          );
        },
      },
      {
        key: 'ga',
        name: 'G&A ($/hr)',
        width: 110,
        resizable: true,
        renderCell: ({ row }) => {
          const calc = calculateFBLR(row);
          return (
            <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
              <span className="text-purple-400 font-semibold">${calc.ga.toFixed(2)}</span>
            </div>
          );
        },
      },
      {
        key: 'fee',
        name: 'Fee ($/hr)',
        width: 110,
        resizable: true,
        renderCell: ({ row }) => {
          const calc = calculateFBLR(row);
          return (
            <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
              <span className="text-purple-400 font-semibold">${calc.fee.toFixed(2)}</span>
            </div>
          );
        },
      },
      {
        key: 'fblr',
        name: 'Full Burdened Rate ($/hr)',
        width: 180,
        resizable: true,
        renderCell: ({ row }) => {
          const calc = calculateFBLR(row);
          return (
            <div className="flex items-center justify-end h-full px-2 bg-emerald-500/10">
              <span className="text-emerald-400 font-bold text-base">${calc.fblr.toFixed(2)}</span>
            </div>
          );
        },
      }
    );

    // Actions column
    cols.push({
      key: 'actions',
      name: 'Actions',
      width: 80,
      frozen: true,
      renderCell: ({ row }) => (
        <div className="flex items-center justify-center h-full">
          <button
            onClick={() => {
              if (confirm(`Delete position "${row.labor_category}"?`)) {
                deletePosition(row.id);
              }
            }}
            className="text-slate-400 hover:text-red-400 transition-colors p-1"
            title="Delete position"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    });

    return cols;
  }, [totalYears, rates, updatePosition, deletePosition]);

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-900/30 rounded-lg border border-slate-800">
        <div className="text-center">
          <p className="text-slate-400 mb-2">No positions yet</p>
          <p className="text-sm text-slate-500">Click "Add Position" to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <DataGrid
        columns={columns}
        rows={positions}
        onRowsChange={handleRowsChange}
        rowKeyGetter={(row) => row.id}
        className="rdg-light"
        style={{ height: '100%' }}
        rowHeight={45}
      />
    </div>
  );
};

export default PositionsGrid;
