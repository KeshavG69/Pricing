'use client';

import { useMemo } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';
import { AdvancedPosition } from '@/types';
import { formatSocCode } from '@/lib/utils/socHelpers';

interface WageDataSectionProps {
  positions: AdvancedPosition[];
}

interface WageDataRow {
  id: string;
  labor_category: string;
  location?: string;
  description?: string;
  soc_code?: string;
  soc_title?: string;
  wage_source?: 'bls' | 'gsa';
  wage_10th?: number;
  wage_25th?: number;
  wage_50th?: number;
  wage_75th?: number;
  wage_90th?: number;
  selected_percentile?: string;
  selected_wage?: number;
  // GSA fields
  gsa_title?: string;
  gsa_rates_by_year?: Record<string, number>;
  gsa_current_year?: number;
  gsa_custom_rate?: number | null;
}

export const WageDataSection = ({ positions }: WageDataSectionProps) => {
  // Format currency
  const formatCurrency = (value: number | undefined) => {
    if (value === undefined || value === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Check if all positions are GSA
  const isAllGSA = useMemo(() => {
    return positions.length > 0 && positions.every(pos => pos.wage_source === 'gsa');
  }, [positions]);

  // Convert positions to wage data rows
  const rows = useMemo<WageDataRow[]>(() => {
    return positions.map((pos) => {
      // Calculate selected wage and determine which percentile to highlight
      let selected_wage: number | undefined;
      let highlighted_percentile: string | undefined;

      if (pos.wage_source === 'gsa' && pos.gsa_rates_by_year) {
        // For GSA positions, use the current year's rate
        const currentYear = pos.gsa_current_year || 1;
        selected_wage = pos.gsa_custom_rate ?? pos.gsa_rates_by_year[String(currentYear)];
      } else {
        // For BLS positions: check if user manually edited (selected_salaries exists)
        if (pos.selected_salaries && pos.selected_salaries.length > 0) {
          // User edited - show average of selected salaries
          selected_wage = pos.selected_salaries.reduce((sum, sal) => sum + sal, 0) / pos.selected_salaries.length;

          // Determine which percentile the user actually selected by comparing wage values
          // Round to handle minor floating point differences
          const roundedWage = Math.round(selected_wage);
          if (Math.round(pos.wage_10th || 0) === roundedWage) highlighted_percentile = '10th';
          else if (Math.round(pos.wage_25th || 0) === roundedWage) highlighted_percentile = '25th';
          else if (Math.round(pos.wage_50th || 0) === roundedWage) highlighted_percentile = '50th';
          else if (Math.round(pos.wage_75th || 0) === roundedWage) highlighted_percentile = '75th';
          else if (Math.round(pos.wage_90th || 0) === roundedWage) highlighted_percentile = '90th';
        } else if (pos.selected_wage) {
          // Use system's original selected wage
          selected_wage = pos.selected_wage;
          // Use system's selected percentile (strip " (default)" suffix)
          highlighted_percentile = pos.selected_percentile?.replace(' (default)', '') || pos.percentile?.replace(' (default)', '');
        } else if (pos.percentile) {
          // Fallback: calculate from percentile (strip " (default)" suffix)
          const cleanPercentile = pos.percentile.replace(' (default)', '');
          const percentileKey = `wage_${cleanPercentile}` as keyof AdvancedPosition;
          selected_wage = pos[percentileKey] as number | undefined;
          highlighted_percentile = cleanPercentile;
        }
      }

      return {
        id: pos.id,
        labor_category: pos.labor_category,
        location: pos.location,
        description: pos.description,
        soc_code: pos.soc_code,
        soc_title: pos.soc_title,
        wage_source: pos.wage_source,
        wage_10th: pos.wage_10th,
        wage_25th: pos.wage_25th,
        wage_50th: pos.wage_50th,
        wage_75th: pos.wage_75th,
        wage_90th: pos.wage_90th,
        selected_percentile: highlighted_percentile,
        selected_wage,
        gsa_title: pos.gsa_title,
        gsa_rates_by_year: pos.gsa_rates_by_year,
        gsa_current_year: pos.gsa_current_year,
        gsa_custom_rate: pos.gsa_custom_rate,
      };
    });
  }, [positions]);

  // Define columns
  const columns = useMemo<Column<WageDataRow>[]>(() => {
    const baseColumns: Column<WageDataRow>[] = [
      {
        key: 'labor_category',
        name: 'Labor Category',
        width: 250,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2 py-2">
            <span className="font-semibold text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {row.labor_category}
            </span>
          </div>
        ),
      },
    {
      key: 'location',
      name: 'Location',
      width: 200,
      resizable: true,
      frozen: true,
      renderCell: ({ row }) => (
        <div className="flex items-center h-full px-2 py-2">
          <span className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {row.location || '-'}
          </span>
        </div>
      ),
    },
    {
      key: 'description',
      name: 'Description',
      width: 500,
      resizable: true,
      renderCell: ({ row }) => (
        <div className="flex items-start h-full px-3 py-2">
          <span className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {row.description || '-'}
          </span>
        </div>
      ),
    },
    {
      key: 'wage_source',
      name: 'Source',
      width: 80,
      resizable: true,
      renderCell: ({ row }) => (
        <div className="flex items-center justify-center h-full px-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            row.wage_source === 'gsa'
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
              : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
          }`}>
            {row.wage_source?.toUpperCase() || 'BLS'}
          </span>
        </div>
      ),
    },
  ];

  // SOC Code column - only show for BLS contracts
  const socCodeColumn: Column<WageDataRow>[] = !isAllGSA ? [
    {
      key: 'soc_code',
      name: 'SOC Code',
      width: 120,
      resizable: true,
      renderCell: ({ row }) => (
        <div className="flex items-center h-full px-2">
          <span className="text-sm text-muted-foreground">
            {row.wage_source === 'gsa' ? '-' : formatSocCode(row.soc_code)}
          </span>
        </div>
      ),
    },
  ] : [];

  const socTitleColumn: Column<WageDataRow>[] = [
    {
      key: 'soc_title',
      name: 'SOC Title / GSA Labor Category',
      width: 280,
      resizable: true,
      renderCell: ({ row }) => (
        <div className="flex items-center h-full px-2 py-2">
          <span className="text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
            {row.wage_source === 'gsa' ? row.gsa_title : row.soc_title}
          </span>
        </div>
      ),
    },
  ];

  // Percentile columns - only show for BLS contracts
  const percentileColumns: Column<WageDataRow>[] = !isAllGSA ? [
    {
      key: 'wage_10th',
      name: '10th\nPercentile',
      width: 120,
      resizable: true,
      renderCell: ({ row }) => (
        <div className="flex items-center justify-end h-full px-2">
          <span className="text-sm font-medium text-purple-600">
            {row.wage_source === 'gsa' ? '-' : formatCurrency(row.wage_10th)}
          </span>
        </div>
      ),
    },
    {
      key: 'wage_25th',
      name: '25th\nPercentile',
      width: 120,
      resizable: true,
      renderCell: ({ row }) => {
        const isSelected = row.selected_percentile === '25th' && row.wage_source !== 'gsa';
        return (
          <div className={`flex items-center justify-end h-full px-2 ${isSelected ? 'bg-emerald-50' : ''}`}>
            <span className={`text-sm font-medium ${isSelected ? 'text-emerald-600 font-bold' : 'text-purple-600'}`}>
              {row.wage_source === 'gsa' ? '-' : formatCurrency(row.wage_25th)}
            </span>
          </div>
        );
      },
    },
    {
      key: 'wage_50th',
      name: '50th\nPercentile\n(Median)',
      width: 120,
      resizable: true,
      renderCell: ({ row }) => {
        const isSelected = row.selected_percentile === '50th' && row.wage_source !== 'gsa';
        return (
          <div className={`flex items-center justify-end h-full px-2 ${isSelected ? 'bg-emerald-50' : ''}`}>
            <span className={`text-sm font-medium ${isSelected ? 'text-emerald-600 font-bold' : 'text-purple-600'}`}>
              {row.wage_source === 'gsa' ? '-' : formatCurrency(row.wage_50th)}
            </span>
          </div>
        );
      },
    },
    {
      key: 'wage_75th',
      name: '75th\nPercentile',
      width: 120,
      resizable: true,
      renderCell: ({ row }) => {
        const isSelected = row.selected_percentile === '75th' && row.wage_source !== 'gsa';
        return (
          <div className={`flex items-center justify-end h-full px-2 ${isSelected ? 'bg-emerald-50' : ''}`}>
            <span className={`text-sm font-medium ${isSelected ? 'text-emerald-600 font-bold' : 'text-purple-600'}`}>
              {row.wage_source === 'gsa' ? '-' : formatCurrency(row.wage_75th)}
            </span>
          </div>
        );
      },
    },
    {
      key: 'wage_90th',
      name: '90th\nPercentile',
      width: 120,
      resizable: true,
      renderCell: ({ row }) => {
        const isSelected = row.selected_percentile === '90th' && row.wage_source !== 'gsa';
        return (
          <div className={`flex items-center justify-end h-full px-2 ${isSelected ? 'bg-emerald-50' : ''}`}>
            <span className={`text-sm font-medium ${isSelected ? 'text-emerald-600 font-bold' : 'text-purple-600'}`}>
              {row.wage_source === 'gsa' ? '-' : formatCurrency(row.wage_90th)}
            </span>
          </div>
        );
      },
    },
  ] : [];

  const finalColumns: Column<WageDataRow>[] = [
    ...baseColumns,
    ...socCodeColumn,
    ...socTitleColumn,
    ...percentileColumns,
    {
      key: 'selected_wage',
      name: 'Selected\nWage/Rate',
      width: 140,
      resizable: true,
      frozen: true,
      renderCell: ({ row }) => {
        let displayValue = row.selected_wage;

        // For GSA positions, show the current year's rate
        if (row.wage_source === 'gsa' && row.gsa_rates_by_year) {
          const currentYear = row.gsa_current_year || 1;
          displayValue = row.gsa_custom_rate ?? row.gsa_rates_by_year[String(currentYear)];
        }

        return (
          <div className="flex items-center justify-end h-full px-2 bg-blue-50">
            <span className="text-sm font-bold text-blue-600">
              {formatCurrency(displayValue)}
            </span>
          </div>
        );
      },
    },
  ];

  return finalColumns;
  }, [isAllGSA]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6">
        <h3 className="text-base font-semibold text-foreground">Wage Data</h3>
        <p className="text-xs text-muted-foreground">
          All positions with wage percentiles and selected rates
        </p>
      </div>

      <div className="h-[calc(100vh-300px)] overflow-auto border border-border rounded-lg">
        <DataGrid
          columns={columns}
          rows={rows}
          rowKeyGetter={(row) => row.id}
          className={styles.excelGrid}
          style={{ height: '100%' }}
          rowHeight={150}
        />
      </div>
    </div>
  );
};

export default WageDataSection;
