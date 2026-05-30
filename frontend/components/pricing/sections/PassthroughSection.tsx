'use client';

import { useMemo } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import type { Extension } from '@/types';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';
import { useChatPanelOffset } from '@/lib/hooks/useChatPanelOffset';

interface PassthroughSectionProps {
  subcontractorCostsByYear: Record<string, number>;
  passthroughRates: { smh: number; ga_passthrough: number };
  totalYears: number;
  extensions?: Extension[];
}

interface PassthroughRow {
  id: string;
  label: string;
  type: 'smh' | 'ga' | 'total';
  rate: number;
}

export const PassthroughSection = ({
  subcontractorCostsByYear,
  passthroughRates,
  totalYears,
  extensions = [],
}: PassthroughSectionProps) => {
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

  // Calculate passthrough costs by year
  const passthroughByYear = useMemo(() => {
    const result: Record<string, { smh: number; ga: number; total: number }> = {};

    Object.entries(subcontractorCostsByYear).forEach(([year, cost]) => {
      const smh = cost * passthroughRates.smh;
      const ga = cost * passthroughRates.ga_passthrough;
      result[year] = {
        smh,
        ga,
        total: smh + ga,
      };
    });

    return result;
  }, [subcontractorCostsByYear, passthroughRates]);

  // Calculate totals
  const totals = useMemo(() => {
    let smhTotal = 0;
    let gaTotal = 0;

    Object.values(passthroughByYear).forEach(({ smh, ga }) => {
      smhTotal += smh;
      gaTotal += ga;
    });

    return {
      smh: smhTotal,
      ga: gaTotal,
      total: smhTotal + gaTotal,
    };
  }, [passthroughByYear]);

  // Create passthrough rows
  const rows = useMemo<PassthroughRow[]>(() => [
    {
      id: 'smh',
      label: 'Handling (S&MH)',
      type: 'smh',
      rate: passthroughRates.smh,
    },
    {
      id: 'ga',
      label: 'G&A Passthrough',
      type: 'ga',
      rate: passthroughRates.ga_passthrough,
    },
    {
      id: 'total',
      label: 'Total Passthrough',
      type: 'total',
      rate: passthroughRates.smh + passthroughRates.ga_passthrough,
    },
  ], [passthroughRates]);

  // Generate columns dynamically
  const columns = useMemo<Column<PassthroughRow>[]>(() => {
    const cols: Column<PassthroughRow>[] = [
      // Label column
      {
        key: 'label',
        name: 'Labor Category',
        width: W(280, 140),
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span className={`font-semibold whitespace-normal break-words overflow-wrap ${row.type === 'total' ? 'text-blue-600' : 'text-foreground'}`}>
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
            <span className={`text-xs ${row.type === 'total' ? 'text-blue-600 font-semibold' : 'text-muted-foreground'}`}>
              {formatPercentage(row.rate)}
            </span>
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
          const yearData = passthroughByYear[yearStr];
          if (!yearData) return <div className="h-full" />;

          let value = 0;
          switch (row.type) {
            case 'smh':
              value = yearData.smh;
              break;
            case 'ga':
              value = yearData.ga;
              break;
            case 'total':
              value = yearData.total;
              break;
          }

          return (
            <div className={`flex items-center justify-end h-full px-2 ${row.type === 'total' ? 'bg-blue-500/10' : ''}`}>
              <span className={row.type === 'total' ? 'text-blue-600 font-bold' : 'text-purple-600 font-semibold'}>
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
          case 'smh':
            value = totals.smh;
            break;
          case 'ga':
            value = totals.ga;
            break;
          case 'total':
            value = totals.total;
            break;
        }

        return (
          <div className={`flex items-center justify-end h-full px-2 ${row.type === 'total' ? 'bg-blue-500/10' : ''}`}>
            <span className={row.type === 'total' ? 'text-blue-600 font-semibold' : 'text-purple-600 font-medium'}>
              {formatCurrency(value)}
            </span>
          </div>
        );
      },
    });

    return cols;
  }, [totalYears, extensions, passthroughByYear, totals, W]);

  // Don't render if no subcontractor costs
  const hasSubcontractorCosts = Object.values(subcontractorCostsByYear).some(cost => cost > 0);
  if (!hasSubcontractorCosts) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6">
        <h3 className="text-base font-bold text-foreground">Prime Contractor Passthrough</h3>
        <p className="text-sm text-muted-foreground">
          Management overhead on subcontractor labor (not including fee)
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

export default PassthroughSection;
