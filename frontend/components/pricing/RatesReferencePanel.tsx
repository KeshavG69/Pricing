'use client';

import { useState, useEffect } from 'react';
import { IndirectRates, EscalationRates, RatePreset } from '@/types';
import { useToast } from '@/lib/hooks/useToast';
import { useOrganizationStore } from '@/lib/stores/organizationStore';
import Input from '@/components/ui/Input';

interface RatesReferencePanelProps {
  rates: IndirectRates;
  escalationRates: EscalationRates;
  totalYears: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateRates: (rates: Partial<IndirectRates>) => void;
  onUpdateEscalationRates: (rates: Partial<EscalationRates>) => void;
  onRecalculate?: () => Promise<void>;
  extensions?: Array<{ year: number; label: string }>;
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
  extensions = [],
}: RatesReferencePanelProps) => {
  const toast = useToast();
  const { organization, fetchOrganization } = useOrganizationStore();

  // Fetch organization on mount to ensure we have latest presets
  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  // Preset selector state
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [appliedPresetName, setAppliedPresetName] = useState<string>('');

  // Get rate presets from organization
  const ratePresets = organization?.settings?.rate_presets || [];

  // Check if current rates match any preset
  useEffect(() => {
    if (ratePresets.length === 0) return;

    const matchingPreset = ratePresets.find(preset => {
      const ratesMatch =
        Math.abs(preset.fringe - rates.fringe) < 0.0001 &&
        Math.abs(preset.oh - rates.oh) < 0.0001 &&
        Math.abs(preset.ga - rates.ga) < 0.0001 &&
        Math.abs(preset.fee - rates.fee) < 0.0001 &&
        Math.abs((preset.smh || 0) - (rates.smh || 0)) < 0.0001 &&
        Math.abs((preset.sub_fee || 0) - (rates.sub_fee || 0)) < 0.0001 &&
        Math.abs((preset.ga_passthrough || 0) - (rates.ga_passthrough || 0)) < 0.0001;

      return ratesMatch;
    });

    if (matchingPreset) {
      setAppliedPresetName(matchingPreset.name);
    } else {
      setAppliedPresetName('');
    }
  }, [rates, ratePresets]);

  // Helper to format decimal to percentage display (fixes floating point precision)
  const toPercentageDisplay = (decimal: number): number => {
    return Math.round(decimal * 10000) / 100; // Round to 2 decimal places in percentage
  };

  // Get escalation rate label
  const getEscalationLabel = (fromYear: number, toYear: number) => {
    if (fromYear === 0) return 'Base Period';

    // Check if toYear is an extension
    const toExtension = extensions.find(ext => ext.year === toYear);

    // Format fromYear label
    const fromLabel = fromYear === 1 ? 'Base' : `Option ${fromYear - 1}`;

    // Format toYear label
    const toLabel = toExtension ? toExtension.label : (toYear === 2 ? 'Option 1' : `Option ${toYear - 1}`);

    return `${fromLabel} → ${toLabel}`;
  };

  // Helper to format rate for display (empty string if 0)
  const formatRateValue = (rate: number): string => {
    return rate === 0 ? '' : toPercentageDisplay(rate).toString();
  };

  // Update rate handlers - now updates immediately (real-time)
  const updateDefaultRate = (key: string, value: string) => {
    console.log('[RatesPanel] updateDefaultRate called:', { key, value });

    // Allow empty string for clearing
    if (value === '') {
      console.log('[RatesPanel] Clearing rate:', key);
      onUpdateRates({ [key]: 0 });
      return;
    }

    // Parse and validate the number
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      const decimalValue = numValue / 100;
      console.log('[RatesPanel] Updating rate:', { key, percentage: numValue, decimal: decimalValue });
      // Update immediately (store has debounced recalculate built-in)
      onUpdateRates({ [key]: decimalValue }); // Convert percentage to decimal
      console.log('[RatesPanel] onUpdateRates called with:', { [key]: decimalValue });
    }
  };

  const updateEscalationRate = (key: string, value: string) => {
    // Allow empty string for clearing
    if (value === '') {
      onUpdateEscalationRates({ [key]: 0 });
      return;
    }

    // Parse and validate the number
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      // Update immediately (store has debounced recalculate built-in)
      onUpdateEscalationRates({ [key]: numValue / 100 }); // Convert percentage to decimal
    }
  };

  // Helper to format escalation rate for display (empty string if 0)
  const formatEscalationValue = (rate: number): string => {
    return rate === 0 ? '' : toPercentageDisplay(rate).toString();
  };

  const handleApplyPreset = async () => {
    if (!selectedPresetId) {
      toast.error('Please select a preset first');
      return;
    }

    const preset = ratePresets.find(p => p.id === selectedPresetId);
    if (!preset) {
      toast.error('Preset not found');
      return;
    }

    // Apply preset rates immediately (real-time update)
    const newRates: IndirectRates = {
      fringe: preset.fringe,
      oh: preset.oh,
      ga: preset.ga,
      fee: preset.fee,
      smh: preset.smh,
      sub_fee: preset.sub_fee,
      ga_passthrough: preset.ga_passthrough,
    };

    onUpdateRates(newRates);
    // Store handles recalculation automatically via debounce

    toast.success(`Applied preset: ${preset.name}`);
    setAppliedPresetName(preset.name);
    setSelectedPresetId(''); // Reset selector
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Header - Always visible */}
      <div className="px-3 py-1.5 flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <svg
            className={`w-4 h-4 text-amber-500 transition-transform ${
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
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">
              Rates Reference
            </h3>
            {appliedPresetName && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded-full border border-blue-200">
                {appliedPresetName}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isExpanded ? '(Click to collapse)' : '(Click to expand)'}
          </p>
        </button>
      </div>

      {/* Content - Collapsible */}
      {isExpanded && (
        <div className="px-3 pb-1.5 space-y-1.5">
          {/* Rate Preset Selector */}
          {ratePresets.length > 0 && (
            <div className="flex items-center gap-1.5 pb-1.5 border-b border-border">
              <label className="text-[10px] font-medium text-foreground whitespace-nowrap">Preset:</label>
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className="flex-1 px-1.5 py-0.5 bg-background border border-input rounded text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select...</option>
                {ratePresets.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleApplyPreset}
                disabled={!selectedPresetId}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                  selectedPresetId
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                Apply
              </button>
            </div>
          )}

          {/* Indirect Rates Grid - Always editable (real-time updates) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
            <Input
              label="Fringe Rate"
              type="number"
              value={formatRateValue(rates.fringe)}
              onChange={(e) => updateDefaultRate('fringe', e.target.value)}
              placeholder="0"
              suffix="%"
              size="sm"
            />
            <Input
              label="Overhead (OH) Rate"
              type="number"
              value={formatRateValue(rates.oh)}
              onChange={(e) => updateDefaultRate('oh', e.target.value)}
              placeholder="0"
              suffix="%"
              size="sm"
            />
            <Input
              label="G&A Rate"
              type="number"
              value={formatRateValue(rates.ga)}
              onChange={(e) => updateDefaultRate('ga', e.target.value)}
              placeholder="0"
              suffix="%"
              size="sm"
            />
            <Input
              label="Fee Rate (Prime Labor)"
              type="number"
              value={formatRateValue(rates.fee)}
              onChange={(e) => updateDefaultRate('fee', e.target.value)}
              placeholder="0"
              suffix="%"
              size="sm"
            />
            <Input
              label="S&MH Rate (Subcontractor)"
              type="number"
              value={formatRateValue(rates.smh || 0)}
              onChange={(e) => updateDefaultRate('smh', e.target.value)}
              placeholder="0"
              suffix="%"
              size="sm"
            />
            <Input
              label="Fee Rate (Sub Labor)"
              type="number"
              value={formatRateValue(rates.sub_fee || 0)}
              onChange={(e) => updateDefaultRate('sub_fee', e.target.value)}
              placeholder="0"
              suffix="%"
              size="sm"
            />
            <Input
              label="G&A Passthrough Rate"
              type="number"
              value={formatRateValue(rates.ga_passthrough || 0)}
              onChange={(e) => updateDefaultRate('ga_passthrough', e.target.value)}
              placeholder="0"
              suffix="%"
              size="sm"
            />
          </div>

          {/* Escalation Rates - Always editable (real-time updates) */}
          {totalYears > 1 && (
            <div className="pt-1.5 border-t border-border">
              <h4 className="text-[10px] font-medium text-foreground mb-1">
                Escalation Rates (Year-over-Year)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
                {Array.from({ length: totalYears - 1 }, (_, i) => {
                  const fromYear = i + 1;
                  const toYear = i + 2;
                  const key = `${fromYear}_to_${toYear}`;
                  const rate = escalationRates[key] || 0;

                  return (
                    <Input
                      key={key}
                      label={getEscalationLabel(fromYear, toYear)}
                      type="number"
                      value={formatEscalationValue(rate)}
                      onChange={(e) => updateEscalationRate(key, e.target.value)}
                      placeholder="0"
                      suffix="%"
                      size="sm"
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RatesReferencePanel;
