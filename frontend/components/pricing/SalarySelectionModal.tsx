'use client';

import { useState, useEffect } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SpreadsheetPosition, AdvancedPosition } from '@/types';
import { getAvailablePercentiles } from '@/lib/utils/percentileHelpers';
import { DollarSign, TrendingUp } from 'lucide-react';

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
  const [mode, setMode] = useState<'percentile' | 'custom'>('percentile');
  const [selectedPercentile, setSelectedPercentile] = useState<string>('');
  const [customAmount, setCustomAmount] = useState<string>('');

  // Initialize state when position changes
  useEffect(() => {
    if (position) {
      if (position.custom_salary) {
        setMode('custom');
        setCustomAmount(position.custom_salary.toString());
      } else {
        setMode('percentile');
        setSelectedPercentile(position.percentile);
      }
    }
  }, [position]);

  const handleApply = () => {
    if (!position) return;

    if (mode === 'percentile') {
      onUpdate({
        percentile: selectedPercentile as '10th' | '25th' | '50th' | '75th' | '90th',
        custom_salary: undefined,
      });
    } else {
      const amount = parseFloat(customAmount);
      if (!isNaN(amount) && amount > 0) {
        onUpdate({
          custom_salary: amount,
        });
      }
    }

    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  if (!position) return null;

  const availablePercentiles = getAvailablePercentiles(position);
  const currentDisplaySalary = position.custom_salary || position[`wage_${position.percentile}`] || ('selected_wage' in position ? position.selected_wage : 0) || 0;

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title="Select Salary"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleApply} variant="primary">
            Apply
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground mb-4">
        Position: <span className="text-foreground font-semibold">{position.labor_category}</span>
      </div>

      {/* Current Salary Display */}
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="w-4 h-4" />
            <span>Current Salary:</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-primary font-bold text-xl">
              ${currentDisplaySalary.toLocaleString()}
            </span>
            {position.custom_salary && (
              <span className="text-xs text-blue-600 bg-blue-600/10 px-2 py-0.5 rounded">Custom</span>
            )}
            {!position.custom_salary && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{position.percentile}</span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Selection Mode Tabs */}
        <div className="flex gap-2">
          <Button
            variant={mode === 'percentile' ? 'primary' : 'outline'}
            onClick={() => setMode('percentile')}
            className="flex-1"
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            BLS Percentile
          </Button>
          <Button
            variant={mode === 'custom' ? 'primary' : 'outline'}
            onClick={() => setMode('custom')}
            className="flex-1"
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Custom Amount
          </Button>
        </div>

        {/* Percentile Selection */}
        {mode === 'percentile' && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Select BLS Wage Percentile</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Choose a percentile based on experience level and market conditions
            </p>

            <div className="space-y-2">
              {availablePercentiles.map((p) => (
                <label
                  key={p.value}
                  className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedPercentile === p.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="percentile-selection"
                      value={p.value}
                      checked={selectedPercentile === p.value}
                      onChange={(e) => setSelectedPercentile(e.target.value)}
                      className="w-4 h-4 text-primary cursor-pointer"
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
              ))}
            </div>
          </Card>
        )}

        {/* Custom Amount Input */}
        {mode === 'custom' && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Enter Custom Salary</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Enter any annual salary amount that differs from BLS data
            </p>

            <div>
              <label className="block text-sm text-muted-foreground mb-2">Annual Salary</label>
              <div className="flex items-center gap-2">
                <span className="text-lg text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="e.g., 125000"
                  className="flex-1 text-lg"
                  min="0"
                  step="1000"
                  autoFocus={mode === 'custom'}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                This will override the BLS wage data for calculations
              </p>
            </div>

            {/* Quick amount buttons */}
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">Quick amounts:</p>
              <div className="grid grid-cols-3 gap-2">
                {[75000, 100000, 125000, 150000, 175000, 200000].map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    size="sm"
                    onClick={() => setCustomAmount(amount.toString())}
                    className="text-xs"
                  >
                    ${(amount / 1000).toFixed(0)}k
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </Dialog>
  );
};

export default SalarySelectionModal;
