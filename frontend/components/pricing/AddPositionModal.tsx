'use client';

import { useState, useEffect } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SpreadsheetPosition } from '@/types';
import { AlertCircle, Clock } from 'lucide-react';

interface AddPositionModalProps {
  open: boolean;
  onClose: () => void;
  positions: SpreadsheetPosition[];
  totalYears: number;
  onAdd: (positionData: Omit<SpreadsheetPosition, 'id'>) => void;
}

export const AddPositionModal = ({
  open,
  onClose,
  positions,
  totalYears,
  onAdd,
}: AddPositionModalProps) => {
  // Form state
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [laborCategory, setLaborCategory] = useState('');
  const [percentile, setPercentile] = useState<'25th' | '50th' | '75th' | '90th'>('50th');
  const [hoursPerYear, setHoursPerYear] = useState<Record<string, number>>({});
  const [customHourlyRate, setCustomHourlyRate] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize hours per year with default values
  useEffect(() => {
    if (open) {
      const defaultHours: Record<string, number> = {};
      for (let year = 1; year <= totalYears; year++) {
        defaultHours[year.toString()] = 0;
      }
      setHoursPerYear(defaultHours);
    }
  }, [open, totalYears]);

  // When existing position selected, pre-fill data
  useEffect(() => {
    if (mode === 'existing' && selectedPositionId) {
      const selectedPosition = positions.find((p) => p.id === selectedPositionId);
      if (selectedPosition) {
        setLaborCategory(selectedPosition.labor_category);
        // Only set percentile if it's a valid option for the modal (exclude 10th)
        // Strip " (default)" suffix from backend and check if valid
        const cleanPercentile = selectedPosition.percentile?.replace(' (default)', '');
        const validPercentile = cleanPercentile && ['25th', '50th', '75th', '90th'].includes(cleanPercentile)
          ? cleanPercentile
          : '50th';
        setPercentile(validPercentile as '25th' | '50th' | '75th' | '90th');
        // Don't pre-fill hours - let user enter them
      }
    }
  }, [mode, selectedPositionId, positions]);

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Labor category validation
    if (mode === 'new' && !laborCategory.trim()) {
      newErrors.laborCategory = 'Labor category is required';
    }
    if (mode === 'existing' && !selectedPositionId) {
      newErrors.position = 'Please select a position';
    }

    // Hours validation - at least one year must have hours > 0
    const totalHours = Object.values(hoursPerYear).reduce((sum, h) => sum + h, 0);
    if (totalHours === 0) {
      newErrors.hours = 'At least one year must have hours greater than 0';
    }

    // Check for negative hours
    Object.entries(hoursPerYear).forEach(([year, hours]) => {
      if (hours < 0) {
        newErrors[`hours_${year}`] = 'Hours cannot be negative';
      }
    });

    // Custom hourly rate validation (required for new positions)
    if (mode === 'new') {
      if (!customHourlyRate.trim()) {
        newErrors.customRate = 'Hourly rate is required';
      } else {
        const rate = parseFloat(customHourlyRate);
        if (isNaN(rate) || rate <= 0) {
          newErrors.customRate = 'Rate must be a positive number';
        } else if (rate < 10 || rate > 1000) {
          newErrors.customRate = 'Rate should be between $10 and $1000/hr';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    let positionData: Omit<SpreadsheetPosition, 'id'>;

    if (mode === 'existing') {
      // Find the selected position and copy its data
      const selectedPosition = positions.find((p) => p.id === selectedPositionId);
      if (!selectedPosition) {
        setErrors({ position: 'Selected position not found' });
        return;
      }

      positionData = {
        labor_category: selectedPosition.labor_category,
        experience: selectedPosition.experience,
        location: selectedPosition.location,
        soc_code: selectedPosition.soc_code,
        soc_title: selectedPosition.soc_title,
        percentile,
        hours_per_year: hoursPerYear,
        standard_fte_hours: selectedPosition.standard_fte_hours,
        wage_10th: selectedPosition.wage_10th,
        wage_25th: selectedPosition.wage_25th,
        wage_50th: selectedPosition.wage_50th,
        wage_75th: selectedPosition.wage_75th,
        wage_90th: selectedPosition.wage_90th,
      };
    } else {
      // Create new position with custom rate or default wage data
      const totalHours = Object.values(hoursPerYear).reduce((sum, h) => sum + h, 0);
      let wageData = {
        wage_10th: 0,
        wage_25th: 0,
        wage_50th: 0,
        wage_75th: 0,
        wage_90th: 0,
      };

      // If custom hourly rate provided, calculate annual wage
      if (customHourlyRate.trim()) {
        const hourlyRate = parseFloat(customHourlyRate);
        const annualWage = hourlyRate * totalHours;
        // Set all percentiles to the custom annual wage
        wageData = {
          wage_10th: annualWage,
          wage_25th: annualWage,
          wage_50th: annualWage,
          wage_75th: annualWage,
          wage_90th: annualWage,
        };
      }

      positionData = {
        labor_category: laborCategory.trim(),
        experience: undefined,
        location: undefined,
        soc_code: '',
        soc_title: '',
        percentile,
        hours_per_year: hoursPerYear,
        standard_fte_hours: 1880,
        ...wageData,
      };
    }

    onAdd(positionData);
    handleClose();
  };

  const handleClose = () => {
    setMode('existing');
    setSelectedPositionId('');
    setLaborCategory('');
    setPercentile('50th');
    setHoursPerYear({});
    setCustomHourlyRate('');
    setErrors({});
    onClose();
  };

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title="Add Position"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} variant="primary">
            Add Position
          </Button>
        </>
      }
    >
      <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
        {/* Section 1: Position Selection */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">1. Select Position</h3>

          <div className="flex gap-4 mb-4">
            <Button
              variant={mode === 'existing' ? 'primary' : 'outline'}
              onClick={() => setMode('existing')}
              className="flex-1"
            >
              Use Existing Position
            </Button>
            <Button
              variant={mode === 'new' ? 'primary' : 'outline'}
              onClick={() => setMode('new')}
              className="flex-1"
            >
              Create New Position
            </Button>
          </div>

          {mode === 'existing' ? (
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Position</label>
              {positions.length > 0 ? (
                <select
                  value={selectedPositionId}
                  onChange={(e) => {
                    setSelectedPositionId(e.target.value);
                    setErrors({ ...errors, position: '' });
                  }}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">-- Select a position --</option>
                  {positions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.labor_category}
                      {pos.soc_code ? ` (${pos.soc_code})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No existing positions available. Create a new one below.
                </p>
              )}
              {errors.position && (
                <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.position}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Labor Category Name</label>
              <Input
                value={laborCategory}
                onChange={(e) => {
                  setLaborCategory(e.target.value);
                  setErrors({ ...errors, laborCategory: '' });
                }}
                placeholder="e.g., Software Engineer, Project Manager"
                className="w-full"
              />
              {errors.laborCategory && (
                <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.laborCategory}
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Section 2: Hours Per Year */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">2. Allocate Hours Per Year</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Specify how many hours for each contract year
          </p>

          <div className="space-y-3">
            {Array.from({ length: totalYears }, (_, i) => i + 1).map((year) => {
              const yearStr = year.toString();
              const yearHours = hoursPerYear[yearStr] || 0;

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
                        value={yearHours === 0 ? '' : yearHours}
                        onChange={(e) => {
                          const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                          setHoursPerYear({ ...hoursPerYear, [yearStr]: value });
                          setErrors({ ...errors, [`hours_${yearStr}`]: '', hours: '' });
                        }}
                        className="w-32"
                        min={0}
                        placeholder="0"
                      />
                      <span className="text-sm text-muted-foreground">hours</span>
                    </div>
                    {errors[`hours_${yearStr}`] && (
                      <p className="text-sm text-red-600 mt-1">{errors[`hours_${yearStr}`]}</p>
                    )}
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

        {/* Section 3: Wage Configuration */}
        <Card className="p-4">
          {mode === 'existing' ? (
            <>
              <h3 className="text-sm font-semibold text-foreground mb-3">3. Select Wage Percentile</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Choose which wage percentile to use for calculations
              </p>

              <select
                value={percentile}
                onChange={(e) => setPercentile(e.target.value as typeof percentile)}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="25th">25th Percentile (Entry Level - {'<'} 3 years)</option>
                <option value="50th">50th Percentile (Mid Level - 3 to {'<'} 6 years)</option>
                <option value="75th">75th Percentile (Senior Level - ≥ 6 years)</option>
                <option value="90th">90th Percentile (Expert Level)</option>
              </select>
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-foreground mb-3">3. Set Hourly Rate</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Enter the hourly rate for this position
              </p>

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  value={customHourlyRate}
                  onChange={(e) => {
                    setCustomHourlyRate(e.target.value);
                    setErrors({ ...errors, customRate: '' });
                  }}
                  placeholder="e.g., 75.00"
                  className="w-40"
                  step="0.01"
                  min="0"
                />
                <span className="text-muted-foreground">/ hr</span>
              </div>
              {errors.customRate && (
                <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.customRate}
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </Dialog>
  );
};

export default AddPositionModal;
