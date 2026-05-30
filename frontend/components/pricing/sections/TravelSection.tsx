'use client';

import { useMemo, useState } from 'react';
import { DataGrid } from 'react-data-grid';
import type { Column } from 'react-data-grid';
import { TravelItem, Extension } from '@/types';
import 'react-data-grid/lib/styles.css';
import styles from './PrimeLaborSection.module.css';
import { useChatPanelOffset } from '@/lib/hooks/useChatPanelOffset';

interface TravelSectionProps {
  travel: TravelItem[];
  totalYears: number;
  extensions: Extension[];  // Extension periods beyond regular years
  gaRate: number; // G&A rate to apply to travel
  escalationRates: Record<string, number | undefined>; // Escalation rates by year
  onAdd: () => void;
  onEdit: (travel: TravelItem) => void;
  onDelete: (id: string) => void;
}

interface TravelRow {
  id: string;
  description?: string;
  escalate: boolean;
  amountsByYear: Record<string, number>;
  type: 'travel' | 'subtotal' | 'ga' | 'total';
  originalTravel?: TravelItem;
}

export const TravelSection = ({
  travel,
  totalYears,
  extensions,
  gaRate,
  escalationRates,
  onAdd,
  onEdit,
  onDelete,
}: TravelSectionProps) => {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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

  // Calculate Travel totals by year (before G&A) with escalation
  const travelSubtotalsByYear = useMemo(() => {
    const result: Record<string, number> = {};

    for (let year = 1; year <= totalYears; year++) {
      const yearStr = year.toString();
      result[yearStr] = 0;

      travel.forEach((item) => {
        const baseAmount = item.amount_per_year[yearStr] || 0;
        let escalatedAmount = baseAmount;

        // Apply compound escalation if flag is set
        if (item.escalate) {
          for (let y = 1; y < year; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = escalationRates[escKey] || 0;
            escalatedAmount *= (1 + escRate);
          }
        }

        result[yearStr] += escalatedAmount;
      });
    }

    return result;
  }, [travel, totalYears, escalationRates]);

  // Calculate G&A amounts by year
  const gaAmountsByYear = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(travelSubtotalsByYear).forEach(([year, amount]) => {
      result[year] = amount * gaRate;
    });
    return result;
  }, [travelSubtotalsByYear, gaRate]);

  // Calculate total with G&A by year
  const totalWithGAByYear = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(travelSubtotalsByYear).forEach(([year, amount]) => {
      result[year] = amount + gaAmountsByYear[year];
    });
    return result;
  }, [travelSubtotalsByYear, gaAmountsByYear]);

  // Calculate grand totals
  const subtotalGrandTotal = useMemo(() => {
    return Object.values(travelSubtotalsByYear).reduce((sum, val) => sum + val, 0);
  }, [travelSubtotalsByYear]);

  const gaGrandTotal = useMemo(() => {
    return Object.values(gaAmountsByYear).reduce((sum, val) => sum + val, 0);
  }, [gaAmountsByYear]);

  const grandTotal = useMemo(() => {
    return subtotalGrandTotal + gaGrandTotal;
  }, [subtotalGrandTotal, gaGrandTotal]);

  // Create rows (Travel items + subtotal + G&A + total)
  const rows = useMemo<TravelRow[]>(() => {
    const travelRows: TravelRow[] = travel.map((item, index) => ({
      id: item.id || `travel-${index}`,
      description: item.description,
      escalate: item.escalate,
      amountsByYear: item.amount_per_year,
      type: 'travel',
      originalTravel: item,
    }));

    // Add subtotal row (base amounts)
    travelRows.push({
      id: 'subtotal',
      description: 'Subtotal Travel (Base)',
      escalate: false,
      amountsByYear: travelSubtotalsByYear,
      type: 'subtotal',
    });

    // Add G&A row
    travelRows.push({
      id: 'ga',
      description: `G&A (${(gaRate * 100).toFixed(2)}%)`,
      escalate: false,
      amountsByYear: gaAmountsByYear,
      type: 'ga',
    });

    // Add total row with G&A
    travelRows.push({
      id: 'total',
      description: 'Total Travel (with G&A)',
      escalate: false,
      amountsByYear: totalWithGAByYear,
      type: 'total',
    });

    return travelRows;
  }, [travel, travelSubtotalsByYear, gaAmountsByYear, totalWithGAByYear, gaRate]);

  // Generate columns dynamically
  const columns = useMemo<Column<TravelRow>[]>(() => {
    const cols: Column<TravelRow>[] = [
      // Description column
      {
        key: 'description',
        name: 'Description',
        width: W(300, 150),
        resizable: true,
        frozen: true,
        renderCell: ({ row }) => (
          <div className={`flex items-center h-full px-2 ${
            row.type === 'subtotal' ? 'bg-gray-50 border-t-2 border-gray-300' :
            row.type === 'ga' ? 'bg-green-50' :
            row.type === 'total' ? 'bg-blue-100 border-t-2 border-blue-300 border-b-2' : ''
          }`}>
            <div className="flex flex-col gap-1">
              <span
                className={`${
                  row.type === 'total' ? 'text-blue-700 text-lg font-bold' :
                  row.type === 'subtotal' ? 'text-gray-700 font-bold' :
                  row.type === 'ga' ? 'text-green-700 font-bold' :
                  'font-semibold text-foreground'
                } whitespace-normal break-words overflow-wrap`}
              >
                {row.description || 'Travel'}
              </span>
              {row.type === 'travel' && row.escalate && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100">
                    Escalate
                  </span>
                </div>
              )}
            </div>
          </div>
        ),
      },
    ];

    // Add year columns (including extensions)
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
          const value = row.amountsByYear[yearStr] || 0;

          return (
            <div
              className={`flex items-center justify-end h-full px-2 ${
                row.type === 'subtotal' ? 'bg-gray-50 border-t-2 border-gray-300' :
                row.type === 'ga' ? 'bg-green-50' :
                row.type === 'total' ? 'bg-blue-100 border-t-2 border-blue-300 border-b-2' : ''
              }`}
            >
              <span
                className={
                  row.type === 'total' ? 'text-blue-700 font-bold text-lg' :
                  row.type === 'subtotal' ? 'text-gray-700 font-bold' :
                  row.type === 'ga' ? 'text-green-700 font-bold' :
                  'text-blue-600 font-semibold'
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
      width: W(180, 120),
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
              row.type === 'subtotal' ? 'bg-gray-50 border-t-2 border-gray-300' :
              row.type === 'ga' ? 'bg-green-50' :
              row.type === 'total' ? 'bg-blue-100 border-t-2 border-blue-300 border-b-2' : ''
            }`}
          >
            <span
              className={
                row.type === 'total' ? 'text-blue-700 font-bold text-lg' :
                row.type === 'subtotal' ? 'text-gray-700 font-bold' :
                row.type === 'ga' ? 'text-green-700 font-bold' :
                'text-blue-600 font-semibold'
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
        if (row.type !== 'travel') return <div className="h-full" />;

        return (
          <div className="flex items-center justify-center h-full gap-2">
            <button
              onClick={() => row.originalTravel && onEdit(row.originalTravel)}
              className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
              title="Edit Travel"
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
              className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
              title="Delete Travel"
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
  }, [totalYears, extensions, onEdit, W]);

  const handleConfirmDelete = (id: string) => {
    onDelete(id);
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Travel
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Travel expenses (airfare, per diem, etc.) - G&A Rate applied
          </p>
        </div>
        <button
          onClick={onAdd}
          className="min-w-[140px] px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center justify-center gap-2"
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
          Add Travel
        </button>
      </div>

      {travel.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <svg
            className="w-12 h-12 mx-auto text-muted-foreground mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
          <p className="text-muted-foreground mb-2">No Travel added yet</p>
          <p className="text-sm text-muted-foreground">
            Click "Add Travel" to add travel expenses
          </p>
        </div>
      ) : (
        <div className="h-auto min-h-[300px] overflow-auto border border-border rounded-lg">
          <DataGrid
            columns={columns}
            rows={rows}
            rowKeyGetter={(row) => row.id}
            className={styles.excelGrid}
            style={{ height: '100%' }}
            rowHeight={60}
          />
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Delete Travel
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete this travel item? This action cannot be
              undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted hover:bg-muted/80 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmDelete(confirmDelete)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
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

export default TravelSection;
