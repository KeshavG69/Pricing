'use client';

import { useMemo } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';
import type { Extension } from '@/types';

interface CombinedLaborTotalsSectionProps {
  primeHoursByYear: Record<string, number>;
  subHoursByYear: Record<string, number>;
  primeLaborByYear: Record<string, number>;
  otCostsByYear: Record<string, number>;
  subLaborByYear: Record<string, number>;
  passthroughByYear: Record<string, number>;
  feeByYear: Record<string, number>;
  totalYears: number;
  extensions?: Extension[];
}

interface CombinedRow {
  id: string;
  label: string;
  type: 'prime_hours' | 'sub_hours' | 'total_hours' | 'separator' |
        'prime_labor' | 'ot_cost' | 'sub_labor' | 'passthrough' | 'fee' | 'total_labor';
}

export const CombinedLaborTotalsSection = ({
  primeHoursByYear,
  subHoursByYear,
  primeLaborByYear,
  otCostsByYear,
  subLaborByYear,
  passthroughByYear,
  feeByYear,
  totalYears,
  extensions = [],
}: CombinedLaborTotalsSectionProps) => {
  // Format number with commas
  const formatNumber = (value: number) => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
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

  // Calculate totals
  const totals = useMemo(() => {
    const primeHoursTotal = Object.values(primeHoursByYear).reduce((sum, val) => sum + val, 0);
    const subHoursTotal = Object.values(subHoursByYear).reduce((sum, val) => sum + val, 0);
    const primeLaborTotal = Object.values(primeLaborByYear).reduce((sum, val) => sum + val, 0);
    const otCostTotal = Object.values(otCostsByYear).reduce((sum, val) => sum + val, 0);
    const subLaborTotal = Object.values(subLaborByYear).reduce((sum, val) => sum + val, 0);
    const passthroughTotal = Object.values(passthroughByYear).reduce((sum, val) => sum + val, 0);
    const feeTotal = Object.values(feeByYear).reduce((sum, val) => sum + val, 0);

    return {
      primeHoursTotal,
      subHoursTotal,
      primeLaborTotal,
      otCostTotal,
      subLaborTotal,
      passthroughTotal,
      feeTotal
    };
  }, [primeHoursByYear, subHoursByYear, primeLaborByYear, otCostsByYear, subLaborByYear, passthroughByYear, feeByYear]);

  // Create breakdown rows
  const rows = useMemo<CombinedRow[]>(() => [
    { id: 'prime_hours', label: 'Prime Hours', type: 'prime_hours' },
    { id: 'sub_hours', label: 'Subcontractor Hours', type: 'sub_hours' },
    { id: 'total_hours', label: 'Total Hours', type: 'total_hours' },
    { id: 'separator1', label: '', type: 'separator' }, // Visual separator
    { id: 'prime_labor', label: 'Prime Labor (with FBLR)', type: 'prime_labor' },
    { id: 'ot_cost', label: 'Overtime Cost', type: 'ot_cost' },
    { id: 'sub_labor', label: 'Subcontractor Labor (Base)', type: 'sub_labor' },
    { id: 'passthrough', label: 'Passthrough (S&MH + G&A)', type: 'passthrough' },
    { id: 'fee', label: 'Fee (Prime + Sub)', type: 'fee' },
    { id: 'total_labor', label: 'Total Labor Cost', type: 'total_labor' },
  ], []);

  // Generate columns dynamically
  const columns = useMemo<Column<CombinedRow>[]>(() => {
    const cols: Column<CombinedRow>[] = [
      // Label column
      {
        key: 'label',
        name: '',
        width: 350,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => {
          if (row.type === 'separator') {
            return <div className="h-full border-t-2 border-border" />;
          }

          const isTotal = row.type === 'total_hours' || row.type === 'total_labor';
          const isHours = row.type.includes('hours');

          return (
            <div className="flex items-center h-full px-2">
              <span className={`font-semibold whitespace-normal break-words overflow-wrap ${
                isTotal ? 'text-emerald-600 text-base' :
                isHours ? 'text-blue-600' : 'text-purple-600'
              }`}>
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

      // Check if this year is an extension
      const extension = extensions.find(ext => ext.year === year);
      const label = extension
        ? extension.label
        : (year === 1 ? 'Base Period' : `Option Year ${year - 1}`);

      cols.push({
        key: `year${year}`,
        name: `${label}`,
        width: 180,
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'separator') {
            return <div className="h-full border-t-2 border-border" />;
          }

          let value = 0;
          let bgClass = '';
          let textClass = '';
          let isHoursValue = false;

          switch (row.type) {
            case 'prime_hours':
              value = primeHoursByYear[yearStr] || 0;
              bgClass = 'bg-blue-50/50';
              textClass = 'text-blue-600';
              isHoursValue = true;
              break;
            case 'sub_hours':
              value = subHoursByYear[yearStr] || 0;
              bgClass = 'bg-blue-50/50';
              textClass = 'text-blue-600';
              isHoursValue = true;
              break;
            case 'total_hours':
              value = (primeHoursByYear[yearStr] || 0) + (subHoursByYear[yearStr] || 0);
              bgClass = 'bg-emerald-50';
              textClass = 'text-emerald-600 font-bold';
              isHoursValue = true;
              break;
            case 'prime_labor':
              value = primeLaborByYear[yearStr] || 0;
              bgClass = 'bg-purple-50/50';
              textClass = 'text-purple-600';
              break;
            case 'ot_cost':
              value = otCostsByYear[yearStr] || 0;
              bgClass = 'bg-purple-50/50';
              textClass = 'text-purple-600';
              break;
            case 'sub_labor':
              value = subLaborByYear[yearStr] || 0;
              bgClass = 'bg-purple-50/50';
              textClass = 'text-purple-600';
              break;
            case 'passthrough':
              value = passthroughByYear[yearStr] || 0;
              bgClass = 'bg-purple-50/50';
              textClass = 'text-purple-600';
              break;
            case 'fee':
              value = feeByYear[yearStr] || 0;
              bgClass = 'bg-purple-50/50';
              textClass = 'text-purple-600';
              break;
            case 'total_labor':
              value = (primeLaborByYear[yearStr] || 0) +
                     (otCostsByYear[yearStr] || 0) +
                     (subLaborByYear[yearStr] || 0) +
                     (passthroughByYear[yearStr] || 0) +
                     (feeByYear[yearStr] || 0);
              bgClass = 'bg-emerald-100';
              textClass = 'text-emerald-600 font-bold text-lg';
              break;
          }

          return (
            <div className={`flex items-center justify-end h-full px-2 ${bgClass}`}>
              <span className={`font-semibold ${textClass}`}>
                {isHoursValue ? formatNumber(value) : formatCurrency(value)}
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
      width: 220,
      resizable: true,
      frozen: true,
      renderCell: ({ row }) => {
        if (row.type === 'separator') {
          return <div className="h-full border-t-2 border-border" />;
        }

        let value = 0;
        let bgClass = '';
        let textClass = '';
        let isHoursValue = false;

        switch (row.type) {
          case 'prime_hours':
            value = totals.primeHoursTotal;
            bgClass = 'bg-blue-50';
            textClass = 'text-blue-600 font-semibold';
            isHoursValue = true;
            break;
          case 'sub_hours':
            value = totals.subHoursTotal;
            bgClass = 'bg-blue-50';
            textClass = 'text-blue-600 font-semibold';
            isHoursValue = true;
            break;
          case 'total_hours':
            value = totals.primeHoursTotal + totals.subHoursTotal;
            bgClass = 'bg-emerald-100';
            textClass = 'text-emerald-600 font-bold text-xl';
            isHoursValue = true;
            break;
          case 'prime_labor':
            value = totals.primeLaborTotal;
            bgClass = 'bg-purple-50';
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'ot_cost':
            value = totals.otCostTotal;
            bgClass = 'bg-purple-50';
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'sub_labor':
            value = totals.subLaborTotal;
            bgClass = 'bg-purple-50';
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'passthrough':
            value = totals.passthroughTotal;
            bgClass = 'bg-purple-50';
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'fee':
            value = totals.feeTotal;
            bgClass = 'bg-purple-50';
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'total_labor':
            value = totals.primeLaborTotal + totals.otCostTotal + totals.subLaborTotal +
                   totals.passthroughTotal + totals.feeTotal;
            bgClass = 'bg-emerald-100';
            textClass = 'text-emerald-600 font-bold text-2xl';
            break;
        }

        return (
          <div className={`flex items-center justify-end h-full px-2 ${bgClass}`}>
            <span className={textClass}>
              {isHoursValue ? formatNumber(value) : formatCurrency(value)}
            </span>
          </div>
        );
      },
    });

    return cols;
  }, [totalYears, extensions, primeHoursByYear, subHoursByYear, primeLaborByYear, otCostsByYear,
      subLaborByYear, passthroughByYear, feeByYear, totals, formatNumber, formatCurrency]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6">
        <h3 className="text-base font-semibold text-foreground">
          Combined Labor Totals
        </h3>
        <p className="text-xs text-muted-foreground">
          Prime and subcontractor hours and costs
        </p>
      </div>
      <div className="h-auto min-h-[400px] overflow-auto border-2 border-emerald-100 rounded-lg shadow-lg shadow-emerald-50">
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

export default CombinedLaborTotalsSection;
