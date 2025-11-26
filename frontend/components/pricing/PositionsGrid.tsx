'use client';

import { useMemo } from 'react';
import DataGrid, { Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { SpreadsheetPosition } from '@/types';
import { Trash2 } from 'lucide-react';

export const PositionsGrid = () => {
  const { positions, totalYears, updatePosition, deletePosition } = usePricingStore();

  // Generate columns dynamically based on total years
  const columns = useMemo<Column<SpreadsheetPosition>[]>(() => {
    const cols: Column<SpreadsheetPosition>[] = [
      {
        key: 'labor_category',
        name: 'Labor Category',
        width: 200,
        resizable: true,
        editor: (props) => (
          <input
            className="w-full h-full px-2 bg-slate-950 text-slate-50 outline-none"
            value={props.row.labor_category}
            onChange={(e) =>
              updatePosition(props.row.id, { labor_category: e.target.value })
            }
            autoFocus
          />
        ),
      },
      {
        key: 'soc_code',
        name: 'SOC Code',
        width: 120,
        resizable: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span className="text-slate-400 text-xs">{row.soc_code || '-'}</span>
          </div>
        ),
      },
      {
        key: 'percentile',
        name: 'Percentile',
        width: 120,
        resizable: true,
        editor: (props) => (
          <select
            className="w-full h-full px-2 bg-slate-950 text-slate-50 outline-none"
            value={props.row.percentile}
            onChange={(e) =>
              updatePosition(props.row.id, {
                percentile: e.target.value as SpreadsheetPosition['percentile'],
              })
            }
            autoFocus
          >
            <option value="10th">10th</option>
            <option value="25th">25th</option>
            <option value="50th">50th</option>
            <option value="75th">75th</option>
            <option value="90th">90th</option>
          </select>
        ),
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span>{row.percentile}</span>
          </div>
        ),
      },
    ];

    // Add year columns dynamically
    for (let year = 1; year <= totalYears; year++) {
      // Hours column
      cols.push({
        key: `year${year}_hours`,
        name: year === 1 ? `Base Year\nHours` : `Option ${year - 1}\nHours`,
        width: 120,
        resizable: true,
        editor: (props) => (
          <input
            type="number"
            className="w-full h-full px-2 bg-slate-950 text-slate-50 outline-none"
            value={props.row.hours_per_year[year.toString()] || 0}
            onChange={(e) => {
              const newHours = { ...props.row.hours_per_year };
              newHours[year.toString()] = parseFloat(e.target.value) || 0;
              updatePosition(props.row.id, { hours_per_year: newHours });
            }}
            autoFocus
          />
        ),
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2">
            <span>
              {(row.hours_per_year[year.toString()] || 0).toLocaleString('en-US')}
            </span>
          </div>
        ),
      });

      // Amount column (calculated, read-only)
      cols.push({
        key: `year${year}_amount`,
        name: year === 1 ? `Base Year\nAmount` : `Option ${year - 1}\nAmount`,
        width: 140,
        resizable: true,
        renderCell: ({ row }) => {
          const yearData = row.yearly_amounts?.find((y) => y.year === year);
          return (
            <div className="flex items-center justify-end h-full px-2 bg-slate-900/50">
              <span className="text-emerald-400 font-semibold">
                ${(yearData?.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </div>
          );
        },
      });
    }

    // Total amount column
    cols.push({
      key: 'total_amount',
      name: 'Total Amount',
      width: 160,
      resizable: true,
      frozen: true,
      renderCell: ({ row }) => (
        <div className="flex items-center justify-end h-full px-2 bg-slate-900/70">
          <span className="text-emerald-400 font-bold text-sm">
            ${(row.total_amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        </div>
      ),
    });

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
            className="text-slate-400 hover:text-red-400 transition-colors"
            title="Delete position"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    });

    return cols;
  }, [totalYears, updatePosition, deletePosition]);

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-900/30 rounded-lg border border-slate-800">
        <div className="text-center">
          <p className="text-slate-400 mb-2">No positions yet</p>
          <p className="text-sm text-slate-500">Add a position to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <DataGrid
        columns={columns}
        rows={positions}
        rowKeyGetter={(row) => row.id}
        className="rdg-light fill-grid"
        style={{ height: '100%' }}
        rowHeight={40}
      />
    </div>
  );
};

export default PositionsGrid;
