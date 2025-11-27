'use client';

import { useMemo, useCallback, useState } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { SpreadsheetPosition } from '@/types';
import { Trash2, MoreVertical } from 'lucide-react';
import { ContextMenu, ContextMenuItem } from '@/components/ui/ContextMenu';
import { ConvertToSubcontractorModal } from './ConvertToSubcontractorModal';

export const PositionsGrid = () => {
  const { positions, totalYears, rates, escalationRates, updatePosition, deletePosition } = usePricingStore();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; position: SpreadsheetPosition } | null>(null);

  // Conversion modal state
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [positionToConvert, setPositionToConvert] = useState<SpreadsheetPosition | null>(null);

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

  // Calculate averaged FBLR for a position across all contract years with escalation
  const calculateFBLR = (position: SpreadsheetPosition) => {
    const baseWage = position[`wage_${position.percentile}`] || 0;

    if (baseWage === 0 || totalYears === 0) {
      return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0 };
    }

    // Calculate escalated salary for each year
    let totalSalary = 0;
    let totalHours = 0;
    let currentYearWage = baseWage;

    // Get FTE hours for this position (fallback to 1880)
    const fteHours = position.standard_fte_hours || 1880;

    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      const hoursThisYear = position.hours_per_year[yearStr] || 0;

      // Calculate proportional salary for this year (ONLY if there are hours)
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

  // Handle right-click on grid rows (MOVED BEFORE useMemo)
  const handleContextMenu = useCallback((e: React.MouseEvent, position: SpreadsheetPosition) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      position,
    });
  }, []);

  // Context menu items
  const getContextMenuItems = useCallback((position: SpreadsheetPosition): ContextMenuItem[] => [
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
          deletePosition(position.id);
        }
      },
      danger: true,
    },
  ], [deletePosition]);

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

    // Calculated columns (FBLR breakdown - averaged across all years)
    cols.push(
      {
        key: 'dl_rate',
        name: 'Averaged\nDL Rate ($/hr)',
        width: 130,
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
        name: 'Averaged\nFringe ($/hr)',
        width: 130,
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
        name: 'Averaged\nOH ($/hr)',
        width: 120,
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
        name: 'Averaged\nG&A ($/hr)',
        width: 120,
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
        name: 'Averaged\nFee ($/hr)',
        width: 120,
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
        name: 'Averaged\nFull Burdened Rate ($/hr)',
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
      <div
        onContextMenu={(e) => {
          // Find which row was clicked
          const target = e.target as HTMLElement;
          const rowElement = target.closest('[role="row"]');
          if (rowElement) {
            const rowIndex = Array.from(rowElement.parentElement?.children || []).indexOf(rowElement) - 1; // Subtract 1 for header row
            if (rowIndex >= 0 && rowIndex < positions.length) {
              handleContextMenu(e, positions[rowIndex]);
            }
          }
        }}
      >
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

export default PositionsGrid;
