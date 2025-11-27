'use client';

import { useMemo } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';

interface GrandTotalSectionProps {
  grandTotal: {
    byYear: { [year: string]: number };
    total: number;
  };
  totalYears: number;
}

interface GrandTotalRow {
  id: string;
  label: string;
}

export const GrandTotalSection = ({
  grandTotal,
  totalYears,
}: GrandTotalSectionProps) => {
  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Create single grand total row
  const rows = useMemo<GrandTotalRow[]>(() => [
    { id: 'grand_total', label: 'Grand Total Contract Value' },
  ], []);

  // Generate columns dynamically
  const columns = useMemo<Column<GrandTotalRow>[]>(() => {
    const cols: Column<GrandTotalRow>[] = [
      // Label column
      {
        key: 'label',
        name: '',
        width: 250,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span className="font-bold text-xl text-emerald-400">
              {row.label}
            </span>
          </div>
        ),
      },
    ];

    // Add year-based columns
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      const label = year === 1 ? 'Base Period' : `Option Year ${year - 1}`;

      cols.push({
        key: `year${year}`,
        name: `${label}`,
        width: 150,
        resizable: true,
        renderCell: () => {
          const value = grandTotal.byYear[yearStr] || 0;

          return (
            <div className="flex items-center justify-end h-full px-2 bg-emerald-500/20">
              <span className="text-emerald-400 font-bold text-lg">
                {formatCurrency(value)}
              </span>
            </div>
          );
        },
      });
    }

    // Total column
    cols.push({
      key: 'total',
      name: 'Total Contract Value',
      width: 200,
      resizable: true,
      frozen: true,
      renderCell: () => {
        return (
          <div className="flex items-center justify-end h-full px-2 bg-emerald-500/30">
            <span className="text-emerald-400 font-bold text-2xl">
              {formatCurrency(grandTotal.total)}
            </span>
          </div>
        );
      },
    });

    return cols;
  }, [totalYears, grandTotal]);

  return (
    <div className="space-y-4">
      <div className="h-[80px] overflow-auto border-2 border-emerald-500/30 rounded-lg shadow-lg shadow-emerald-500/20">
        <DataGrid
          columns={columns}
          rows={rows}
          rowKeyGetter={(row) => row.id}
          className="rdg-light"
          style={{ height: '100%' }}
          rowHeight={80}
        />
      </div>
    </div>
  );
};

export default GrandTotalSection;
