'use client';

import { useMemo } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';

interface GrandTotalSectionProps {
  grandTotal: {
    byYear: { [year: string]: number };
    total: number;
  };
  primeLaborByYear?: Record<string, number>;
  subLaborByYear?: Record<string, number>;
  passthroughByYear?: Record<string, number>;
  feeByYear?: Record<string, number>;
  odcByYear?: Record<string, number>;
  totalYears: number;
}

interface GrandTotalRow {
  id: string;
  label: string;
  type: 'prime' | 'sub' | 'passthrough' | 'fee' | 'odc' | 'total';
}

export const GrandTotalSection = ({
  grandTotal,
  primeLaborByYear = {},
  subLaborByYear = {},
  passthroughByYear = {},
  feeByYear = {},
  odcByYear = {},
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

  // Calculate totals for each category
  const totals = useMemo(() => {
    const primeTotal = Object.values(primeLaborByYear).reduce((sum, val) => sum + val, 0);
    const subTotal = Object.values(subLaborByYear).reduce((sum, val) => sum + val, 0);
    const passthroughTotal = Object.values(passthroughByYear).reduce((sum, val) => sum + val, 0);
    const feeTotal = Object.values(feeByYear).reduce((sum, val) => sum + val, 0);
    const odcTotal = Object.values(odcByYear).reduce((sum, val) => sum + val, 0);

    return { primeTotal, subTotal, passthroughTotal, feeTotal, odcTotal };
  }, [primeLaborByYear, subLaborByYear, passthroughByYear, feeByYear, odcByYear]);

  // Create breakdown rows
  const rows = useMemo<GrandTotalRow[]>(() => [
    { id: 'prime', label: 'Prime Labor (FBLR)', type: 'prime' },
    { id: 'sub', label: 'Subcontractor Labor', type: 'sub' },
    { id: 'passthrough', label: 'Passthrough (S&MH + G&A)', type: 'passthrough' },
    { id: 'fee', label: 'Fee (Profit)', type: 'fee' },
    { id: 'odc', label: 'ODCs (with S&MH)', type: 'odc' },
    { id: 'grand_total', label: 'Grand Total Contract Value', type: 'total' },
  ], []);

  // Generate columns dynamically
  const columns = useMemo<Column<GrandTotalRow>[]>(() => {
    const cols: Column<GrandTotalRow>[] = [
      // Label column
      {
        key: 'label',
        name: '',
        width: 300,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => {
          const colorClass = row.type === 'total'
            ? 'text-emerald-600 text-xl'
            : row.type === 'prime'
            ? 'text-emerald-600'
            : row.type === 'sub'
            ? 'text-purple-600'
            : row.type === 'passthrough'
            ? 'text-blue-600'
            : row.type === 'odc'
            ? 'text-orange-600'
            : 'text-amber-600';

          return (
            <div className="flex items-center h-full px-2">
              <span className={`font-semibold ${colorClass}`}>
                {row.label}
              </span>
            </div>
          );
        },
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
        renderCell: ({ row }) => {
          let value = 0;
          let bgClass = '';
          let textClass = '';

          switch (row.type) {
            case 'prime':
              value = primeLaborByYear[yearStr] || 0;
              bgClass = 'bg-emerald-50/50';
              textClass = 'text-emerald-600';
              break;
            case 'sub':
              value = subLaborByYear[yearStr] || 0;
              bgClass = 'bg-purple-50/50';
              textClass = 'text-purple-600';
              break;
            case 'passthrough':
              value = passthroughByYear[yearStr] || 0;
              bgClass = 'bg-blue-50/50';
              textClass = 'text-blue-600';
              break;
            case 'fee':
              value = feeByYear[yearStr] || 0;
              bgClass = 'bg-amber-50/50';
              textClass = 'text-amber-600';
              break;
            case 'odc':
              value = odcByYear[yearStr] || 0;
              bgClass = 'bg-orange-50/50';
              textClass = 'text-orange-600';
              break;
            case 'total':
              value = grandTotal.byYear[yearStr] || 0;
              bgClass = 'bg-emerald-100/50';
              textClass = 'text-emerald-600 font-bold text-lg';
              break;
          }

          return (
            <div className={`flex items-center justify-end h-full px-2 ${bgClass}`}>
              <span className={`font-semibold ${textClass}`}>
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
      name: 'Total',
      width: 200,
      resizable: true,
      frozen: true,
      renderCell: ({ row }) => {
        let value = 0;
        let bgClass = '';
        let textClass = '';

        switch (row.type) {
          case 'prime':
            value = totals.primeTotal;
            bgClass = 'bg-emerald-50';
            textClass = 'text-emerald-600 font-semibold';
            break;
          case 'sub':
            value = totals.subTotal;
            bgClass = 'bg-purple-50';
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'passthrough':
            value = totals.passthroughTotal;
            bgClass = 'bg-blue-50';
            textClass = 'text-blue-600 font-semibold';
            break;
          case 'fee':
            value = totals.feeTotal;
            bgClass = 'bg-amber-50';
            textClass = 'text-amber-600 font-semibold';
            break;
          case 'odc':
            value = totals.odcTotal;
            bgClass = 'bg-orange-50';
            textClass = 'text-orange-600 font-semibold';
            break;
          case 'total':
            value = grandTotal.total;
            bgClass = 'bg-emerald-100';
            textClass = 'text-emerald-600 font-bold text-2xl';
            break;
        }

        return (
          <div className={`flex items-center justify-end h-full px-2 ${bgClass}`}>
            <span className={textClass}>
              {formatCurrency(value)}
            </span>
          </div>
        );
      },
    });

    return cols;
  }, [totalYears, grandTotal, primeLaborByYear, subLaborByYear, passthroughByYear, feeByYear, odcByYear, totals]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6">
        <h3 className="text-base font-semibold text-foreground">Grand Total</h3>
        <p className="text-xs text-muted-foreground">
          Complete contract value breakdown
        </p>
      </div>
      <div className="h-[300px] overflow-auto border-2 border-emerald-100 rounded-lg shadow-lg shadow-emerald-50">
        <DataGrid
          columns={columns}
          rows={rows}
          rowKeyGetter={(row) => row.id}
          className={styles.excelGrid}
          style={{ height: '100%' }}
          rowHeight={55}
        />
      </div>
    </div>
  );
};

export default GrandTotalSection;
