'use client';

import { usePricingStore } from '@/lib/stores/pricingStore';
import Button from '../ui/Button';
import { Download, Save, CheckCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export const PricingSidebar = () => {
  const {
    rates,
    escalationRates,
    totalYears,
    positions,
    subcontractors,
    odcs,
    updateRates,
    updateEscalationRates,
    exportToExcel,
    isDirty,
    isSaving,
    isRecalculating,
    lastSaved,
  } = usePricingStore();

  // Calculate totals
  const primeLaborTotal = positions.reduce((sum, p) => sum + (p.total_amount || 0), 0);
  const subcontractorTotal = 0; // TODO: Calculate from subcontractors
  const odcTotal = 0; // TODO: Calculate from ODCs
  const totalContractValue = primeLaborTotal + subcontractorTotal + odcTotal;

  // Auto-save indicator
  const renderSaveIndicator = () => {
    if (isSaving) {
      return (
        <div className="flex items-center space-x-2 text-sky-400 text-xs">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Saving...</span>
        </div>
      );
    }

    if (isDirty) {
      return (
        <div className="flex items-center space-x-2 text-amber-400 text-xs">
          <Save className="w-3 h-3" />
          <span>Unsaved changes</span>
        </div>
      );
    }

    if (lastSaved) {
      return (
        <div className="flex items-center space-x-2 text-emerald-400 text-xs">
          <CheckCircle className="w-3 h-3" />
          <span>Saved {formatDistanceToNow(lastSaved, { addSuffix: true })}</span>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="w-full h-full overflow-y-auto p-6 space-y-6">
      {/* Auto-save indicator */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Workspace</h3>
        {renderSaveIndicator()}
      </div>

      {/* Indirect Rates */}
      <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
          Indirect Rates
        </h4>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Fringe (%)</label>
            <input
              type="number"
              step="0.01"
              value={(rates.fringe * 100).toFixed(2)}
              onChange={(e) =>
                updateRates({ fringe: parseFloat(e.target.value) / 100 })
              }
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-50 text-sm focus:ring-2 focus:ring-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Overhead (%)</label>
            <input
              type="number"
              step="0.01"
              value={(rates.oh * 100).toFixed(2)}
              onChange={(e) =>
                updateRates({ oh: parseFloat(e.target.value) / 100 })
              }
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-50 text-sm focus:ring-2 focus:ring-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">G&A (%)</label>
            <input
              type="number"
              step="0.01"
              value={(rates.ga * 100).toFixed(2)}
              onChange={(e) =>
                updateRates({ ga: parseFloat(e.target.value) / 100 })
              }
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-50 text-sm focus:ring-2 focus:ring-slate-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Fee (%)</label>
            <input
              type="number"
              step="0.01"
              value={(rates.fee * 100).toFixed(2)}
              onChange={(e) =>
                updateRates({ fee: parseFloat(e.target.value) / 100 })
              }
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-50 text-sm focus:ring-2 focus:ring-slate-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Escalation Rates */}
      {totalYears > 1 && (
        <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
            Escalation Rates
          </h4>
          <div className="space-y-3">
            {Array.from({ length: totalYears - 1 }, (_, i) => i + 1).map((year) => {
              const key = `${year}_to_${year + 1}`;
              return (
                <div key={key}>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Year {year} → Year {year + 1} (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={((escalationRates[key] || 0) * 100).toFixed(2)}
                    onChange={(e) =>
                      updateEscalationRates({
                        [key]: parseFloat(e.target.value) / 100,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-50 text-sm focus:ring-2 focus:ring-slate-500 focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Totals Summary */}
      <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
          Contract Totals
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Prime Labor</span>
            <span className="text-sm text-slate-50 font-semibold">
              ${primeLaborTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Subcontractors</span>
            <span className="text-sm text-slate-50 font-semibold">
              ${subcontractorTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">ODCs</span>
            <span className="text-sm text-slate-50 font-semibold">
              ${odcTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="h-px bg-slate-700 my-2" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-50 font-semibold">Total Contract Value</span>
            <span className="text-lg text-emerald-400 font-bold">
              ${totalContractValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button
          variant="primary"
          onClick={exportToExcel}
          className="w-full"
          disabled={isRecalculating}
        >
          <Download className="w-4 h-4 mr-2" />
          Export to Excel
        </Button>
      </div>

      {/* Calculation status */}
      {isRecalculating && (
        <div className="text-xs text-sky-400 text-center">
          <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
          Recalculating...
        </div>
      )}
    </div>
  );
};

export default PricingSidebar;
