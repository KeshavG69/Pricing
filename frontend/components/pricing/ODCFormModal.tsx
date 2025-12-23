'use client';

import { useState, useEffect, useMemo } from 'react';
import { ODCItem } from '@/types';

interface ODCFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (odc: Omit<ODCItem, 'id'>) => void;
  totalYears: number;
  existingODC?: ODCItem | null;
}

const ODC_CATEGORIES = ['Travel', 'Materials', 'Equipment', 'Other'] as const;

export const ODCFormModal = ({
  isOpen,
  onClose,
  onSave,
  totalYears,
  existingODC = null,
}: ODCFormModalProps) => {
  const [category, setCategory] = useState<string>('Travel');
  const [description, setDescription] = useState<string>('');
  const [amountsByYear, setAmountsByYear] = useState<Record<string, number>>({});
  const [escalate, setEscalate] = useState<boolean>(false);
  const [applyGAAdder, setApplyGAAdder] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form with existing ODC data if editing
  useEffect(() => {
    if (existingODC) {
      setCategory(existingODC.category);
      setDescription(existingODC.description || '');
      setAmountsByYear(existingODC.amount_per_year);
      setEscalate(existingODC.escalate);
      setApplyGAAdder(existingODC.apply_ga_adder);
    } else {
      // Initialize amounts for all years
      const initialAmounts: Record<string, number> = {};
      for (let year = 1; year <= totalYears; year++) {
        initialAmounts[year.toString()] = 0;
      }
      setAmountsByYear(initialAmounts);
    }
  }, [existingODC, totalYears, isOpen]);

  // Calculate total cost
  const totalCost = useMemo(() => {
    return Object.values(amountsByYear).reduce((sum, amount) => sum + (amount || 0), 0);
  }, [amountsByYear]);

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Category "Other" requires description
    if (category === 'Other' && !description.trim()) {
      newErrors.description = 'Description is required for "Other" category';
    }

    // Check if at least one year has amount > 0
    const hasAmount = Object.values(amountsByYear).some((amount) => amount > 0);
    if (!hasAmount) {
      newErrors.amounts = 'At least one year must have an amount greater than 0';
    }

    // Check if all amounts are >= 0
    const hasNegative = Object.values(amountsByYear).some((amount) => amount < 0);
    if (hasNegative) {
      newErrors.amounts = 'All amounts must be 0 or greater';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    const odcData: Omit<ODCItem, 'id'> = {
      category,
      description: description.trim() || undefined,
      amount_per_year: amountsByYear,
      escalate,
      apply_ga_adder: applyGAAdder,
    };

    onSave(odcData);
    handleClose();
  };

  const handleClose = () => {
    // Reset form
    setCategory('Travel');
    setDescription('');
    setAmountsByYear({});
    setEscalate(false);
    setApplyGAAdder(false);
    setErrors({});
    onClose();
  };

  const handleAmountChange = (year: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setAmountsByYear((prev) => ({
      ...prev,
      [year]: numValue,
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">
            {existingODC ? 'Edit' : 'Add'} Other Direct Cost
          </h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ODC_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Description {category === 'Other' && '*'}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description..."
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          {/* Amount per year */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Amount per Year *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: totalYears }, (_, i) => {
                const year = (i + 1).toString();
                const label = i === 0 ? 'Base Period' : `Option Year ${i}`;

                return (
                  <div key={year}>
                    <label className="block text-xs text-muted-foreground mb-1">
                      {label}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amountsByYear[year] || 0}
                        onChange={(e) => handleAmountChange(year, e.target.value)}
                        className="w-full pl-7 pr-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {errors.amounts && (
              <p className="mt-2 text-sm text-red-600">{errors.amounts}</p>
            )}
          </div>

          {/* Options */}
          <div className="space-y-3">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="escalate"
                checked={escalate}
                onChange={(e) => setEscalate(e.target.checked)}
                className="w-4 h-4 text-primary bg-background border-input rounded focus:ring-2 focus:ring-ring"
              />
              <label htmlFor="escalate" className="ml-2 text-sm text-muted-foreground">
                Apply escalation (year-over-year increase)
              </label>
            </div>
          </div>

          {/* Total cost display */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Base Total (before escalation/G&amp;A):
              </span>
              <span className="text-lg font-bold text-orange-600">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(totalCost)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted hover:bg-muted/80 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors"
          >
            {existingODC ? 'Save Changes' : 'Add ODC'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ODCFormModal;
