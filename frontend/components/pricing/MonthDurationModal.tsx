'use client';

import { useState, useEffect } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { AlertCircle, Calendar, RotateCcw } from 'lucide-react';

interface MonthDurationModalProps {
  open: boolean;
  onClose: () => void;
}

export const MonthDurationModal = ({
  open,
  onClose,
}: MonthDurationModalProps) => {
  const { monthsPerYear, totalYears, updateAllMonths } = usePricingStore();

  // Local state for editing
  const [localMonths, setLocalMonths] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize local state when modal opens
  useEffect(() => {
    if (open) {
      setLocalMonths({ ...monthsPerYear });
      setErrors({});
    }
  }, [open, monthsPerYear]);

  const handleMonthChange = (year: string, value: string) => {
    const numValue = parseInt(value, 10);

    // Validation
    if (isNaN(numValue) || numValue < 1 || numValue > 12) {
      setErrors((prev) => ({
        ...prev,
        [year]: 'Must be between 1 and 12',
      }));
    } else {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[year];
        return newErrors;
      });
    }

    setLocalMonths((prev) => ({
      ...prev,
      [year]: numValue,
    }));
  };

  const handleReset = () => {
    const defaultMonths: Record<string, number> = {};
    for (let i = 1; i <= totalYears; i++) {
      defaultMonths[i.toString()] = 12;
    }
    setLocalMonths(defaultMonths);
    setErrors({});
  };

  const handleSave = () => {
    // Check for errors
    if (Object.keys(errors).length > 0) {
      return;
    }

    // Update store
    updateAllMonths(localMonths);
    onClose();
  };

  const handleCancel = () => {
    setLocalMonths({ ...monthsPerYear });
    setErrors({});
    onClose();
  };

  // Calculate how many years have partial months (not 12)
  const partialYearsCount = Object.values(localMonths).filter((m) => m !== 12).length;

  const footer = (
    <>
      <Button variant="outline" onClick={handleReset} className="flex items-center gap-2 mr-auto">
        <RotateCcw className="w-4 h-4" />
        Reset All to 12
      </Button>
      <Button variant="outline" onClick={handleCancel}>
        Cancel
      </Button>
      <Button
        onClick={handleSave}
        disabled={Object.keys(errors).length > 0}
        className="bg-primary text-primary-foreground"
      >
        Save Changes
      </Button>
    </>
  );

  return (
    <Dialog
      isOpen={open}
      onClose={handleCancel}
      title="Month Durations"
      size="lg"
      footer={footer}
    >
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-semibold mb-1">How This Affects Calculations:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Escalation:</strong> Prorated automatically (e.g., 8 months = 8/12 × annual rate)
                </li>
                <li>
                  <strong>Hours:</strong> You control independently (not enforced by system)
                </li>
                <li>
                  <strong>FBLR:</strong> Recalculated based on prorated escalation
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mb-6 max-h-96 overflow-y-auto pr-2">
          <div className="space-y-3">
            {Array.from({ length: totalYears }, (_, i) => {
              const year = (i + 1).toString();
              const yearLabel = i === 0 ? 'Base Year' : `Option Year ${i}`;
              const months = localMonths[year] || 12;
              const hasError = !!errors[year];

              return (
                <Card key={year} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label
                        htmlFor={`month-${year}`}
                        className="block text-sm font-medium text-foreground mb-1"
                      >
                        {yearLabel}
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Year {year} contract period
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-24">
                        <Input
                          id={`month-${year}`}
                          type="number"
                          min="1"
                          max="12"
                          value={months}
                          onChange={(e) => handleMonthChange(year, e.target.value)}
                          className={hasError ? 'border-red-500' : ''}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-16">
                        months
                      </span>
                    </div>
                  </div>

                  {hasError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                      {errors[year]}
                    </p>
                  )}

                  {months !== 12 && !hasError && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                      ⚠️ Escalation will be prorated to {((months / 12) * 100).toFixed(1)}% of annual
                      rate
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {partialYearsCount > 0 && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>{partialYearsCount}</strong> year{partialYearsCount > 1 ? 's have' : ' has'}{' '}
              partial months (not 12)
            </p>
          </div>
        )}
    </Dialog>
  );
};
