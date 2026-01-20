'use client';

import { useMemo } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import { SurgeOption } from '@/types';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';

interface SurgeSectionProps {
  surge: SurgeOption | null;
  totalYears: number;
  baseLaborCostByYear: Record<string, number>; // Base prime labor cost per year (for calculating surge)
  surgeMultiplier: number; // Surge pricing multiplier (e.g., 1.15 for 15% premium)
  onUpdatePercentage: (percentage: number | null) => void;
}

interface SurgeRow {
  id: string;
  description: string;
  amountsByYear: Record<string, number>;
  type: 'base' | 'surge' | 'total';
}

export const SurgeSection = ({
  surge,
  totalYears,
  baseLaborCostByYear,
  surgeMultiplier,
  onUpdatePercentage,
}: SurgeSectionProps) => {
  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Calculate surge amounts by year (base × percentage × multiplier)
  const surgeAmountsByYear = useMemo(() => {
    const result: Record<string, number> = {};
    if (!surge || !surge.percentage) {
      for (let year = 1; year <= totalYears; year++) {
        result[year.toString()] = 0;
      }
      return result;
    }

    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      const baseCost = baseLaborCostByYear[yearStr] || 0;
      result[yearStr] = baseCost * surge.percentage * surgeMultiplier;
    }

    return result;
  }, [surge, baseLaborCostByYear, surgeMultiplier, totalYears]);

  // Calculate total with surge by year
  const totalWithSurgeByYear = useMemo(() => {
    const result: Record<string, number> = {};
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      result[yearStr] = (baseLaborCostByYear[yearStr] || 0) + (surgeAmountsByYear[yearStr] || 0);
    }
    return result;
  }, [baseLaborCostByYear, surgeAmountsByYear, totalYears]);

  // Calculate grand totals
  const baseGrandTotal = useMemo(() => {
    return Object.values(baseLaborCostByYear).reduce((sum, val) => sum + val, 0);
  }, [baseLaborCostByYear]);

  const surgeGrandTotal = useMemo(() => {
    return Object.values(surgeAmountsByYear).reduce((sum, val) => sum + val, 0);
  }, [surgeAmountsByYear]);

  const grandTotal = useMemo(() => {
    return baseGrandTotal + surgeGrandTotal;
  }, [baseGrandTotal, surgeGrandTotal]);

  // Create rows
  const rows = useMemo<SurgeRow[]>(() => {
    const result: SurgeRow[] = [];

    // Base labor cost row
    result.push({
      id: 'base',
      description: 'Base Prime Labor Cost',
      amountsByYear: baseLaborCostByYear,
      type: 'base',
    });

    // Surge row
    const surgePercentageLabel = surge?.percentage
      ? `${(surge.percentage * 100).toFixed(1)}%`
      : '0%';
    const surgeMultiplierLabel = `${((surgeMultiplier - 1) * 100).toFixed(1)}%`;
    result.push({
      id: 'surge',
      description: `Surge Option (${surgePercentageLabel} × ${surgeMultiplierLabel} premium)`,
      amountsByYear: surgeAmountsByYear,
      type: 'surge',
    });

    // Total row
    result.push({
      id: 'total',
      description: 'Total with Surge',
      amountsByYear: totalWithSurgeByYear,
      type: 'total',
    });

    return result;
  }, [baseLaborCostByYear, surgeAmountsByYear, totalWithSurgeByYear, surge, surgeMultiplier]);

  // Define columns
  const columns = useMemo<Column<SurgeRow>[]>(() => {
    const cols: Column<SurgeRow>[] = [];

    // Description column
    cols.push({
      key: 'description',
      name: 'Description',
      width: 300,
      frozen: true,
      resizable: true,
      renderCell: ({ row }) => {
        const textColor = row.type === 'total' ? 'text-blue-700' : 'text-foreground';
        const fontWeight = row.type === 'total' || row.type === 'surge' ? 'font-bold' : 'font-medium';
        const bgColor = row.type === 'total' ? 'bg-blue-50 border-t-2 border-blue-200' : '';

        return (
          <div className={`flex items-center h-full px-3 ${bgColor}`}>
            <span className={`${textColor} ${fontWeight}`}>
              {row.description}
            </span>
          </div>
        );
      },
    });

    // Year columns
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      const label = year === 1 ? 'Base Year' : `Option Year ${year - 1}`;

      cols.push({
        key: `year${year}`,
        name: `${label}\nAmount ($)`,
        width: 140,
        resizable: true,
        renderCell: ({ row }) => {
          const amount = row.amountsByYear[yearStr] || 0;
          const textColor = row.type === 'total' ? 'text-blue-700' : row.type === 'surge' ? 'text-green-700' : 'text-foreground';
          const fontWeight = row.type === 'total' || row.type === 'surge' ? 'font-bold' : 'font-medium';
          const bgColor = row.type === 'total' ? 'bg-blue-50 border-t-2 border-blue-200' : '';

          return (
            <div className={`flex items-center justify-end h-full px-3 ${bgColor}`}>
              <span className={`${textColor} ${fontWeight}`}>
                {formatCurrency(amount)}
              </span>
            </div>
          );
        },
      });
    }

    // Grand Total column
    cols.push({
      key: 'grandTotal',
      name: 'Grand Total ($)',
      width: 140,
      frozen: true,
      resizable: true,
      renderCell: ({ row }) => {
        let total = 0;
        if (row.id === 'base') total = baseGrandTotal;
        else if (row.id === 'surge') total = surgeGrandTotal;
        else if (row.id === 'total') total = grandTotal;

        const textColor = row.type === 'total' ? 'text-blue-700' : row.type === 'surge' ? 'text-green-700' : 'text-foreground';
        const fontWeight = row.type === 'total' || row.type === 'surge' ? 'font-bold' : 'font-medium';
        const bgColor = row.type === 'total' ? 'bg-blue-50 border-t-2 border-blue-200' : '';

        return (
          <div className={`flex items-center justify-end h-full px-3 ${bgColor}`}>
            <span className={`${textColor} ${fontWeight}`}>
              {formatCurrency(total)}
            </span>
          </div>
        );
      },
    });

    return cols;
  }, [totalYears, baseGrandTotal, surgeGrandTotal, grandTotal]);

  // If no surge option, show message
  if (!surge || !surge.percentage) {
    return (
      <div className="p-8 text-center">
        <div className="text-muted-foreground">
          <p className="font-medium mb-2">No Surge Option</p>
          <p className="text-sm">This proposal does not include a surge option.</p>
          <p className="text-sm text-muted-foreground/70 mt-2">
            {surge?.description || 'Surge capacity allows the government to increase contract scope by a specified percentage.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Surge Description */}
      {surge.description && (
        <div className="bg-muted/30 border border-border rounded-md p-4">
          <p className="text-sm font-medium text-foreground mb-1">Surge Option Details:</p>
          <p className="text-sm text-muted-foreground">{surge.description}</p>
        </div>
      )}

      {/* Surge Table */}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKeyGetter={(row) => row.id}
        className={styles.dataGrid}
        style={{ height: 'auto', minHeight: '150px' }}
        rowHeight={40}
      />

      {/* Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm font-medium text-blue-900">Surge Capacity Summary</p>
            <p className="text-xs text-blue-700 mt-1">
              Base Cost: {formatCurrency(baseGrandTotal)} × {((surge.percentage || 0) * 100).toFixed(1)}% × {((surgeMultiplier - 1) * 100).toFixed(1)}% premium
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-blue-700 uppercase font-medium">Surge Amount</p>
            <p className="text-2xl font-bold text-blue-900">{formatCurrency(surgeGrandTotal)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
