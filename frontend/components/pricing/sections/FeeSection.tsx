'use client';

import { useMemo } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import type { Extension } from '@/types';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';
import { useChatPanelOffset } from '@/lib/hooks/useChatPanelOffset';

interface FeeSectionProps {
  primeLaborByYear: Record<string, number>;
  subLaborByYear: Record<string, number>;
  feeRates: { prime_labor: number; sub_labor: number };
  totalYears: number;
  extensions?: Extension[];
}

interface FeeRow {
  id: string;
  label: string;
  type: 'prime_fee' | 'sub_fee' | 'total';
  rate: number;
}

export const FeeSection = ({
  primeLaborByYear,
  subLaborByYear,
  feeRates,
  totalYears,
  extensions = [],
}: FeeSectionProps) => {
  const { pick: W } = useChatPanelOffset();

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  // Calculate fee costs by year
  const feeByYear = useMemo(() => {
    const result: Record<string, { primeFee: number; subFee: number; total: number }> = {};

    // Get all years
    const allYears = new Set([
      ...Object.keys(primeLaborByYear),
      ...Object.keys(subLaborByYear),
    ]);

    allYears.forEach((year) => {
      const primeCost = primeLaborByYear[year] || 0;
      const subCost = subLaborByYear[year] || 0;

      const primeFee = primeCost * feeRates.prime_labor;
      const subFee = subCost * feeRates.sub_labor;

      result[year] = {
        primeFee,
        subFee,
        total: primeFee + subFee,
      };
    });

    return result;
  }, [primeLaborByYear, subLaborByYear, feeRates]);

  // Calculate totals
  const totals = useMemo(() => {
    let primeFeeTotal = 0;
    let subFeeTotal = 0;

    Object.values(feeByYear).forEach(({ primeFee, subFee }) => {
      primeFeeTotal += primeFee;
      subFeeTotal += subFee;
    });

    return {
      primeFee: primeFeeTotal,
      subFee: subFeeTotal,
      total: primeFeeTotal + subFeeTotal,
    };
  }, [feeByYear]);

  // Create fee rows
  const rows = useMemo<FeeRow[]>(() => [
    {
      id: 'prime_fee',
      label: 'Prime Contractor Fee for Prime Labor',
      type: 'prime_fee',
      rate: feeRates.prime_labor,
    },
    {
      id: 'sub_fee',
      label: 'Prime Contractor Fee for Subcontractor Labor',
      type: 'sub_fee',
      rate: feeRates.sub_labor,
    },
    {
      id: 'total',
      label: 'Total Fee (for Prime and Subcontractor Labor)',
      type: 'total',
      rate: 0, // Not applicable for total row
    },
  ], [feeRates]);

  // Generate columns dynamically
  const columns = useMemo<Column<FeeRow>[]>(() => {
    const cols: Column<FeeRow>[] = [
      // Label column
      {
        key: 'label',
        name: 'Fee Category',
        width: W(320, 150),
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span className={`font-semibold whitespace-normal break-words overflow-wrap ${row.type === 'total' ? 'text-emerald-600' : 'text-foreground'}`}>
              {row.label}
            </span>
          </div>
        ),
      },
      // Rate column
      {
        key: 'rate',
        name: 'Rate',
        width: 100,
        resizable: true,
        renderCell: ({ row }) => (
          <div className="flex items-center justify-center h-full px-2">
            {row.type !== 'total' && (
              <span className="text-xs text-muted-foreground">
                {formatPercentage(row.rate)}
              </span>
            )}
          </div>
        ),
      },
    ];

    // Add year-based columns (including extensions)
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();

      // Check if this year is an extension
      const extension = extensions.find(ext => ext.year === year);
      const label = extension
        ? extension.label
        : (year === 1 ? 'Base Period' : `Option Year ${year - 1}`);

      cols.push({
        key: `year${year}`,
        name: `${label}\nAmount ($)`,
        width: 150,
        resizable: true,
        renderCell: ({ row }) => {
          const yearData = feeByYear[yearStr];
          if (!yearData) return <div className="h-full" />;

          let value = 0;
          switch (row.type) {
            case 'prime_fee':
              value = yearData.primeFee;
              break;
            case 'sub_fee':
              value = yearData.subFee;
              break;
            case 'total':
              value = yearData.total;
              break;
          }

          return (
            <div className={`flex items-center justify-end h-full px-2 ${row.type === 'total' ? 'bg-emerald-500/10' : ''}`}>
              <span className={row.type === 'total' ? 'text-emerald-600 font-bold' : 'text-amber-600 font-semibold'}>
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
      name: 'Total Amount ($)',
      width: W(180, 120),
      resizable: true,
      frozen: true,
      renderCell: ({ row }) => {
        let value = 0;
        switch (row.type) {
          case 'prime_fee':
            value = totals.primeFee;
            break;
          case 'sub_fee':
            value = totals.subFee;
            break;
          case 'total':
            value = totals.total;
            break;
        }

        return (
          <div className={`flex items-center justify-end h-full px-2 ${row.type === 'total' ? 'bg-emerald-500/10' : ''}`}>
            <span className={row.type === 'total' ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-medium'}>
              {formatCurrency(value)}
            </span>
          </div>
        );
      },
    });

    return cols;
  }, [totalYears, extensions, feeByYear, totals, W]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6">
        <h3 className="text-base font-semibold text-foreground">Fixed Fee (Profit)</h3>
        <p className="text-xs text-muted-foreground">
          Separate fee rates for prime and subcontractor labor
        </p>
      </div>

      <div className="h-[200px] overflow-auto border border-border rounded-lg">
        <DataGrid
          columns={columns}
          rows={rows}
          rowKeyGetter={(row) => row.id}
          className={styles.excelGrid}
          style={{ height: '100%' }}
          rowHeight={50}
        />
      </div>
    </div>
  );
};

export default FeeSection;
