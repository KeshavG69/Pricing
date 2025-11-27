'use client';

import { useState, useEffect } from 'react';
import { IndirectRates, EscalationRates } from '@/types';

interface RatesReferencePanelProps {
  rates: IndirectRates;
  escalationRates: EscalationRates;
  totalYears: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateRates: (rates: Partial<IndirectRates>) => void;
  onUpdateEscalationRates: (rates: Partial<EscalationRates>) => void;
}

export const RatesReferencePanel = ({
  rates,
  escalationRates,
  totalYears,
  isExpanded,
  onToggle,
  onUpdateRates,
  onUpdateEscalationRates,
}: RatesReferencePanelProps) => {
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
  const handleSave = () => {
    // Validate inputs (all rates should be numbers between 0 and 1)
    const validateRate = (rate: number) => !isNaN(rate) && rate >= 0 && rate <= 1;

    const allRatesValid = Object.values(editedRates).every(validateRate);
    const allEscalationRatesValid = Object.values(editedEscalationRates)
      .filter((r): r is number => r !== undefined)
      .every(validateRate);

    if (!allRatesValid || !allEscalationRatesValid) {
      alert('All rates must be valid numbers between 0% and 100%');
      return;
    }

    // Call store update methods
    onUpdateRates(editedRates);
    onUpdateEscalationRates(editedEscalationRates);

    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedRates(rates);
    setEditedEscalationRates(escalationRates);
    setIsEditing(false);
  };

  // Rate input component
  const RateInput = ({ label, value, onChange }: {
    label: string;
    value: number;
    onChange: (value: number) => void;
  }) => (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-300">{label}</span>
      {isEditing ? (
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={(value * 100).toFixed(2)}
          onChange={(e) => {
            const percentValue = parseFloat(e.target.value) || 0;
            onChange(percentValue / 100);
          }}
          className="w-24 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-50 text-sm font-mono text-right focus:border-blue-500 focus:outline-none"
        />
      ) : (
        <span className="text-sm font-mono font-semibold text-yellow-300 bg-yellow-500/10 px-2 py-1 rounded">
          {formatPercentage(value)}
        </span>
      )}
    </div>
  );

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      {/* Header - Always visible */}
      <div className="px-6 py-4 flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <svg
            className={`w-5 h-5 text-yellow-400 transition-transform ${
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
          <h3 className="text-lg font-semibold text-slate-50">Rates Reference</h3>
          <p className="text-sm text-slate-400">
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
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold rounded-md transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md transition-colors"
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
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h4 className="text-sm font-semibold text-emerald-400 mb-3 uppercase tracking-wide">
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
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h4 className="text-sm font-semibold text-purple-400 mb-3 uppercase tracking-wide">
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
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h4 className="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">
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
                    <div
                      key={key}
                      className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-3 py-2 rounded-md"
                    >
                      <span className="text-xs text-slate-300">
                        {getEscalationLabel(fromYear, toYear)}:
                      </span>
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={(rate * 100).toFixed(2)}
                          onChange={(e) => {
                            const percentValue = parseFloat(e.target.value) || 0;
                            setEditedEscalationRates({
                              ...editedEscalationRates,
                              [key]: percentValue / 100
                            });
                          }}
                          className="w-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-50 text-xs font-mono text-right focus:border-blue-500 focus:outline-none"
                        />
                      ) : (
                        <span className="text-xs font-mono font-semibold text-blue-300">
                          {formatPercentage(rate)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Info note */}
          <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <svg
              className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0"
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
            <div className="text-xs text-slate-300">
              <p className="font-semibold mb-1">About These Rates</p>
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
