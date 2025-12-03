'use client';

import { useMemo } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';
import { Aggregates } from '@/types';

interface PrimeLaborAggregatesSectionProps {
  aggregates: Aggregates;
  totalYears: number;
}

interface AggregateRow {
  id: string;
  label: string;
  type: 'dl' | 'fringe' | 'oh' | 'ga' | 'fblr';
}

export const PrimeLaborAggregatesSection = ({
  aggregates,
  totalYears,
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

  // Create aggregate rows
  const rows = useMemo<AggregateRow[]>(() => [
    { id: 'dl', label: 'Total Direct Labor', type: 'dl' },
    { id: 'fringe', label: 'Total Fringe', type: 'fringe' },
    { id: 'oh', label: 'Total Overhead', type: 'oh' },
    { id: 'ga', label: 'Total G&A', type: 'ga' },
    { id: 'fblr', label: 'Total Prime Labor (FBLR)', type: 'fblr' },
  ], []);

  // Generate columns dynamically
  const columns = useMemo<Column<AggregateRow>[]>(() => {
    const cols: Column<AggregateRow>[] = [
      // Label column
      {
        key: 'label',
        name: 'Cost Category',
        width: 250,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span className={`font-semibold ${row.type === 'fblr' ? 'text-emerald-600' : 'text-foreground'}`}>
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
        name: `${label}\nAmount ($)`,
        width: 150,
        resizable: true,
        renderCell: ({ row }) => {
          const yearData = aggregates.byYear[yearStr];
          if (!yearData) return <div className="h-full" />;

          let value = 0;
          switch (row.type) {
            case 'dl':
              value = yearData.dl;
              break;
            case 'fringe':
              value = yearData.fringe;
              break;
            case 'oh':
              value = yearData.oh;
              break;
            case 'ga':
              value = yearData.ga;
              break;
            case 'fblr':
              value = yearData.totalAmount;
              break;
          }

          return (
            <div className={`flex items-center justify-end h-full px-2 ${row.type === 'fblr' ? 'bg-emerald-500/10' : ''}`}>
              <span className={row.type === 'fblr' ? 'text-emerald-600 font-bold' : 'text-purple-600 font-semibold'}>
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
        let value = 0;
        switch (row.type) {
          case 'dl':
            value = aggregates.totalDL;
            break;
          case 'fringe':
            value = aggregates.totalFringe;
            break;
          case 'oh':
            value = aggregates.totalOH;
            break;
          case 'ga':
            value = aggregates.totalGA;
            break;
          case 'fblr':
            value = aggregates.totalFBLR;
            break;
        }

        return (
          <div className={`flex items-center justify-end h-full px-2 ${row.type === 'fblr' ? 'bg-emerald-500/10' : ''}`}>
            <span className={row.type === 'fblr' ? 'text-emerald-600 font-bold text-lg' : 'text-purple-600 font-semibold'}>
              {formatCurrency(value)}
            </span>
          </div>
        );
      },
    });

    return cols;
  }, [totalYears, aggregates]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6">
        <h3 className="text-lg font-semibold text-foreground">Prime Labor Subtotals</h3>
        <p className="text-sm text-muted-foreground">
          Aggregated by cost element
        </p>
      </div>

      <div className="h-[300px] overflow-auto border border-border rounded-lg">
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
