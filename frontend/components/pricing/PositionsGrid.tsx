'use client';

import React, { useMemo, useCallback, useState } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { SpreadsheetPosition } from '@/types';
import { Trash2, MoreVertical } from 'lucide-react';
import { ContextMenu, ContextMenuItem } from '@/components/ui/ContextMenu';
import { ConvertToSubcontractorModal } from './ConvertToSubcontractorModal';
import { SalarySelectionModal } from './SalarySelectionModal';
import { getAvailablePercentiles } from '@/lib/utils/percentileHelpers';

export const PositionsGrid = () => {
  const { positions, totalYears, monthsPerYear, rates, escalationRates, updatePosition, deletePosition, advancedMode } = usePricingStore();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; position: SpreadsheetPosition; columnKey?: string } | null>(null);

  // Conversion modal state
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [positionToConvert, setPositionToConvert] = useState<SpreadsheetPosition | null>(null);

  // Salary selection modal state
  const [salaryModalOpen, setSalaryModalOpen] = useState(false);
  const [positionToEdit, setPositionToEdit] = useState<SpreadsheetPosition | null>(null);

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
    // Prioritize custom_salary, then percentile wage, then selected_wage, then 0
    const baseWage = position.custom_salary || position[`wage_${position.percentile}`] || position.selected_wage || 0;

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
  const getContextMenuItems = useCallback((position: SpreadsheetPosition, columnKey?: string): ContextMenuItem[] => {
    // Salary column context menu
    if (columnKey === 'salary') {
      const availablePercentiles = getAvailablePercentiles(position);
      const items: ContextMenuItem[] = [];

      // Add percentile options
      availablePercentiles.forEach((p) => {
        items.push({
          label: `${p.value} - $${p.wage.toLocaleString()}`,
          onClick: () => {
            updatePosition(position.id, {
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
    if (advancedMode) {
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
        if (confirm(`Delete position "${position.labor_category}"?`)) {
          deletePosition(position.id);
        }
      },
      danger: true,
    });

    return items;
  }, [deletePosition, updatePosition, advancedMode]);

  // Generate columns dynamically
  const columns = useMemo<Column<SpreadsheetPosition>[]>(() => {
    const cols: Column<SpreadsheetPosition>[] = [
      // Actions column - leftmost
      {
        key: 'actions',
        name: '',
        width: 50,
        resizable: false,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center justify-center h-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleContextMenu(e as any, row);
              }}
              className="p-1 hover:bg-gray-100 rounded"
              title="Actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        ),
      },
      // Labor Category - Editable
      {
        key: 'labor_category',
        name: 'Labor Category',
        width: 280, // Wider for better readability
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
            <span className="text-muted-foreground text-xs">{row.soc_code || '-'}</span>
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
            <span className="text-muted-foreground text-xs">{row.soc_title || '-'}</span>
          </div>
        ),
      },
      // Salary - Click to open modal
      {
        key: 'salary',
        name: 'Salary ($)',
        width: 200,
        resizable: true,
        renderCell: ({ row }) => {
          // Display custom salary if set, otherwise show percentile wage
          const displaySalary = row.custom_salary || row[`wage_${row.percentile}`] || row.selected_wage || 0;
          const isCustom = !!row.custom_salary;

          return (
            <div
              className="flex items-center justify-end h-full px-2 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => {
                setPositionToEdit(row);
                setSalaryModalOpen(true);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  position: row,
                  columnKey: 'salary',
                });
              }}
            >
              <div className="flex items-center gap-1">
                <span className={`font-mono text-sm ${isCustom ? 'text-blue-600 dark:text-blue-400 font-semibold' : ''}`}>
                  ${displaySalary.toLocaleString()}
                </span>
                {isCustom && (
                  <span className="text-[10px] text-blue-600 dark:text-blue-400">✎</span>
                )}
              </div>
            </div>
          );
        },
      },
    ];

    // Add year-based hours columns
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();

      // Get months for this year (default to 12)
      const months = monthsPerYear[yearStr] || 12;
      const monthLabel = months === 12 ? '' : ` (${months}mo)`;

      cols.push({
        key: `year${year}_hours`,
        name: year === 1 ? `Base Year\nHours${monthLabel}` : `Option ${year - 1}\nHours${monthLabel}`,
        width: 120,
        resizable: true,
        editable: true,
        renderEditCell: (props: RenderEditCellProps<SpreadsheetPosition>) => (
          <input
            type="number"
            className="w-full h-full px-2 bg-transparent text-foreground outline-none text-right font-mono"
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
            <span className="font-mono">
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
            <div className="flex items-center justify-end h-full px-2">
              <span className="text-muted-foreground font-mono text-xs">${calc.dlRate.toFixed(2)}</span>
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
            <div className="flex items-center justify-end h-full px-2">
              <span className="text-muted-foreground font-mono text-xs">${calc.fringe.toFixed(2)}</span>
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
            <div className="flex items-center justify-end h-full px-2">
              <span className="text-muted-foreground font-mono text-xs">${calc.oh.toFixed(2)}</span>
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
            <div className="flex items-center justify-end h-full px-2">
              <span className="text-muted-foreground font-mono text-xs">${calc.ga.toFixed(2)}</span>
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
            <div className="flex items-center justify-end h-full px-2">
              <span className="text-muted-foreground font-mono text-xs">${calc.fee.toFixed(2)}</span>
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
            <div className="flex items-center justify-end h-full px-2">
              <span className="text-emerald-600 font-bold font-mono">${calc.fblr.toFixed(2)}</span>
            </div>
          );
        },
      }
    );

    return cols;
  }, [totalYears, rates, updatePosition, deletePosition, handleContextMenu]);

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg border border-border">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">No positions yet</p>
          <p className="text-sm text-muted-foreground">Click "Add Position" to get started</p>
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
          className="rdg-light rdg-premium"
          style={{ height: '100%' }}
          rowHeight={52}
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
            updatePosition(positionToEdit.id, updates);
          }
        }}
      />
    </div>
  );
};

export default PositionsGrid;
