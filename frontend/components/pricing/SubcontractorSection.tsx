'use client';

import { useMemo, useEffect, useState } from 'react';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Trash2, Building2, ChevronDown } from 'lucide-react';

export const SubcontractorSection = () => {
  const { subcontractors, totalYears, deleteSubcontractor } = usePricingStore();

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [subToDelete, setSubToDelete] = useState<{ id: string; name: string; positionCount: number } | null>(null);

  // Track which subcontractor is selected (default to first one)
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  // Set default selection when subcontractors change
  useEffect(() => {
    if (subcontractors.length > 0 && !selectedSubId) {
      setSelectedSubId(subcontractors[0].id);
    } else if (subcontractors.length > 0 && !subcontractors.find(s => s.id === selectedSubId)) {
      // Selected sub was deleted, select first one
      setSelectedSubId(subcontractors[0].id);
    } else if (subcontractors.length === 0) {
      setSelectedSubId(null);
    }
  }, [subcontractors, selectedSubId]);

  // Debug logging
  useEffect(() => {
    console.log('🎯 SubcontractorSection: Rendering');
    console.log('   - Subcontractors count:', subcontractors.length);
    console.log('   - Subcontractors data:', subcontractors);
  }, [subcontractors]);

  // Calculate total cost per subcontractor
  const subcontractorTotals = useMemo(() => {
    return subcontractors.map((sub) => {
      const positionTotals = sub.positions.map((pos) => {
        const totalHours = Object.values(pos.hours_per_year).reduce((sum, h) => sum + h, 0);
        const totalCost = totalHours * pos.rate;
        return { ...pos, totalHours, totalCost };
      });

      const grandTotal = positionTotals.reduce((sum, p) => sum + p.totalCost, 0);

      return {
        ...sub,
        positionTotals,
        grandTotal,
      };
    });
  }, [subcontractors]);

  if (subcontractors.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2 px-6">
          Subcontractor Labor
        </h3>
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm">No subcontractor positions yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Right-click on a position and select "Convert to Subcontractor"
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Get the selected subcontractor's data
  const selectedSub = subcontractorTotals.find((s) => s.id === selectedSubId);

  return (
    <div className="mt-6 space-y-4">
      {/* Header with Dropdown Selector */}
      <div className="flex items-center justify-between px-6 mb-4">
        <div className="flex items-center gap-4">
          <h3 className="text-base font-semibold text-foreground">
            Subcontractor Labor
          </h3>

          {/* Dropdown Selector */}
          <div className="relative">
            <select
              value={selectedSubId || ''}
              onChange={(e) => setSelectedSubId(e.target.value)}
              className="appearance-none bg-background border border-border rounded-md pl-3 pr-10 py-2 text-sm font-medium text-foreground cursor-pointer hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-w-[200px]"
            >
              {subcontractorTotals.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({sub.positions.length} positions)
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Delete Button for Selected Sub */}
        {selectedSub && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSubToDelete({
                id: selectedSub.id,
                name: selectedSub.name,
                positionCount: selectedSub.positions.length,
              });
              setDeleteDialogOpen(true);
            }}
            className="text-muted-foreground hover:text-red-600 hover:bg-red-50 hover:border-red-200"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Subcontractor
          </Button>
        )}
      </div>

      {/* Selected Subcontractor Details */}
      {selectedSub && (
        <Card className="overflow-hidden">
          {/* Subcontractor Summary Header */}
          <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
            <div>
              <h4 className="text-lg font-semibold text-foreground">{selectedSub.name}</h4>
              <p className="text-sm text-muted-foreground mt-0.5">
                {selectedSub.positions.length} position{selectedSub.positions.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="text-xl font-bold text-purple-600">
                ${selectedSub.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Positions Table */}
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4 font-medium">Labor Category</th>
                    <th className="pb-2 pr-4 font-medium text-right">Rate ($/hr)</th>
                    {Array.from({ length: totalYears }, (_, i) => i + 1).map((year) => (
                      <th key={year} className="pb-2 pr-4 font-medium text-right">
                        {year === 1 ? 'Base' : `Opt ${year - 1}`}
                      </th>
                    ))}
                    <th className="pb-2 font-medium text-right">Total Hours</th>
                    <th className="pb-2 font-medium text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSub.positionTotals.map((pos, idx) => (
                    <tr
                      key={idx}
                      className="text-sm text-foreground border-b border-border last:border-0"
                    >
                      <td className="py-3 pr-4">{pos.labor_category}</td>
                      <td className="py-3 pr-4 text-right text-emerald-600 font-semibold">
                        ${pos.rate.toFixed(2)}
                      </td>
                      {Array.from({ length: totalYears }, (_, i) => (i + 1).toString()).map(
                        (year) => (
                          <td key={year} className="py-3 pr-4 text-right">
                            {(pos.hours_per_year[year] || 0).toLocaleString('en-US')}
                          </td>
                        )
                      )}
                      <td className="py-3 pr-4 text-right font-semibold">
                        {pos.totalHours.toLocaleString('en-US')}
                      </td>
                      <td className="py-3 text-right font-bold text-purple-600">
                        ${pos.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Subtotal Row */}
                <tfoot>
                  <tr className="text-sm font-bold text-foreground border-t-2 border-border">
                    <td colSpan={totalYears + 2} className="py-3 pr-4 text-right">
                      Subtotal ({selectedSub.name}):
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {selectedSub.positionTotals.reduce((sum, p) => sum + p.totalHours, 0).toLocaleString('en-US')}
                    </td>
                    <td className="py-3 text-right text-purple-600">
                      ${selectedSub.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Grand Total for All Subcontractors */}
      {subcontractorTotals.length > 1 && (
        <Card className="p-4 bg-purple-50 border-purple-200">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">
              Total Subcontractor Cost
            </span>
            <span className="text-xl font-bold text-purple-600">
              $
              {subcontractorTotals
                .reduce((sum, sub) => sum + sub.grandTotal, 0)
                .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setSubToDelete(null);
        }}
        onConfirm={() => {
          if (subToDelete) {
            deleteSubcontractor(subToDelete.id);
          }
          setDeleteDialogOpen(false);
          setSubToDelete(null);
        }}
        title="Delete Subcontractor"
        message={`Are you sure you want to delete subcontractor "${subToDelete?.name}" and all ${subToDelete?.positionCount} position(s)? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </div>
  );
};

export default SubcontractorSection;
