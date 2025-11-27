'use client';

import { useMemo } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import { Subcontractor } from '@/types';
import 'react-data-grid/lib/styles.css';

interface RateTableViewProps {
  subcontractors: Subcontractor[];
  feeRate: number;
  smhRate: number;
}

interface RateTableRow {
  id: string;
  laborCategory: string;
  baseRate: number;
  afterFee: number;
  afterSMH: number;
  finalRate: number;
}

export const RateTableView = ({
  subcontractors,
  feeRate,
  smhRate,
}: RateTableViewProps) => {
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

  // Calculate example (first subcontractor position)
  const exampleCalculation = useMemo(() => {
    if (subcontractors.length === 0 || subcontractors[0].positions.length === 0) {
      return null;
    }

    const firstPosition = subcontractors[0].positions[0];
    const baseRate = firstPosition.rate;
    const afterFee = baseRate * (1 + feeRate);
    const finalRate = afterFee * (1 + smhRate);

    return {
      laborCategory: firstPosition.labor_category,
      baseRate,
      afterFee,
      finalRate,
      feeRate,
      smhRate,
    };
  }, [subcontractors, feeRate, smhRate]);

  // Create rate table rows
  const rows = useMemo<RateTableRow[]>(() => {
    const allRows: RateTableRow[] = [];

    subcontractors.forEach((sub) => {
      sub.positions.forEach((pos, index) => {
        const baseRate = pos.rate;
        const afterFee = baseRate * (1 + feeRate);
        const finalRate = afterFee * (1 + smhRate);

        allRows.push({
          id: `${sub.id}_${index}`,
          laborCategory: pos.labor_category,
          baseRate,
          afterFee,
          afterSMH: finalRate,
          finalRate,
        });
      });
    });

    return allRows;
  }, [subcontractors, feeRate, smhRate]);

  // Generate columns
  const columns = useMemo<Column<RateTableRow>[]>(() => {
    return [
      {
        key: 'laborCategory',
        name: 'Labor Category',
        width: 250,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span className="font-semibold text-slate-50">{row.laborCategory}</span>
          </div>
        ),
      },
      {
        key: 'baseRate',
        name: 'Base Rate',
        width: 150,
        resizable: true,
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2 bg-purple-500/5">
            <span className="text-purple-300 font-semibold">
              {formatCurrency(row.baseRate)}
            </span>
          </div>
        ),
      },
      {
        key: 'afterFee',
        name: `After Fee (+${formatPercentage(feeRate)})`,
        width: 180,
        resizable: true,
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2 bg-yellow-500/5">
            <span className="text-yellow-300 font-semibold">
              {formatCurrency(row.afterFee)}
            </span>
          </div>
        ),
      },
      {
        key: 'afterSMH',
        name: `After S&MH (+${formatPercentage(smhRate)})`,
        width: 180,
        resizable: true,
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2 bg-blue-500/5">
            <span className="text-blue-300 font-semibold">
              {formatCurrency(row.afterSMH)}
            </span>
          </div>
        ),
      },
      {
        key: 'finalRate',
        name: 'Final Billable Rate',
        width: 180,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center justify-end h-full px-2 bg-emerald-500/10">
            <span className="text-emerald-400 font-bold text-lg">
              {formatCurrency(row.finalRate)}
            </span>
          </div>
        ),
      },
    ];
  }, [feeRate, smhRate]);

  if (subcontractors.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto text-slate-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <p className="text-slate-400 text-lg mb-2">No Subcontractors</p>
          <p className="text-sm text-slate-500">
            Add subcontractor labor to view the rate table
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-semibold text-slate-50 mb-2">
          Subcontractor Fee/MH Rate Table
        </h2>
        <p className="text-sm text-slate-400">
          Shows step-by-step markup calculations for subcontractor labor rates
        </p>
      </div>

      {/* Example Calculation */}
      {exampleCalculation && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-slate-50 mb-4">
            Example Calculation
          </h3>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Base Rate */}
            <div className="flex flex-col items-center">
              <span className="text-xs text-slate-500 mb-1">Base Rate</span>
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg px-4 py-2">
                <span className="text-purple-300 font-bold text-lg">
                  {formatCurrency(exampleCalculation.baseRate)}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center">
              <span className="text-xs text-slate-500 mb-1">
                +Fee ({formatPercentage(feeRate)})
              </span>
              <svg
                className="w-6 h-6 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </div>

            {/* After Fee */}
            <div className="flex flex-col items-center">
              <span className="text-xs text-slate-500 mb-1">After Fee</span>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2">
                <span className="text-yellow-300 font-bold text-lg">
                  {formatCurrency(exampleCalculation.afterFee)}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center">
              <span className="text-xs text-slate-500 mb-1">
                +S&amp;MH ({formatPercentage(smhRate)})
              </span>
              <svg
                className="w-6 h-6 text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </div>

            {/* Final Rate */}
            <div className="flex flex-col items-center">
              <span className="text-xs text-slate-500 mb-1">Final Rate</span>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2">
                <span className="text-emerald-400 font-bold text-xl">
                  {formatCurrency(exampleCalculation.finalRate)}
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-4">
            Example based on: {exampleCalculation.laborCategory}
          </p>
        </div>
      )}

      {/* Rate Table */}
      <div>
        <h3 className="text-lg font-semibold text-slate-50 mb-3">
          Complete Rate Table
        </h3>
        <div className="h-[500px] overflow-auto border border-slate-800 rounded-lg">
          <DataGrid
            columns={columns}
            rows={rows}
            rowKeyGetter={(row) => row.id}
            className="rdg-light"
            style={{ height: '100%' }}
            rowHeight={50}
          />
        </div>
      </div>
    </div>
  );
};

export default RateTableView;
