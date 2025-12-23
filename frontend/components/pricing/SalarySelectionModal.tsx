'use client';

import { useState, useEffect, useMemo } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SpreadsheetPosition, AdvancedPosition } from '@/types';
import { getAvailablePercentiles } from '@/lib/utils/percentileHelpers';
import { DollarSign, Plus, X, TrendingUp } from 'lucide-react';

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
  // Multi-select state
  const [selectedPercentiles, setSelectedPercentiles] = useState<PercentileValue[]>([]);
  const [customAmounts, setCustomAmounts] = useState<number[]>([]);
  const [newCustomAmount, setNewCustomAmount] = useState<string>('');

  // Initialize state when position changes or modal opens
  useEffect(() => {
    if (position && open) {
      // Check for new multi-select format first
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
  }, [position, open]);

  // Get available percentiles with wage data
  const availablePercentiles = useMemo(() => {
    if (!position) return [];
    return getAvailablePercentiles(position);
  }, [position]);

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

  // Handle apply
  const handleApply = () => {
    if (!position) return;

    // Build the update payload
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
    onClose();
  };

  // Handle close
  const handleClose = () => {
    onClose();
  };

  // Check if selection is valid (at least one salary selected)
  const isValid = selectedSalaries.length > 0;

  if (!position) return null;

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title="Select Salaries"
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
      </div>

      {/* Scrollable content container */}
      <div className="max-h-[60vh] overflow-y-auto pr-1">
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
