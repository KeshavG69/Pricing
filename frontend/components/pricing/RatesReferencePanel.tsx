'use client';

import { useState, useEffect } from 'react';
import { IndirectRates, EscalationRates, RatePreset } from '@/types';
import { useToast } from '@/lib/hooks/useToast';
import { useOrganizationStore } from '@/lib/stores/organizationStore';
import Input from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { Sparkles, ChevronRight } from 'lucide-react';

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
  const [showPresetModal, setShowPresetModal] = useState(false);

  // Get rate presets from organization
  const ratePresets = organization?.settings?.rate_presets || [];

  // Check if current rates match any preset
  useEffect(() => {
    if (ratePresets.length === 0) return;

    const matchingPreset = ratePresets.find(preset => {
      const presetOhOnsite = preset.oh_onsite !== undefined ? preset.oh_onsite : preset.oh || 0;
      const presetOhOffsite = preset.oh_offsite !== undefined ? preset.oh_offsite : preset.oh || 0;
      const currentOhOnsite = rates.oh_onsite !== undefined ? rates.oh_onsite : rates.oh || 0;
      const currentOhOffsite = rates.oh_offsite !== undefined ? rates.oh_offsite : rates.oh || 0;

      const ratesMatch =
        Math.abs(preset.fringe - rates.fringe) < 0.0001 &&
        Math.abs(presetOhOnsite - currentOhOnsite) < 0.0001 &&
        Math.abs(presetOhOffsite - currentOhOffsite) < 0.0001 &&
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

  const handleApplyPreset = async (presetId: string) => {
    const preset = ratePresets.find(p => p.id === presetId);
    if (!preset) {
      toast.error('Preset not found');
      return;
    }

    // Apply preset rates immediately (real-time update)
    const newRates: IndirectRates = {
      fringe: preset.fringe,
      oh_onsite: preset.oh_onsite !== undefined ? preset.oh_onsite : preset.oh || 0.0711,
      oh_offsite: preset.oh_offsite !== undefined ? preset.oh_offsite : preset.oh || 0.0711,
      ga: preset.ga,
      fee: preset.fee,
      smh: preset.smh,
      sub_fee: preset.sub_fee,
      ga_passthrough: preset.ga_passthrough,
      ot_multiplier: preset.ot_multiplier,
      surge_multiplier: preset.surge_multiplier,
    };

    onUpdateRates(newRates);
    // Store handles recalculation automatically via debounce

    toast.success(`Applied preset: ${preset.name}`);
    setAppliedPresetName(preset.name);
    setSelectedPresetId(''); // Reset selector
    setShowPresetModal(false); // Close modal
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
            <div className="pb-1.5 border-b border-border">
              <button
                onClick={() => setShowPresetModal(true)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-200 rounded-lg transition-all hover:shadow-md group"
              >
                <span className="text-xs font-semibold text-blue-900">Apply Rate Preset</span>
                <ChevronRight className="w-4 h-4 text-blue-600 group-hover:translate-x-1 transition-transform" />
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
              label="OH (On-Site) Rate"
              type="number"
              value={formatRateValue(rates.oh_onsite)}
              onChange={(e) => updateDefaultRate('oh_onsite', e.target.value)}
              placeholder="0"
              suffix="%"
              size="sm"
            />
            <Input
              label="OH (Off-Site) Rate"
              type="number"
              value={formatRateValue(rates.oh_offsite)}
              onChange={(e) => updateDefaultRate('oh_offsite', e.target.value)}
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
            <Input
              label="OT Multiplier"
              type="number"
              value={formatRateValue(rates.ot_multiplier || 1.5)}
              onChange={(e) => {
                const value = e.target.value === '' ? '' : parseFloat(e.target.value) / 100;
                updateDefaultRate('ot_multiplier', e.target.value);
              }}
              placeholder="150"
              suffix="%"
              size="sm"
            />
            <Input
              label="Surge Multiplier"
              type="number"
              value={formatRateValue(rates.surge_multiplier || 1.15)}
              onChange={(e) => {
                const value = e.target.value === '' ? '' : parseFloat(e.target.value) / 100;
                updateDefaultRate('surge_multiplier', e.target.value);
              }}
              placeholder="115"
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

      {/* Rate Preset Modal */}
      <Dialog
        isOpen={showPresetModal}
        onClose={() => setShowPresetModal(false)}
        title="Apply Rate Preset"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select a rate preset to quickly apply to your proposal. This will update all indirect rates.
          </p>

          {ratePresets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No rate presets available</p>
              <p className="text-xs mt-1">Create presets in Company Rates settings</p>
            </div>
          ) : (
            <div className="grid gap-3 max-h-[60vh] overflow-y-auto">
              {ratePresets.map((preset) => {
                const isCurrentlyApplied = appliedPresetName === preset.name;
                return (
                  <div
                    key={preset.id}
                    className={`border rounded-lg p-4 transition-all hover:shadow-md ${
                      isCurrentlyApplied
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-border hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-foreground">{preset.name}</h4>
                        {isCurrentlyApplied && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-600 text-white rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApplyPreset(preset.id)}
                        className="shadow-sm"
                      >
                        Apply
                      </Button>
                    </div>

                    {/* Rate details grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">Fringe</div>
                        <div className="font-mono font-semibold text-foreground">
                          {toPercentageDisplay(preset.fringe)}%
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">OH On-Site</div>
                        <div className="font-mono font-semibold text-foreground">
                          {toPercentageDisplay(preset.oh_onsite !== undefined ? preset.oh_onsite : preset.oh || 0)}%
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">OH Off-Site</div>
                        <div className="font-mono font-semibold text-foreground">
                          {toPercentageDisplay(preset.oh_offsite !== undefined ? preset.oh_offsite : preset.oh || 0)}%
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">G&A</div>
                        <div className="font-mono font-semibold text-foreground">
                          {toPercentageDisplay(preset.ga)}%
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">Fee</div>
                        <div className="font-mono font-semibold text-foreground">
                          {toPercentageDisplay(preset.fee)}%
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">S&MH</div>
                        <div className="font-mono font-semibold text-foreground">
                          {toPercentageDisplay(preset.smh || 0)}%
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">Sub Fee</div>
                        <div className="font-mono font-semibold text-foreground">
                          {toPercentageDisplay(preset.sub_fee || 0)}%
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">G&A Pass</div>
                        <div className="font-mono font-semibold text-foreground">
                          {toPercentageDisplay(preset.ga_passthrough || 0)}%
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">Escalation</div>
                        <div className="font-mono font-semibold text-foreground">
                          {toPercentageDisplay(preset.escalation_rate || 0)}%
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">OT Multiplier</div>
                        <div className="font-mono font-semibold text-foreground">
                          {preset.ot_multiplier ? toPercentageDisplay(preset.ot_multiplier) + '%' : '-'}
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5">
                        <div className="text-muted-foreground mb-0.5">Surge Mult.</div>
                        <div className="font-mono font-semibold text-foreground">
                          {preset.surge_multiplier ? toPercentageDisplay(preset.surge_multiplier) + '%' : '-'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-border">
            <Button variant="outline" onClick={() => setShowPresetModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default RatesReferencePanel;
