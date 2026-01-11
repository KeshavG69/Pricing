'use client';

import { useMemo } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';
import { Aggregates, Extension } from '@/types';

interface PrimeLaborAggregatesSectionProps {
  aggregates: Aggregates;
  totalYears: number;
  extensions?: Extension[];
  subLaborByYear?: Record<string, number>;
  passthroughByYear?: Record<string, number>;
  subFeeByYear?: Record<string, number>;
}

interface AggregateRow {
  id: string;
  label: string;
  type: 'dl' | 'fringe' | 'oh' | 'ga' | 'fee' | 'fblr' | 'separator' |
        'sub_labor' | 'passthrough' | 'sub_fee' | 'sub_total' | 'grand_total';
}

export const PrimeLaborAggregatesSection = ({
  aggregates,
  totalYears,
  extensions = [],
  subLaborByYear = {},
  passthroughByYear = {},
  subFeeByYear = {},
}: PrimeLaborAggregatesSectionProps) => {
  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Calculate subcontractor totals
  const subTotals = useMemo(() => {
    const subLaborTotal = Object.values(subLaborByYear).reduce((sum, val) => sum + val, 0);
    const passthroughTotal = Object.values(passthroughByYear).reduce((sum, val) => sum + val, 0);
    const subFeeTotal = Object.values(subFeeByYear).reduce((sum, val) => sum + val, 0);
    const subContractorTotal = subLaborTotal + passthroughTotal + subFeeTotal;
    const grandTotal = aggregates.totalFBLR + subContractorTotal;

    return {
      subLaborTotal,
      passthroughTotal,
      subFeeTotal,
      subContractorTotal,
      grandTotal,
    };
  }, [subLaborByYear, passthroughByYear, subFeeByYear, aggregates.totalFBLR]);

  // Create aggregate rows
  const rows = useMemo<AggregateRow[]>(() => [
    { id: 'dl', label: 'Total Direct Labor (Prime)', type: 'dl' },
    { id: 'fringe', label: 'Total Fringe (Prime)', type: 'fringe' },
    { id: 'oh', label: 'Total Overhead (Prime)', type: 'oh' },
    { id: 'ga', label: 'Total G&A (Prime)', type: 'ga' },
    { id: 'fee', label: 'Total Prime Fee', type: 'fee' },
    { id: 'fblr', label: 'Total Prime Labor (FBLR)', type: 'fblr' },
    { id: 'separator1', label: '', type: 'separator' },
    { id: 'sub_labor', label: 'Total Subcontractor Labor (Base)', type: 'sub_labor' },
    { id: 'passthrough', label: 'Total Passthrough (S&MH + G&A)', type: 'passthrough' },
    { id: 'sub_fee', label: 'Total Subcontractor Fee', type: 'sub_fee' },
    { id: 'sub_total', label: 'Total Subcontractor Labor (with costs)', type: 'sub_total' },
    { id: 'separator2', label: '', type: 'separator' },
    { id: 'grand_total', label: 'Grand Total Labor', type: 'grand_total' },
  ], []);

  // Generate columns dynamically
  const columns = useMemo<Column<AggregateRow>[]>(() => {
    const cols: Column<AggregateRow>[] = [
      // Label column
      {
        key: 'label',
        name: 'Cost Category',
        width: 320,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => {
          if (row.type === 'separator') {
            return <div className="h-full border-t-2 border-border" />;
          }

          const isHighlight = row.type === 'fblr' || row.type === 'sub_total' || row.type === 'grand_total';
          const isSub = row.type === 'sub_labor' || row.type === 'passthrough' || row.type === 'sub_fee' || row.type === 'sub_total';
          const isGrandTotal = row.type === 'grand_total';

          return (
            <div className="flex items-center h-full px-2">
              <span className={`font-semibold whitespace-normal break-words overflow-wrap ${
                isGrandTotal ? 'text-blue-600 text-base' :
                isHighlight ? 'text-emerald-600' :
                isSub ? 'text-orange-600' :
                'text-foreground'
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
        name: `${label}\nAmount ($)`,
        width: 150,
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'separator') {
            return <div className="h-full border-t-2 border-border" />;
          }

          const yearData = aggregates.byYear[yearStr];

          let value = 0;
          let bgClass = '';
          let textClass = '';

          switch (row.type) {
            case 'dl':
              value = yearData?.dl || 0;
              textClass = 'text-purple-600 font-semibold';
              break;
            case 'fringe':
              value = yearData?.fringe || 0;
              textClass = 'text-purple-600 font-semibold';
              break;
            case 'oh':
              value = yearData?.oh || 0;
              textClass = 'text-purple-600 font-semibold';
              break;
            case 'ga':
              value = yearData?.ga || 0;
              textClass = 'text-purple-600 font-semibold';
              break;
            case 'fee':
              value = yearData?.fee || 0;
              textClass = 'text-purple-600 font-semibold';
              break;
            case 'fblr':
              value = yearData?.totalAmount || 0;
              bgClass = 'bg-emerald-50';
              textClass = 'text-emerald-600 font-bold';
              break;
            case 'sub_labor':
              value = subLaborByYear[yearStr] || 0;
              textClass = 'text-orange-600 font-semibold';
              break;
            case 'passthrough':
              value = passthroughByYear[yearStr] || 0;
              textClass = 'text-orange-600 font-semibold';
              break;
            case 'sub_fee':
              value = subFeeByYear[yearStr] || 0;
              textClass = 'text-orange-600 font-semibold';
              break;
            case 'sub_total':
              value = (subLaborByYear[yearStr] || 0) + (passthroughByYear[yearStr] || 0) + (subFeeByYear[yearStr] || 0);
              bgClass = 'bg-emerald-50';
              textClass = 'text-emerald-600 font-bold';
              break;
            case 'grand_total':
              value = (yearData?.totalAmount || 0) +
                     (subLaborByYear[yearStr] || 0) +
                     (passthroughByYear[yearStr] || 0) +
                     (subFeeByYear[yearStr] || 0);
              bgClass = 'bg-blue-100';
              textClass = 'text-blue-600 font-bold text-base';
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
    }

    // Total column
    cols.push({
      key: 'total',
      name: 'Total Amount ($)',
      width: 180,
      resizable: true,
      frozen: true,
      renderCell: ({ row }) => {
        if (row.type === 'separator') {
          return <div className="h-full border-t-2 border-border" />;
        }

        let value = 0;
        let bgClass = '';
        let textClass = '';

        switch (row.type) {
          case 'dl':
            value = aggregates.totalDL;
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'fringe':
            value = aggregates.totalFringe;
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'oh':
            value = aggregates.totalOH;
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'ga':
            value = aggregates.totalGA;
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'fee':
            value = aggregates.totalFee;
            textClass = 'text-purple-600 font-semibold';
            break;
          case 'fblr':
            value = aggregates.totalFBLR;
            bgClass = 'bg-emerald-50';
            textClass = 'text-emerald-600 font-bold text-lg';
            break;
          case 'sub_labor':
            value = subTotals.subLaborTotal;
            textClass = 'text-orange-600 font-semibold';
            break;
          case 'passthrough':
            value = subTotals.passthroughTotal;
            textClass = 'text-orange-600 font-semibold';
            break;
          case 'sub_fee':
            value = subTotals.subFeeTotal;
            textClass = 'text-orange-600 font-semibold';
            break;
          case 'sub_total':
            value = subTotals.subContractorTotal;
            bgClass = 'bg-emerald-50';
            textClass = 'text-emerald-600 font-bold text-lg';
            break;
          case 'grand_total':
            value = subTotals.grandTotal;
            bgClass = 'bg-blue-100';
            textClass = 'text-blue-600 font-bold text-xl';
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
  }, [totalYears, aggregates, subLaborByYear, passthroughByYear, subFeeByYear, subTotals, extensions, formatCurrency]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6">
        <h3 className="text-base font-semibold text-foreground">Labor Subtotals</h3>
        <p className="text-xs text-muted-foreground">
          Prime and subcontractor costs by category
        </p>
      </div>

      <div className="h-auto min-h-[600px] overflow-auto border-2 border-blue-100 rounded-lg shadow-lg shadow-blue-50">
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

export default PrimeLaborAggregatesSection;
