'use client';

import { useState, useEffect } from 'react';
import { IndirectRates, EscalationRates } from '@/types';
import { useToast } from '@/lib/hooks/useToast';

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

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  // Get escalation rate label
  const getEscalationLabel = (fromYear: number, toYear: number) => {
    if (fromYear === 0) return 'Base Period';
    if (fromYear === 1 && toYear === 2) return 'Base → Option 1';
    return `Option ${fromYear - 1} → ${toYear - 1}`;
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

    // Call store update methods
    onUpdateRates(editedRates);
    onUpdateEscalationRates(editedEscalationRates);

    // Trigger immediate recalculation
    if (onRecalculate) {
      await onRecalculate();
    }

    toast.success('Rates updated successfully');
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedRates(rates);
    setEditedEscalationRates(escalationRates);
    setIsEditing(false);
  };

  // Rate input component with local state for editing
  const RateInput = ({ label, value, onChange }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
  }) => {
    const [inputValue, setInputValue] = useState((value * 100).toFixed(2));

    // Sync with prop when not focused
    useEffect(() => {
      setInputValue((value * 100).toFixed(2));
    }, [value]);

    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {isEditing ? (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              const newValue = e.target.value;
              // Allow typing any numeric input including negative and decimals
              if (newValue === '' || newValue === '-' || newValue === '.' || /^-?\d*\.?\d*$/.test(newValue)) {
                setInputValue(newValue);
              }
            }}
            onBlur={() => {
              // Convert to decimal and update parent
              const percentValue = parseFloat(inputValue) || 0;
              onChange(percentValue / 100);
              // Re-format the display
              setInputValue((percentValue).toFixed(2));
            }}
            className="w-24 px-2 py-1 bg-background border border-input rounded text-foreground text-sm font-mono text-right focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        ) : (
          <span className="text-sm font-mono font-semibold text-amber-600 bg-amber-100 px-2 py-1 rounded">
            {formatPercentage(value)}
          </span>
        )}
      </div>
    );
  };

  // Escalation rate input component with local state
  const EscalationRateInput = ({ label, rate, isEditing, onChange }: {
    label: string;
    rate: number;
    isEditing: boolean;
    onChange: (value: number) => void;
  }) => {
    const [inputValue, setInputValue] = useState((rate * 100).toFixed(2));

    // Sync with prop when not focused
    useEffect(() => {
      setInputValue((rate * 100).toFixed(2));
    }, [rate]);

    return (
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-md">
        <span className="text-xs text-muted-foreground">{label}:</span>
        {isEditing ? (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              const newValue = e.target.value;
              // Allow typing any numeric input including negative and decimals
              if (newValue === '' || newValue === '-' || newValue === '.' || /^-?\d*\.?\d*$/.test(newValue)) {
                setInputValue(newValue);
              }
            }}
            onBlur={() => {
              // Convert to decimal and update parent
              const percentValue = parseFloat(inputValue) || 0;
              onChange(percentValue / 100);
              // Re-format the display
              setInputValue((percentValue).toFixed(2));
            }}
            className="w-20 px-2 py-1 bg-background border border-input rounded text-foreground text-xs font-mono text-right focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        ) : (
          <span className="text-xs font-mono font-semibold text-blue-600">
            {formatPercentage(rate)}
          </span>
        )}
      </div>
    );
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
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-md transition-colors"
            >
              Edit Rates
            </button>
          )}
        </div>
      </div>

      {/* Content - Collapsible */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-6">
          {/* Two-column grid for rate categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Indirect Rates */}
            <div className="bg-muted/30 rounded-lg p-4 border border-border">
              <h4 className="text-sm font-bold text-emerald-600 mb-3 uppercase tracking-wide">
                Indirect Rates
              </h4>
              <div className="space-y-2">
                <RateInput
                  label="Fringe"
                  value={isEditing ? editedRates.fringe : rates.fringe}
                  onChange={(val) => setEditedRates({ ...editedRates, fringe: val })}
                />
                <RateInput
                  label="Overhead (OH)"
                  value={isEditing ? editedRates.oh : rates.oh}
                  onChange={(val) => setEditedRates({ ...editedRates, oh: val })}
                />
                <RateInput
                  label="G&A"
                  value={isEditing ? editedRates.ga : rates.ga}
                  onChange={(val) => setEditedRates({ ...editedRates, ga: val })}
                />
              </div>
            </div>

            {/* Fee & Passthrough Rates */}
            <div className="bg-muted/30 rounded-lg p-4 border border-border">
              <h4 className="text-sm font-bold text-purple-600 mb-3 uppercase tracking-wide">
                Fee &amp; Passthrough Rates
              </h4>
              <div className="space-y-2">
                <RateInput
                  label="Prime Labor Fee"
                  value={isEditing ? editedRates.fee : rates.fee}
                  onChange={(val) => setEditedRates({ ...editedRates, fee: val })}
                />
                <RateInput
                  label="Sub Labor Fee"
                  value={isEditing ? (editedRates.sub_fee || 0) : (rates.sub_fee || 0)}
                  onChange={(val) => setEditedRates({ ...editedRates, sub_fee: val })}
                />
                <RateInput
                  label="S&MH (Handling)"
                  value={isEditing ? (editedRates.smh || 0) : (rates.smh || 0)}
                  onChange={(val) => setEditedRates({ ...editedRates, smh: val })}
                />
                <RateInput
                  label="G&A Passthrough"
                  value={isEditing ? (editedRates.ga_passthrough || 0) : (rates.ga_passthrough || 0)}
                  onChange={(val) => setEditedRates({ ...editedRates, ga_passthrough: val })}
                />
                <RateInput
                  label="G&A Adder (ODC)"
                  value={isEditing ? (editedRates.ga_adder || 0) : (rates.ga_adder || 0)}
                  onChange={(val) => setEditedRates({ ...editedRates, ga_adder: val })}
                />
              </div>
            </div>
          </div>

          {/* Escalation Rates */}
          {totalYears > 1 && (
            <div className="bg-muted/30 rounded-lg p-4 border border-border">
              <h4 className="text-sm font-bold text-blue-600 mb-3 uppercase tracking-wide">
                Escalation Rates
              </h4>
              <div className="flex flex-wrap gap-3">
                {Array.from({ length: totalYears - 1 }, (_, i) => {
                  const fromYear = i + 1;
                  const toYear = i + 2;
                  const key = `${fromYear}_to_${toYear}`;
                  const rate = isEditing
                    ? (editedEscalationRates[key] || 0)
                    : (escalationRates[key] || 0);

                  return (
                    <EscalationRateInput
                      key={key}
                      label={getEscalationLabel(fromYear, toYear)}
                      rate={rate}
                      isEditing={isEditing}
                      onChange={(newRate) => {
                        setEditedEscalationRates({
                          ...editedEscalationRates,
                          [key]: newRate
                        });
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Info note */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <svg
              className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-xs text-muted-foreground">
              <p className="font-semibold mb-1 text-foreground">About These Rates</p>
              <p>
                These rates are used throughout the cost proposal calculations. Indirect
                rates apply to prime labor (Fringe → OH → G&amp;A cascade). Fee and
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
