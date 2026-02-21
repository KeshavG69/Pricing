'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { SpreadsheetPosition, AdvancedPosition } from '@/types';
import { AlertCircle, DollarSign, Clock, ChevronDown, Building2, Check } from 'lucide-react';
import { getGSARateForYear } from '@/lib/utils/salaryHelpers';

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
  const { subcontractors, rates, totalYears, escalationRates, convertToSubcontractor } = usePricingStore();

  // Form state
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedSubcontractorId, setSelectedSubcontractorId] = useState<string>('');
  const [newSubcontractorName, setNewSubcontractorName] = useState<string>('');
  const [hoursAllocation, setHoursAllocation] = useState<Record<string, number>>({});
  const [customRate, setCustomRate] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Custom dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get selected subcontractor details
  const selectedSubcontractor = useMemo(() => {
    return subcontractors.find(s => s.id === selectedSubcontractorId);
  }, [subcontractors, selectedSubcontractorId]);

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

  // Calculate suggested BASE RATE by REVERSE CALCULATING from FBLR
  // FBLR (prime position) becomes Final Billable Rate, then we subtract Fee and S&MH to get Base Rate
  const suggestedRate = useMemo(() => {
    if (!position) return 0;

    const hoursPerYear = getHoursPerYear(position);
    const totalHours = Object.values(hoursPerYear).reduce((sum, h) => sum + h, 0);

    if (totalHours === 0) return 0;

    const feeRate = rates.sub_fee || rates.fee || 0.54;
    const smhRate = rates.smh || 0.43;

    console.log('[CONVERT_MODAL] ========== CALCULATING SUGGESTED RATE ==========');
    console.log('[CONVERT_MODAL] Fee rate:', feeRate, 'S&MH rate:', smhRate);
    console.log('[CONVERT_MODAL] Position labor_category:', position.labor_category);
    console.log('[CONVERT_MODAL] Position type:', isAdvancedPosition(position) ? 'AdvancedPosition' : 'SpreadsheetPosition');

    // For AdvancedPosition, get FBLR from breakdown
    if (isAdvancedPosition(position)) {
      console.log('[CONVERT_MODAL] AdvancedPosition detected - using breakdown');
      const firstYear = Object.keys(position.breakdown)[0];
      console.log('[CONVERT_MODAL] First year:', firstYear);
      console.log('[CONVERT_MODAL] All breakdown years:', Object.keys(position.breakdown));

      if (firstYear) {
        const yearBreakdown = position.breakdown[firstYear];
        console.log('[CONVERT_MODAL] Year breakdown:', yearBreakdown);

        const fblr = yearBreakdown.fblr;
        console.log('[CONVERT_MODAL] FBLR from breakdown:', fblr);

        // REVERSE: Base = FBLR / ((1 + Fee) × (1 + S&MH))
        const baseRate = fblr / ((1 + feeRate) * (1 + smhRate));
        console.log('[CONVERT_MODAL] Calculated base rate:', baseRate);
        console.log('[CONVERT_MODAL] ========================================');
        return Math.round(baseRate * 100) / 100;
      }
    }

    // For SpreadsheetPosition, calculate FBLR first, then reverse calculate
    const spreadsheetPos = position as SpreadsheetPosition;

    console.log('[CONVERT_MODAL] SpreadsheetPosition path detected');

    // Get selected wage - prioritize selected_wage, then calculate from percentile
    let selectedWage = spreadsheetPos.selected_wage || 0;
    if (!selectedWage && spreadsheetPos.percentile) {
      // Strip " (default)" suffix and get wage from percentile
      const cleanPercentile = spreadsheetPos.percentile.replace(' (default)', '');
      const percentileKey = `wage_${cleanPercentile}` as keyof SpreadsheetPosition;
      selectedWage = (spreadsheetPos[percentileKey] as number) || 0;
    }

    let fblr = 0;

    console.log('[CONVERT_MODAL] wage_source:', spreadsheetPos.wage_source);
    console.log('[CONVERT_MODAL] selected_wage:', selectedWage);

    // GSA: Use actual GSA rate (already fully loaded)
    if (spreadsheetPos.wage_source === 'gsa') {
      console.log('[CONVERT_MODAL] GSA position detected - fetching GSA data');
      console.log('[CONVERT_MODAL] gsa_rates_by_year:', spreadsheetPos.gsa_rates_by_year);
      console.log('[CONVERT_MODAL] gsa_current_year:', spreadsheetPos.gsa_current_year);
      console.log('[CONVERT_MODAL] gsa_custom_rate:', spreadsheetPos.gsa_custom_rate);
      console.log('[CONVERT_MODAL] gsa_discount_rate:', spreadsheetPos.gsa_discount_rate);

      // Get GSA rate for year 1 (base period)
      const gsaRate = getGSARateForYear(spreadsheetPos, 1, escalationRates);
      console.log('[CONVERT_MODAL] GSA rate from getGSARateForYear:', gsaRate);

      // Apply discount if set
      const discountRate = spreadsheetPos.gsa_discount_rate || 0;
      fblr = gsaRate * (1 - discountRate);
      console.log('[CONVERT_MODAL] Final FBLR after discount:', fblr);
    } else {
      // BLS: Calculate FBLR from annual salary
      const standard_fte_hours = spreadsheetPos.standard_fte_hours || 1880;
      const dlRate = selectedWage / standard_fte_hours;
      const fringe = dlRate * rates.fringe;
      const ohRate = spreadsheetPos.location_type === 'Off-Site'
        ? (rates.oh_offsite ?? rates.oh_onsite ?? 0.0711)
        : (rates.oh_onsite ?? rates.oh_offsite ?? 0.0711);
      const oh = (dlRate + fringe) * ohRate;
      const ga = (dlRate + fringe + oh) * rates.ga;
      const fee = (dlRate + fringe + oh + ga) * rates.fee;
      fblr = dlRate + fringe + oh + ga + fee;
    }

    // REVERSE: Base = FBLR / ((1 + Fee) × (1 + S&MH))
    const baseRate = fblr / ((1 + feeRate) * (1 + smhRate));

    console.log('[CONVERT_MODAL] Final baseRate:', baseRate);

    // Validation: Warn if rate seems suspiciously low (likely data corruption)
    if (baseRate > 0 && baseRate < 10) {
      console.warn(`[CONVERT_MODAL] ⚠️ WARNING: Calculated base rate is suspiciously low ($${baseRate}/hr)`);
      console.warn('[CONVERT_MODAL] This may indicate corrupted GSA data. Please check position data above.');
    }

    console.log('[CONVERT_MODAL] ========================================');

    return Math.round(baseRate * 100) / 100; // Round to 2 decimals
  }, [position, rates, escalationRates]);

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

    // Capture data before closing modal
    const conversionData = {
      positionId: position.id,
      subcontractorId: mode === 'existing' ? selectedSubcontractorId : undefined,
      newSubcontractorName: mode === 'new' ? newSubcontractorName.trim() : undefined,
      hoursAllocation,
      rate: parseFloat(customRate),
    };

    // Close modal immediately for better UX
    handleClose();

    // Then run conversion (backend save happens in background)
    await convertToSubcontractor(conversionData);
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
                  <div className="relative" ref={dropdownRef}>
                    {/* Dropdown Trigger */}
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className={`w-full px-3 py-2.5 bg-background border rounded-lg text-left flex items-center justify-between transition-all ${
                        dropdownOpen
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-input hover:border-muted-foreground/50'
                      } ${errors.subcontractor ? 'border-red-500' : ''}`}
                    >
                      {selectedSubcontractor ? (
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{selectedSubcontractor.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {selectedSubcontractor.positions.length} position{selectedSubcontractor.positions.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Select a subcontractor...</span>
                      )}
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown Menu */}
                    {dropdownOpen && (
                      <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
                        <div className="max-h-60 overflow-y-auto">
                          {subcontractors.map((sub) => (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => {
                                setSelectedSubcontractorId(sub.id);
                                setErrors({ ...errors, subcontractor: '' });
                                setDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2.5 flex items-center gap-3 hover:bg-muted/50 transition-colors ${
                                selectedSubcontractorId === sub.id ? 'bg-primary/5' : ''
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                selectedSubcontractorId === sub.id ? 'bg-primary/20' : 'bg-muted'
                              }`}>
                                <Building2 className={`w-4 h-4 ${
                                  selectedSubcontractorId === sub.id ? 'text-primary' : 'text-muted-foreground'
                                }`} />
                              </div>
                              <div className="flex-1 text-left">
                                <div className={`font-medium ${
                                  selectedSubcontractorId === sub.id ? 'text-primary' : 'text-foreground'
                                }`}>
                                  {sub.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {sub.positions.length} position{sub.positions.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                              {selectedSubcontractorId === sub.id && (
                                <Check className="w-4 h-4 text-primary" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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
                Calculated by removing Fee and S&MH from prime position FBLR
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
