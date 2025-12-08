'use client';

import { useMemo, useEffect } from 'react';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Trash2, Building2 } from 'lucide-react';

export const SubcontractorSection = () => {
  const { subcontractors, totalYears, deleteSubcontractor } = usePricingStore();

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

  return (
    <div className="mt-6 space-y-4">
      <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2 px-6">
        Subcontractor Labor ({subcontractors.length})
      </h3>

      {subcontractorTotals.map((sub) => (
        <Card key={sub.id} className="p-4">
          {/* Subcontractor Header */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <div>
              <h4 className="text-sm font-semibold text-foreground">{sub.name}</h4>
              <p className="text-xs text-muted-foreground mt-1">
                {sub.positions.length} position{sub.positions.length !== 1 ? 's' : ''}
                {' • '}
                Total: ${sub.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (
                  confirm(
                    `Delete subcontractor "${sub.name}" and all ${sub.positions.length} position(s)?`
                  )
                ) {
                  deleteSubcontractor(sub.id);
                }
              }}
              className="text-muted-foreground hover:text-red-600 hover:bg-red-50 hover:border-red-200"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Positions Table */}
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
                {sub.positionTotals.map((pos, idx) => (
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
                    Subtotal ({sub.name}):
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {sub.positionTotals.reduce((sum, p) => sum + p.totalHours, 0).toLocaleString('en-US')}
                  </td>
                  <td className="py-3 text-right text-purple-600">
                    ${sub.grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ))}

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
    </div>
  );
};

export default SubcontractorSection;
