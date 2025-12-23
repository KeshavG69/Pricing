'use client';

import { useState, useEffect } from 'react';
import { IndirectRates, EscalationRates } from '@/types';
import { useToast } from '@/lib/hooks/useToast';
import Input from '@/components/ui/Input';
import { Info } from 'lucide-react';

interface RatesReferencePanelProps {
  rates: IndirectRates;
  escalationRates: EscalationRates;
  totalYears: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateRates: (rates: Partial<IndirectRates>) => void;
  onUpdateEscalationRates: (rates: Partial<EscalationRates>) => void;
  onRecalculate?: () => Promise<void>;
}

export const RatesReferencePanel = ({
  rates,
  escalationRates,
  totalYears,
  isExpanded,
  onToggle,
  onUpdateRates,
  onUpdateEscalationRates,
  onRecalculate,
}: RatesReferencePanelProps) => {
  const toast = useToast();

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editedRates, setEditedRates] = useState<IndirectRates>(rates);
  const [editedEscalationRates, setEditedEscalationRates] = useState<EscalationRates>(escalationRates);

  // Sync with props when not editing
  useEffect(() => {
    if (!isEditing) {
      setEditedRates(rates);
      setEditedEscalationRates(escalationRates);
    }
  }, [rates, escalationRates, isEditing]);

  // Helper to format decimal to percentage display (fixes floating point precision)
  const toPercentageDisplay = (decimal: number): number => {
    return Math.round(decimal * 10000) / 100; // Round to 2 decimal places in percentage
  };

  // Get escalation rate label
  const getEscalationLabel = (fromYear: number, toYear: number) => {
    if (fromYear === 0) return 'Base Period';
    if (fromYear === 1 && toYear === 2) return 'Base → Option 1';
    return `Option ${fromYear - 1} → ${toYear - 1}`;
  };

  // Update rate handlers
  const updateDefaultRate = (key: string, value: string) => {
    // Allow empty string for clearing
    if (value === '') {
      setEditedRates({
        ...editedRates,
        [key]: 0,
      });
      return;
    }

    // Parse and validate the number
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setEditedRates({
        ...editedRates,
        [key]: numValue / 100, // Convert percentage to decimal
      });
    }
  };

  const updateEscalationRate = (key: string, value: string) => {
    // Allow empty string for clearing
    if (value === '') {
      setEditedEscalationRates({
        ...editedEscalationRates,
        [key]: 0,
      });
      return;
    }

    // Parse and validate the number
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setEditedEscalationRates({
        ...editedEscalationRates,
        [key]: numValue / 100, // Convert percentage to decimal
      });
    }
  };

  // Save and cancel handlers
  const handleSave = async () => {
    // Validate inputs (all rates should be valid numbers)
    const validateRate = (rate: number) => !isNaN(rate);

    const allRatesValid = Object.values(editedRates).every(validateRate);
    const allEscalationRatesValid = Object.values(editedEscalationRates)
      .filter((r): r is number => r !== undefined)
      .every(validateRate);

    if (!allRatesValid || !allEscalationRatesValid) {
      toast.error('All rates must be valid numbers');
      return;
    }

    console.log('[RATES PANEL] Saving rates:', editedRates);
    console.log('[RATES PANEL] Saving escalation rates:', editedEscalationRates);

    // Call store update methods
    onUpdateRates(editedRates);
    onUpdateEscalationRates(editedEscalationRates);

    // Wait a bit for state to update before triggering recalculation
    await new Promise(resolve => setTimeout(resolve, 50));

    // Trigger immediate recalculation
    if (onRecalculate) {
      console.log('[RATES PANEL] Calling recalculate API...');
      await onRecalculate();
      console.log('[RATES PANEL] Recalculate API completed');
    }

    toast.success('Rates updated successfully');
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedRates(rates);
    setEditedEscalationRates(escalationRates);
    setIsEditing(false);
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header - Always visible */}
      <div className="px-6 py-4 flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <svg
            className={`w-5 h-5 text-amber-500 transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          <h3 className="text-base font-bold text-foreground">Rates Reference</h3>
          <p className="text-sm text-muted-foreground">
            {isExpanded ? '(Click to collapse)' : '(Click to expand)'}
          </p>
        </button>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-md transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-semibold rounded-md transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                if (!isExpanded) {
                  onToggle(); // Expand the panel first
                }
                setIsEditing(true);
              }}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-md transition-colors"
            >
              Edit Rates
            </button>
          )}
        </div>
      </div>

      {/* Content - Collapsible */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Indirect Rates Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label="Fringe Rate"
              type="number"
              value={toPercentageDisplay(isEditing ? editedRates.fringe : rates.fringe)}
              onChange={(e) => updateDefaultRate('fringe', e.target.value)}
              placeholder="24.70"
              suffix="%"
              disabled={!isEditing}
            />
            <Input
              label="Overhead (OH) Rate"
              type="number"
              value={toPercentageDisplay(isEditing ? editedRates.oh : rates.oh)}
              onChange={(e) => updateDefaultRate('oh', e.target.value)}
              placeholder="7.11"
              suffix="%"
              disabled={!isEditing}
            />
            <Input
              label="G&A Rate"
              type="number"
              value={toPercentageDisplay(isEditing ? editedRates.ga : rates.ga)}
              onChange={(e) => updateDefaultRate('ga', e.target.value)}
              placeholder="22.43"
              suffix="%"
              disabled={!isEditing}
            />
            <Input
              label="Fee Rate (Prime Labor)"
              type="number"
              value={toPercentageDisplay(isEditing ? editedRates.fee : rates.fee)}
              onChange={(e) => updateDefaultRate('fee', e.target.value)}
              placeholder="7.00"
              suffix="%"
              disabled={!isEditing}
            />
            <Input
              label="S&MH Rate (Subcontractor)"
              type="number"
              value={toPercentageDisplay(isEditing ? (editedRates.smh || 0) : (rates.smh || 0))}
              onChange={(e) => updateDefaultRate('smh', e.target.value)}
              placeholder="6.50"
              suffix="%"
              disabled={!isEditing}
            />
            <Input
              label="Fee Rate (Sub Labor)"
              type="number"
              value={toPercentageDisplay(isEditing ? (editedRates.sub_fee || 0) : (rates.sub_fee || 0))}
              onChange={(e) => updateDefaultRate('sub_fee', e.target.value)}
              placeholder="5.00"
              suffix="%"
              disabled={!isEditing}
            />
            <Input
              label="G&A Passthrough Rate"
              type="number"
              value={toPercentageDisplay(isEditing ? (editedRates.ga_passthrough || 0) : (rates.ga_passthrough || 0))}
              onChange={(e) => updateDefaultRate('ga_passthrough', e.target.value)}
              placeholder="2.50"
              suffix="%"
              disabled={!isEditing}
            />
          </div>

          {/* Escalation Rates */}
          {totalYears > 1 && (
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-medium text-foreground mb-3">
                Escalation Rates (Year-over-Year)
              </h4>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: totalYears - 1 }, (_, i) => {
                  const fromYear = i + 1;
                  const toYear = i + 2;
                  const key = `${fromYear}_to_${toYear}`;
                  const rate = isEditing
                    ? (editedEscalationRates[key] || 0)
                    : (escalationRates[key] || 0);

                  return (
                    <Input
                      key={key}
                      label={getEscalationLabel(fromYear, toYear)}
                      type="number"
                      value={toPercentageDisplay(rate)}
                      onChange={(e) => updateEscalationRate(key, e.target.value)}
                      placeholder="3.00"
                      suffix="%"
                      disabled={!isEditing}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900 mb-1">
                About These Rates
              </p>
              <p className="text-xs text-blue-700">
                These rates are used throughout the cost proposal calculations. Indirect
                rates apply to prime labor (Fringe → OH → G&A cascade). Fee and
                passthrough rates apply to subcontractor costs. Escalation rates
                compound year-over-year.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RatesReferencePanel;
