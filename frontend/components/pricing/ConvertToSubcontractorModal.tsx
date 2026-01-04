'use client';

import { useState, useMemo } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { SpreadsheetPosition, AdvancedPosition } from '@/types';
import { AlertCircle, DollarSign, Clock } from 'lucide-react';

interface ConvertToSubcontractorModalProps {
  open: boolean;
  onClose: () => void;
  position: SpreadsheetPosition | AdvancedPosition | null;
}

export const ConvertToSubcontractorModal = ({
  open,
  onClose,
  position,
}: ConvertToSubcontractorModalProps) => {
  const { subcontractors, rates, totalYears, convertToSubcontractor } = usePricingStore();

  // Form state
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedSubcontractorId, setSelectedSubcontractorId] = useState<string>('');
  const [newSubcontractorName, setNewSubcontractorName] = useState<string>('');
  const [hoursAllocation, setHoursAllocation] = useState<Record<string, number>>({});
  const [customRate, setCustomRate] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Helper to check if position is AdvancedPosition
  const isAdvancedPosition = (pos: any): pos is AdvancedPosition => {
    return pos && 'breakdown' in pos;
  };

  // Helper to get hours_per_year from either position type
  const getHoursPerYear = (pos: SpreadsheetPosition | AdvancedPosition | null): Record<string, number> => {
    if (!pos) return {};

    if (isAdvancedPosition(pos)) {
      // Extract hours from breakdown
      const hours: Record<string, number> = {};
      Object.entries(pos.breakdown).forEach(([year, breakdown]) => {
        hours[year] = breakdown.hours;
      });
      return hours;
    }

    return pos.hours_per_year;
  };

  // Calculate suggested rate from FBLR
  const suggestedRate = useMemo(() => {
    if (!position) return 0;

    const hoursPerYear = getHoursPerYear(position);
    const totalHours = Object.values(hoursPerYear).reduce((sum, h) => sum + h, 0);

    if (totalHours === 0) return 0;

    // For AdvancedPosition, we can get FBLR directly from breakdown
    if (isAdvancedPosition(position)) {
      // Use the FBLR from first year's breakdown
      const firstYear = Object.keys(position.breakdown)[0];
      if (firstYear) {
        return Math.round(position.breakdown[firstYear].fblr * 100) / 100;
      }
    }

    // For SpreadsheetPosition, calculate FBLR
    const spreadsheetPos = position as SpreadsheetPosition;
    const selectedWage = spreadsheetPos[`wage_${spreadsheetPos.percentile}`] || spreadsheetPos.selected_wage || 0;

    // GSA: selected_wage is already hourly rate (use directly as FBLR)
    // BLS: selected_wage is annual salary (calculate FBLR from DL + overhead)
    if (spreadsheetPos.wage_source === 'gsa') {
      // GSA rate is already fully loaded hourly rate
      return Math.round(selectedWage * 100) / 100;
    }

    // BLS: Calculate FBLR from annual salary
    const dlRate = selectedWage / totalHours;
    const fringe = dlRate * rates.fringe;
    const oh = (dlRate + fringe) * rates.oh;
    const ga = (dlRate + fringe + oh) * rates.ga;
    const fee = (dlRate + fringe + oh + ga) * rates.fee;
    const fblr = dlRate + fringe + oh + ga + fee;

    return Math.round(fblr * 100) / 100; // Round to 2 decimals
  }, [position, rates]);

  // Initialize hours allocation when position changes
  useMemo(() => {
    if (position) {
      const hoursPerYear = getHoursPerYear(position);
      setHoursAllocation(hoursPerYear);
      setCustomRate(suggestedRate.toFixed(2));
    }
  }, [position, suggestedRate]);

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Subcontractor validation
    if (mode === 'existing' && !selectedSubcontractorId) {
      newErrors.subcontractor = 'Please select a subcontractor';
    }

    if (mode === 'new') {
      if (!newSubcontractorName.trim()) {
        newErrors.subcontractorName = 'Subcontractor name is required';
      } else if (newSubcontractorName.length > 100) {
        newErrors.subcontractorName = 'Name must be 100 characters or less';
      } else if (subcontractors.some((s) => s.name === newSubcontractorName.trim())) {
        newErrors.subcontractorName = 'A subcontractor with this name already exists';
      }
    }

    // Hours validation
    if (!position) {
      newErrors.general = 'Position not found';
    } else {
      const originalHoursPerYear = getHoursPerYear(position);
      let hasAnyHours = false;
      Object.entries(hoursAllocation).forEach(([year, hours]) => {
        const originalHours = originalHoursPerYear[year] || 0;
        if (hours < 0) {
          newErrors[`hours_${year}`] = 'Hours cannot be negative';
        } else if (hours > originalHours) {
          newErrors[`hours_${year}`] = `Cannot exceed ${originalHours} hours`;
        }
        if (hours > 0) hasAnyHours = true;
      });

      if (!hasAnyHours) {
        newErrors.hours = 'Must allocate at least some hours';
      }
    }

    // Rate validation
    const rateNum = parseFloat(customRate);
    if (isNaN(rateNum) || rateNum <= 0) {
      newErrors.rate = 'Rate must be a positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConvert = async () => {
    if (!validate() || !position) return;

    await convertToSubcontractor({
      positionId: position.id,
      subcontractorId: mode === 'existing' ? selectedSubcontractorId : undefined,
      newSubcontractorName: mode === 'new' ? newSubcontractorName.trim() : undefined,
      hoursAllocation,
      rate: parseFloat(customRate),
    });

    // Reset and close
    handleClose();
  };

  const handleClose = () => {
    setMode('existing');
    setSelectedSubcontractorId('');
    setNewSubcontractorName('');
    setHoursAllocation({});
    setCustomRate('');
    setErrors({});
    onClose();
  };

  if (!position) return null;

  const originalHoursPerYear = getHoursPerYear(position);

  // Calculate allocation percentage per year
  const allocationPercentages = Object.entries(hoursAllocation).reduce((acc, [year, hours]) => {
    const original = originalHoursPerYear[year] || 0;
    acc[year] = original > 0 ? (hours / original) * 100 : 0;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title="Convert Position to Subcontractor"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleConvert} variant="primary">
            Convert to Subcontractor
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground mb-4">
        Converting: <span className="text-foreground font-semibold">{position.labor_category}</span>
      </div>

      <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
          {/* Section 1: Subcontractor Selection */}
          <Card className="p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">1. Select Subcontractor</h3>

            <div className="flex gap-4 mb-4">
              <Button
                variant={mode === 'existing' ? 'primary' : 'outline'}
                onClick={() => setMode('existing')}
                className="flex-1"
              >
                Existing Subcontractor
              </Button>
              <Button
                variant={mode === 'new' ? 'primary' : 'outline'}
                onClick={() => setMode('new')}
                className="flex-1"
              >
                Create New
              </Button>
            </div>

            {mode === 'existing' ? (
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Subcontractor</label>
                {subcontractors.length > 0 ? (
                  <select
                    value={selectedSubcontractorId}
                    onChange={(e) => {
                      setSelectedSubcontractorId(e.target.value);
                      setErrors({ ...errors, subcontractor: '' });
                    }}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">-- Select a subcontractor --</option>
                    {subcontractors.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name} ({sub.positions.length} positions)
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No existing subcontractors. Create a new one below.</p>
                )}
                {errors.subcontractor && (
                  <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.subcontractor}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm text-muted-foreground mb-2">New Subcontractor Name</label>
                <Input
                  value={newSubcontractorName}
                  onChange={(e) => {
                    setNewSubcontractorName(e.target.value);
                    setErrors({ ...errors, subcontractorName: '' });
                  }}
                  placeholder="e.g., Acme Consulting LLC"
                  className="w-full"
                />
                {errors.subcontractorName && (
                  <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {errors.subcontractorName}
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Section 2: Hours Allocation */}
          <Card className="p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">2. Allocate Hours</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Specify how many hours to allocate to the subcontractor for each year
            </p>

            <div className="space-y-3">
              {Array.from({ length: totalYears }, (_, i) => i + 1).map((year) => {
                const yearStr = year.toString();
                const originalHours = originalHoursPerYear[yearStr] || 0;
                const allocatedHours = hoursAllocation[yearStr] || 0;
                const percentage = allocationPercentages[yearStr] || 0;

                return (
                  <div key={year} className="flex items-center gap-4">
                    <div className="w-32 text-sm text-muted-foreground">
                      {year === 1 ? 'Base Year' : `Option Year ${year - 1}`}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <Input
                          type="number"
                          value={allocatedHours}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            setHoursAllocation({ ...hoursAllocation, [yearStr]: value });
                            setErrors({ ...errors, [`hours_${yearStr}`]: '', hours: '' });
                          }}
                          className="w-32"
                          min={0}
                          max={originalHours}
                        />
                        <span className="text-sm text-muted-foreground">
                          / {originalHours.toLocaleString()} hrs
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                      {errors[`hours_${yearStr}`] && (
                        <p className="text-sm text-red-600 mt-1">{errors[`hours_${yearStr}`]}</p>
                      )}
                    </div>
                    <div className="w-16 text-right text-sm text-muted-foreground">
                      {percentage.toFixed(0)}%
                    </div>
                  </div>
                );
              })}
            </div>

            {errors.hours && (
              <p className="text-sm text-red-600 mt-3 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.hours}
              </p>
            )}
          </Card>

          {/* Section 3: Rate Configuration */}
          <Card className="p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">3. Set Hourly Rate</h3>

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">Suggested Rate:</span>
                <span className="text-primary font-bold text-lg">
                  ${suggestedRate.toFixed(2)}/hr
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Based on FBLR calculation (includes all overhead and fees)
              </p>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-2">Custom Hourly Rate ($)</label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={customRate}
                  onChange={(e) => {
                    setCustomRate(e.target.value);
                    setErrors({ ...errors, rate: '' });
                  }}
                  className="w-40"
                  step="0.01"
                  min="0"
                />
                <span className="text-muted-foreground">/ hr</span>
              </div>
              {errors.rate && (
                <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.rate}
                </p>
              )}
            </div>
          </Card>

        {/* Error summary */}
        {errors.general && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {errors.general}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default ConvertToSubcontractorModal;
