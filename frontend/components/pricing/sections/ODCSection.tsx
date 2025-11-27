'use client';

import { useMemo, useState } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import { ODCItem } from '@/types';
import 'react-data-grid/lib/styles.css';

interface ODCSectionProps {
  odcs: ODCItem[];
  totalYears: number;
  onAdd: () => void;
  onEdit: (odc: ODCItem) => void;
  onDelete: (id: string) => void;
}

interface ODCRow {
  id: string;
  category: string;
  description?: string;
  escalate: boolean;
  applyGAAdder: boolean;
  amountsByYear: Record<string, number>;
  type: 'odc' | 'total';
  originalODC?: ODCItem;
}

export const ODCSection = ({
  odcs,
  totalYears,
  onAdd,
  onEdit,
  onDelete,
}: ODCSectionProps) => {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  // Calculate ODC totals by year (before escalation/GA)
  const odcTotalsByYear = useMemo(() => {
    const result: Record<string, number> = {};

    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      result[yearStr] = 0;

      odcs.forEach((odc) => {
        result[yearStr] += odc.amount_per_year[yearStr] || 0;
      });
    }

    return result;
  }, [odcs, totalYears]);

  // Calculate grand total
  const grandTotal = useMemo(() => {
    return Object.values(odcTotalsByYear).reduce((sum, val) => sum + val, 0);
  }, [odcTotalsByYear]);

  // Create rows (ODC items + total row)
  const rows = useMemo<ODCRow[]>(() => {
    const odcRows: ODCRow[] = odcs.map((odc) => ({
      id: odc.id,
      category: odc.category,
      description: odc.description,
      escalate: odc.escalate,
      applyGAAdder: odc.apply_ga_adder,
      amountsByYear: odc.amount_per_year,
      type: 'odc',
      originalODC: odc,
    }));

    // Add total row
    odcRows.push({
      id: 'total',
      category: 'Total ODCs',
      escalate: false,
      applyGAAdder: false,
      amountsByYear: odcTotalsByYear,
      type: 'total',
    });

    return odcRows;
  }, [odcs, odcTotalsByYear]);

  // Generate columns dynamically
  const columns = useMemo<Column<ODCRow>[]>(() => {
    const cols: Column<ODCRow>[] = [
      // Category column
      {
        key: 'category',
        name: 'Category',
        width: 150,
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => (
          <div className="flex items-center h-full px-2">
            <span
              className={`font-semibold ${
                row.type === 'total' ? 'text-orange-400 text-lg' : 'text-slate-50'
              }`}
            >
              {row.category}
            </span>
          </div>
        ),
      },
      // Description column
      {
        key: 'description',
        name: 'Description',
        width: 250,
        resizable: true,
        renderCell: ({ row }) => {
          if (row.type === 'total') return <div className="h-full" />;

          return (
            <div className="flex items-center h-full px-2">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">
                  {row.description || '-'}
                </span>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {row.escalate && (
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                      Escalate
                    </span>
                  )}
                  {row.applyGAAdder && (
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
                      +G&amp;A
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        },
      },
    ];

    // Add year columns
    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      const label = year === 1 ? 'Base Period' : `Option Year ${year - 1}`;

      cols.push({
        key: `year${year}`,
        name: `${label}\nAmount ($)`,
        width: 150,
        resizable: true,
        renderCell: ({ row }) => {
          const value = row.amountsByYear[yearStr] || 0;

          return (
            <div
              className={`flex items-center justify-end h-full px-2 ${
                row.type === 'total' ? 'bg-orange-500/10' : ''
              }`}
            >
              <span
                className={
                  row.type === 'total'
                    ? 'text-orange-400 font-bold'
                    : 'text-amber-400 font-semibold'
                }
              >
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
        const total = Object.values(row.amountsByYear).reduce(
          (sum, val) => sum + val,
          0
        );

        return (
          <div
            className={`flex items-center justify-end h-full px-2 ${
              row.type === 'total' ? 'bg-orange-500/20' : ''
            }`}
          >
            <span
              className={
                row.type === 'total'
                  ? 'text-orange-400 font-bold text-lg'
                  : 'text-amber-400 font-semibold'
              }
            >
              {formatCurrency(total)}
            </span>
          </div>
        );
      },
    });

    // Actions column
    cols.push({
      key: 'actions',
      name: '',
      width: 100,
      resizable: false,
      renderCell: ({ row }) => {
        if (row.type === 'total') return <div className="h-full" />;

        return (
          <div className="flex items-center justify-center h-full gap-2">
            <button
              onClick={() => row.originalODC && onEdit(row.originalODC)}
              className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
              title="Edit ODC"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              onClick={() => setConfirmDelete(row.id)}
              className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
              title="Delete ODC"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        );
      },
    });

    return cols;
  }, [totalYears, onEdit]);

  const handleConfirmDelete = (id: string) => {
    onDelete(id);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">
            Other Direct Costs (ODCs)
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Travel, materials, equipment, and other costs
          </p>
        </div>
        <button
          onClick={onAdd}
          className="px-4 py-2 text-sm font-medium text-slate-50 bg-orange-600 hover:bg-orange-700 rounded-md transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add ODC
        </button>
      </div>

      {odcs.length === 0 ? (
        <div className="border-2 border-dashed border-slate-700 rounded-lg p-12 text-center">
          <svg
            className="w-12 h-12 mx-auto text-slate-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-slate-400 mb-2">No ODCs added yet</p>
          <p className="text-sm text-slate-500">
            Click "Add ODC" to add travel, materials, equipment, or other costs
          </p>
        </div>
      ) : (
        <div className="h-auto min-h-[300px] overflow-auto border border-slate-800 rounded-lg">
          <DataGrid
            columns={columns}
            rows={rows}
            rowKeyGetter={(row) => row.id}
            className="rdg-light"
            style={{ height: '100%' }}
            rowHeight={60}
          />
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-50 mb-2">
              Delete ODC
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              Are you sure you want to delete this ODC? This action cannot be
              undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmDelete(confirmDelete)}
                className="px-4 py-2 text-sm font-medium text-slate-50 bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ODCSection;
