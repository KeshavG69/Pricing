'use client';

import { useState, useEffect, useMemo } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SpreadsheetPosition, AdvancedPosition } from '@/types';
import { getAvailablePercentiles } from '@/lib/utils/percentileHelpers';
import { isGSAPosition, getGSARateForYear } from '@/lib/utils/salaryHelpers';
import { DollarSign, Plus, X, TrendingUp, Building2, Calendar } from 'lucide-react';
import { usePricingStore } from '@/lib/stores/pricingStore';

type PercentileValue = '10th' | '25th' | '50th' | '75th' | '90th';

interface SalarySelectionModalProps {
  open: boolean;
  onClose: () => void;
  position: SpreadsheetPosition | AdvancedPosition | null;
  onUpdate: (updates: Partial<SpreadsheetPosition> | Partial<AdvancedPosition>) => void;
}

export const SalarySelectionModal = ({
  open,
  onClose,
  position,
  onUpdate,
}: SalarySelectionModalProps) => {
  // Get total years from store
  const totalYears = usePricingStore((state) => state.totalYears);

  // Check if GSA position
  const isGSA = position ? isGSAPosition(position) : false;

  // Multi-select state (BLS mode)
  const [selectedPercentiles, setSelectedPercentiles] = useState<PercentileValue[]>([]);
  const [customAmounts, setCustomAmounts] = useState<number[]>([]);
  const [newCustomAmount, setNewCustomAmount] = useState<string>('');

  // GSA state
  const [gsaCurrentYear, setGsaCurrentYear] = useState<number>(1);
  const [gsaCustomRate, setGsaCustomRate] = useState<number | null>(null);
  const [newGsaCustomRate, setNewGsaCustomRate] = useState<string>('');

  // Initialize state when position changes or modal opens
  useEffect(() => {
    if (position && open) {
      if (isGSA) {
        // GSA mode: Initialize GSA current year to saved value or first available contract year
        if (position.gsa_current_year) {
          setGsaCurrentYear(position.gsa_current_year);
        } else if (position.gsa_rates_by_year) {
          // Default to first available contract year
          const years = Object.keys(position.gsa_rates_by_year)
            .map(Number)
            .filter((y) => !isNaN(y))
            .sort((a, b) => a - b);
          setGsaCurrentYear(years[0] || 1);
        } else {
          setGsaCurrentYear(1);
        }
        // Initialize custom rate if set
        setGsaCustomRate(position.gsa_custom_rate || null);
        setNewGsaCustomRate('');
      } else {
        // BLS mode: Check for new multi-select format first
        if (position.salary_sources) {
          setSelectedPercentiles([...position.salary_sources.percentiles]);
          setCustomAmounts([...position.salary_sources.custom_amounts]);
        }
        // Fall back to legacy single-select
        else if (position.custom_salary) {
          setSelectedPercentiles([]);
          setCustomAmounts([position.custom_salary]);
        } else {
          setSelectedPercentiles([position.percentile]);
          setCustomAmounts([]);
        }
        setNewCustomAmount('');
      }
    }
  }, [position, open, isGSA]);

  // Get available percentiles with wage data (BLS mode)
  const availablePercentiles = useMemo(() => {
    if (!position || isGSA) return [];
    return getAvailablePercentiles(position);
  }, [position, isGSA]);

  // Get GSA rates by year (GSA mode)
  const gsaRatesByYear = useMemo(() => {
    if (!position || !isGSA || !position.gsa_rates_by_year) return [];

    const rates: { contractYear: number; proposalYear: number; rate: number }[] = [];

    for (let proposalYear = 1; proposalYear <= totalYears; proposalYear++) {
      const contractYear = gsaCurrentYear + (proposalYear - 1);
      const rate = position.gsa_rates_by_year[String(contractYear)] || 0;
      rates.push({ contractYear, proposalYear, rate });
    }

    return rates;
  }, [position, isGSA, gsaCurrentYear, totalYears]);

  // Get available contract years from GSA rates
  const availableContractYears = useMemo(() => {
    if (!position || !isGSA || !position.gsa_rates_by_year) return [];
    return Object.keys(position.gsa_rates_by_year)
      .map(Number)
      .filter((y) => !isNaN(y))
      .sort((a, b) => a - b);
  }, [position, isGSA]);

  // Calculate selected salaries and average
  const { selectedSalaries, averageSalary } = useMemo(() => {
    const salaries: number[] = [];

    // Add selected percentile wages
    selectedPercentiles.forEach((p) => {
      const wage = position?.[`wage_${p}` as keyof typeof position];
      if (typeof wage === 'number' && wage > 0) {
        salaries.push(wage);
      }
    });

    // Add custom amounts
    customAmounts.forEach((amount) => {
      if (amount > 0) {
        salaries.push(amount);
      }
    });

    const avg = salaries.length > 0
      ? salaries.reduce((sum, s) => sum + s, 0) / salaries.length
      : 0;

    return { selectedSalaries: salaries, averageSalary: avg };
  }, [selectedPercentiles, customAmounts, position]);

  // Toggle percentile selection
  const togglePercentile = (percentile: PercentileValue) => {
    setSelectedPercentiles((prev) => {
      if (prev.includes(percentile)) {
        return prev.filter((p) => p !== percentile);
      } else {
        return [...prev, percentile];
      }
    });
  };

  // Add custom amount
  const addCustomAmount = () => {
    const amount = parseFloat(newCustomAmount);
    if (!isNaN(amount) && amount > 0) {
      setCustomAmounts((prev) => [...prev, amount]);
      setNewCustomAmount('');
    }
  };

  // Remove custom amount
  const removeCustomAmount = (index: number) => {
    setCustomAmounts((prev) => prev.filter((_, i) => i !== index));
  };

  // Add GSA custom rate
  const addGsaCustomRate = () => {
    const rate = parseFloat(newGsaCustomRate);
    if (!isNaN(rate) && rate > 0) {
      setGsaCustomRate(rate);
      setNewGsaCustomRate('');
    }
  };

  // Remove GSA custom rate
  const removeGsaCustomRate = () => {
    setGsaCustomRate(null);
  };

  // Handle apply
  const handleApply = () => {
    if (!position) return;

    if (isGSA) {
      // GSA mode: Update current year selection and custom rate
      // Use null to explicitly clear custom rate when not set
      const updates: Partial<SpreadsheetPosition | AdvancedPosition> = {
        gsa_current_year: gsaCurrentYear,
        gsa_custom_rate: gsaCustomRate, // null will clear, number will set
      };
      onUpdate(updates);
    } else {
      // BLS mode: Build the update payload
      const updates: Partial<SpreadsheetPosition | AdvancedPosition> = {
        selected_salaries: selectedSalaries,
        salary_sources: {
          percentiles: selectedPercentiles,
          custom_amounts: customAmounts,
        },
        // Keep the primary percentile for backward compatibility (use first selected or existing)
        percentile: selectedPercentiles[0] || position.percentile,
        // Clear legacy custom_salary since we're using multi-select
        custom_salary: undefined,
      };
      onUpdate(updates);
    }

    onClose();
  };

  // Handle close
  const handleClose = () => {
    onClose();
  };

  // Check if selection is valid
  const isValid = isGSA ? gsaCurrentYear > 0 : selectedSalaries.length > 0;

  // Modal title based on mode
  const modalTitle = isGSA ? 'GSA Rate Configuration' : 'Select Salaries';

  if (!position) return null;

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title={modalTitle}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleApply} variant="primary" disabled={!isValid}>
            Apply
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground mb-4">
        Position: <span className="text-foreground font-semibold">{position.labor_category}</span>
        {isGSA && position.gsa_title && (
          <div className="mt-1 text-xs">
            GSA Category: <span className="text-green-700 font-medium">{position.gsa_lcat_id} - {position.gsa_title}</span>
          </div>
        )}
      </div>

      {/* Scrollable content container */}
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {isGSA ? (
          /* ========== GSA MODE ========== */
          <div className="space-y-6">
            {/* Current GSA Rate Display */}
            <div className={`border rounded-lg p-4 ${gsaCustomRate ? 'bg-blue-100 border-blue-300 dark:bg-blue-950/30 dark:border-blue-800' : 'bg-green-100 border-green-300 dark:bg-green-950/30 dark:border-green-800'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className={`w-4 h-4 ${gsaCustomRate ? 'text-blue-700' : 'text-green-700'}`} />
                  <span>Year 1 Rate:</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-xl ${gsaCustomRate ? 'text-blue-800 dark:text-blue-200' : 'text-green-800 dark:text-green-200'}`}>
                    ${(gsaCustomRate || getGSARateForYear(position, 1)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${gsaCustomRate ? 'text-blue-700 bg-blue-200 dark:bg-blue-900' : 'text-green-700 bg-green-200 dark:bg-green-900'}`}>
                    {gsaCustomRate ? 'Custom' : 'GSA'}
                  </span>
                </div>
              </div>
            </div>

            {/* Contract Year Selection - Only show when not using custom rate */}
            {!gsaCustomRate && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-green-700" />
                  <h3 className="text-sm font-semibold text-foreground">Contract Year Alignment</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Select which GSA contract year corresponds to Proposal Year 1
                </p>

                <div className="space-y-2">
                  {availableContractYears.map((year) => {
                    const isSelected = gsaCurrentYear === year;
                    const rate = position.gsa_rates_by_year?.[String(year)] || 0;
                    return (
                      <label
                        key={year}
                        className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-green-700 bg-green-100 dark:bg-green-950/30'
                            : 'border-border hover:border-green-600 hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="gsaYear"
                            checked={isSelected}
                            onChange={() => setGsaCurrentYear(year)}
                            className="w-4 h-4 text-green-700 cursor-pointer"
                          />
                          <div>
                            <div className="text-sm font-medium text-foreground">Contract Year {year}</div>
                            <div className="text-xs text-muted-foreground">
                              Maps to Proposal Year 1
                            </div>
                          </div>
                        </div>
                        <div className="text-lg font-bold font-mono text-green-800 dark:text-green-200">
                          ${rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Rate Preview by Year - Only show when not using custom rate */}
            {!gsaCustomRate && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-green-700" />
                  <h3 className="text-sm font-semibold text-foreground">Rate Preview by Proposal Year</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Preview of GSA rates for each proposal year based on contract year alignment
                </p>

                <div className="space-y-2">
                  {gsaRatesByYear.map(({ contractYear, proposalYear, rate }) => (
                    <div
                      key={proposalYear}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                    >
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {proposalYear === 1 ? 'Base Period' : `Option Year ${proposalYear - 1}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Contract Year {contractYear}
                        </div>
                      </div>
                      <div className={`text-lg font-bold font-mono ${rate > 0 ? 'text-green-800 dark:text-green-200' : 'text-red-500'}`}>
                        {rate > 0 ? `$${rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr` : 'N/A'}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Custom Rate Override */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-foreground">Custom Rate Override</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Override GSA rates with a custom hourly rate for all years
              </p>

              {/* Current custom rate */}
              {gsaCustomRate && (
                <div className="flex items-center justify-between p-3 rounded-lg border-2 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                    <span className="text-sm font-medium text-foreground">Custom hourly rate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-blue-600">
                      ${gsaCustomRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr
                    </span>
                    <button
                      onClick={removeGsaCustomRate}
                      className="p-1 hover:bg-red-100 rounded text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Custom rate input - always visible */}
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={newGsaCustomRate}
                  onChange={(e) => setNewGsaCustomRate(e.target.value)}
                  placeholder="Enter hourly rate..."
                  className="flex-1"
                  min="0"
                  step="0.01"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addGsaCustomRate();
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground">/hr</span>
                <Button
                  variant="outline"
                  onClick={addGsaCustomRate}
                  disabled={!newGsaCustomRate || parseFloat(newGsaCustomRate) <= 0}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {gsaCustomRate ? 'Update' : 'Set'}
                </Button>
              </div>

              {/* Quick rate buttons - always visible */}
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Quick set:</p>
                <div className="grid grid-cols-4 gap-2">
                  {[75, 100, 125, 150, 175, 200, 250, 300].map((rate) => (
                    <Button
                      key={rate}
                      variant={gsaCustomRate === rate ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setGsaCustomRate(rate)}
                      className="text-xs"
                    >
                      ${rate}/hr
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        ) : (
          /* ========== BLS MODE ========== */
          <>
            {/* Average Salary Display */}
            <div className={`border rounded-lg p-4 mb-6 ${selectedSalaries.length > 1 ? 'bg-purple-50 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800' : 'bg-primary/10 border-primary/20'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="w-4 h-4" />
                  <span>{selectedSalaries.length > 1 ? 'Average Salary:' : 'Selected Salary:'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-xl ${selectedSalaries.length > 1 ? 'text-purple-600 dark:text-purple-400' : 'text-primary'}`}>
                    ${averageSalary.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  {selectedSalaries.length > 1 && (
                    <span className="text-xs text-purple-600 bg-purple-600/10 px-2 py-0.5 rounded">
                      {selectedSalaries.length} selected
                    </span>
                  )}
                  {selectedSalaries.length === 1 && customAmounts.length > 0 && (
                    <span className="text-xs text-blue-600 bg-blue-600/10 px-2 py-0.5 rounded">Custom</span>
                  )}
                  {selectedSalaries.length === 1 && selectedPercentiles.length === 1 && customAmounts.length === 0 && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{selectedPercentiles[0]}</span>
                  )}
                </div>
              </div>

              {/* Breakdown when multiple selected */}
              {selectedSalaries.length > 1 && (
                <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
                  <div className="text-xs text-muted-foreground space-y-1">
                    {selectedPercentiles.map((p) => {
                      const wage = position[`wage_${p}` as keyof typeof position];
                      return (
                        <div key={p} className="flex justify-between">
                          <span>{p} percentile</span>
                          <span className="font-mono">${typeof wage === 'number' ? wage.toLocaleString() : 0}</span>
                        </div>
                      );
                    })}
                    {customAmounts.map((amount, i) => (
                      <div key={`custom-${i}`} className="flex justify-between">
                        <span>Custom {customAmounts.length > 1 ? i + 1 : ''}</span>
                        <span className="font-mono">${amount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* BLS Percentiles - Checkboxes */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">BLS Wage Percentiles</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Select one or more percentiles to average
                </p>

                <div className="space-y-2">
                  {availablePercentiles.map((p) => {
                    const isSelected = selectedPercentiles.includes(p.value as PercentileValue);
                    return (
                      <label
                        key={p.value}
                  className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePercentile(p.value as PercentileValue)}
                      className="w-4 h-4 text-primary cursor-pointer rounded"
                    />
                    <div>
                      <div className="text-sm font-medium text-foreground">{p.value} percentile</div>
                      <div className="text-xs text-muted-foreground">
                        {p.value === '10th' && 'Entry level'}
                        {p.value === '25th' && 'Early career (< 3 years)'}
                        {p.value === '50th' && 'Mid-level (3-5 years)'}
                        {p.value === '75th' && 'Senior (> 5 years)'}
                        {p.value === '90th' && 'Expert level'}
                      </div>
                    </div>
                  </div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    ${p.wage.toLocaleString()}
                  </div>
                </label>
              );
            })}
          </div>
        </Card>

        {/* Custom Amounts */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-foreground">Custom Amounts</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Add custom salary amounts to include in the average
          </p>

          {/* Existing custom amounts */}
          {customAmounts.length > 0 && (
            <div className="space-y-2 mb-4">
              {customAmounts.map((amount, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border-2 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                    <span className="text-sm font-medium text-foreground">Custom amount</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-blue-600">
                      ${amount.toLocaleString()}
                    </span>
                    <button
                      onClick={() => removeCustomAmount(index)}
                      className="p-1 hover:bg-red-100 rounded text-red-500 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new custom amount */}
          <div className="flex items-center gap-2">
            <span className="text-lg text-muted-foreground">$</span>
            <Input
              type="number"
              value={newCustomAmount}
              onChange={(e) => setNewCustomAmount(e.target.value)}
              placeholder="Enter amount..."
              className="flex-1"
              min="0"
              step="1000"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomAmount();
                }
              }}
            />
            <Button
              variant="outline"
              onClick={addCustomAmount}
              disabled={!newCustomAmount || parseFloat(newCustomAmount) <= 0}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Quick amount buttons */}
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Quick add:</p>
            <div className="grid grid-cols-3 gap-2">
              {[75000, 100000, 125000, 150000, 175000, 200000].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomAmounts((prev) => [...prev, amount])}
                  className="text-xs"
                >
                  ${(amount / 1000).toFixed(0)}k
                </Button>
              ))}
            </div>
          </div>
              </Card>
            </div>
          </>
        )}
      </div>

      {/* Warning if nothing selected */}
      {!isValid && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-200">
          Please select at least one percentile or add a custom amount.
        </div>
      )}
    </Dialog>
  );
};

export default SalarySelectionModal;
