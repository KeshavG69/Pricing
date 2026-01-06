'use client';

import { useState, useMemo, useEffect } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { usePricingStore } from '@/lib/stores/pricingStore';
import { AlertCircle, ArrowRight, Clock } from 'lucide-react';

interface TransferSubcontractorModalProps {
  open: boolean;
  onClose: () => void;
  // When lockSource is true, the source is fixed (opened from Subcontractor tab)
  // When false, user can select source from dropdown (opened from Prime Labor tab)
  lockSource?: boolean;
  // Pre-selected source when lockSource is true
  sourceSubcontractorId?: string;
  sourcePositionIndex?: number;
}

export const TransferSubcontractorModal = ({
  open,
  onClose,
  lockSource = false,
  sourceSubcontractorId,
  sourcePositionIndex,
}: TransferSubcontractorModalProps) => {
  const { subcontractors, totalYears, transferSubcontractorHours } = usePricingStore();

  // Source selection state (when lockSource is false)
  const [selectedSourceSubId, setSelectedSourceSubId] = useState<string>('');
  const [selectedSourcePosIndex, setSelectedSourcePosIndex] = useState<number>(-1);

  // Target selection state
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing');
  const [selectedTargetSubId, setSelectedTargetSubId] = useState<string>('');
  const [newSubcontractorName, setNewSubcontractorName] = useState<string>('');

  // Hours allocation state
  const [hoursAllocation, setHoursAllocation] = useState<Record<string, number>>({});

  // Errors state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Determine actual source values
  const actualSourceSubId = lockSource ? sourceSubcontractorId : selectedSourceSubId;
  const actualSourcePosIndex = lockSource ? sourcePositionIndex : selectedSourcePosIndex;

  // Get source subcontractor and position
  const sourceSubcontractor = useMemo(() => {
    return subcontractors.find(s => s.id === actualSourceSubId);
  }, [subcontractors, actualSourceSubId]);

  const sourcePosition = useMemo(() => {
    if (!sourceSubcontractor || actualSourcePosIndex === undefined || actualSourcePosIndex < 0) {
      return null;
    }
    return sourceSubcontractor.positions[actualSourcePosIndex];
  }, [sourceSubcontractor, actualSourcePosIndex]);

  // Available hours from source position
  const availableHours = useMemo(() => {
    if (!sourcePosition) return {};
    return sourcePosition.hours_per_year;
  }, [sourcePosition]);

  // Initialize state when modal opens or source changes
  useEffect(() => {
    if (open) {
      // Reset target state
      setTargetMode('existing');
      setSelectedTargetSubId('');
      setNewSubcontractorName('');
      setErrors({});

      // Reset hours allocation with empty values (placeholders)
      setHoursAllocation({});

      // If lockSource, use pre-selected source
      if (lockSource && sourceSubcontractorId !== undefined && sourcePositionIndex !== undefined) {
        setSelectedSourceSubId(sourceSubcontractorId);
        setSelectedSourcePosIndex(sourcePositionIndex);
      } else {
        setSelectedSourceSubId('');
        setSelectedSourcePosIndex(-1);
      }
    }
  }, [open, lockSource, sourceSubcontractorId, sourcePositionIndex]);

  // Get available target subcontractors (exclude source)
  const availableTargetSubs = useMemo(() => {
    return subcontractors.filter(s => s.id !== actualSourceSubId);
  }, [subcontractors, actualSourceSubId]);

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Source validation
    if (!sourcePosition) {
      newErrors.source = 'Please select a source position';
    }

    // Target validation
    if (targetMode === 'existing' && !selectedTargetSubId) {
      newErrors.target = 'Please select a target subcontractor';
    }

    if (targetMode === 'new') {
      if (!newSubcontractorName.trim()) {
        newErrors.targetName = 'Subcontractor name is required';
      } else if (newSubcontractorName.length > 100) {
        newErrors.targetName = 'Name must be 100 characters or less';
      } else if (subcontractors.some(s => s.name === newSubcontractorName.trim())) {
        newErrors.targetName = 'A subcontractor with this name already exists';
      }
    }

    // Hours validation
    let hasAnyHours = false;
    Object.entries(hoursAllocation).forEach(([year, hours]) => {
      const available = availableHours[year] || 0;
      if (hours < 0) {
        newErrors[`hours_${year}`] = 'Hours cannot be negative';
      } else if (hours > available) {
        newErrors[`hours_${year}`] = `Cannot exceed ${available} hours`;
      }
      if (hours > 0) hasAnyHours = true;
    });

    if (!hasAnyHours) {
      newErrors.hours = 'Must transfer at least some hours';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTransfer = async () => {
    if (!validate() || !sourcePosition || actualSourceSubId === undefined || actualSourcePosIndex === undefined) {
      return;
    }

    await transferSubcontractorHours({
      sourceSubcontractorId: actualSourceSubId,
      sourcePositionIndex: actualSourcePosIndex,
      targetSubcontractorId: targetMode === 'existing' ? selectedTargetSubId : undefined,
      newSubcontractorName: targetMode === 'new' ? newSubcontractorName.trim() : undefined,
      hoursAllocation,
    });

    handleClose();
  };

  const handleClose = () => {
    setSelectedSourceSubId('');
    setSelectedSourcePosIndex(-1);
    setTargetMode('existing');
    setSelectedTargetSubId('');
    setNewSubcontractorName('');
    setHoursAllocation({});
    setErrors({});
    onClose();
  };

  // Get positions for selected source subcontractor
  const sourcePositions = useMemo(() => {
    if (!selectedSourceSubId) return [];
    const sub = subcontractors.find(s => s.id === selectedSourceSubId);
    return sub?.positions || [];
  }, [subcontractors, selectedSourceSubId]);

  return (
    <Dialog
      isOpen={open}
      onClose={handleClose}
      title="Transfer Subcontractor Hours"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleTransfer} variant="primary">
            Transfer Hours
          </Button>
        </>
      }
    >
      <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
        {/* Section 1: Source Selection */}
        <Card className="p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">1. Source Position</h3>

          {lockSource && sourcePosition ? (
            // Fixed source display
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-sm">
                <span className="text-muted-foreground">From: </span>
                <span className="font-semibold text-foreground">{sourceSubcontractor?.name}</span>
              </div>
              <div className="text-sm mt-1">
                <span className="text-muted-foreground">Position: </span>
                <span className="font-semibold text-foreground">{sourcePosition.labor_category}</span>
              </div>
              <div className="text-sm mt-1">
                <span className="text-muted-foreground">Available: </span>
                <span className="text-foreground">
                  {Object.entries(availableHours).map(([year, hours]) => (
                    <span key={year} className="mr-3">
                      {year === '1' ? 'Base' : `Opt ${parseInt(year) - 1}`}: {hours.toLocaleString()}h
                    </span>
                  ))}
                </span>
              </div>
            </div>
          ) : (
            // Selectable source
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-muted-foreground mb-2">Source Subcontractor</label>
                <select
                  value={selectedSourceSubId}
                  onChange={(e) => {
                    setSelectedSourceSubId(e.target.value);
                    setSelectedSourcePosIndex(-1);
                    setErrors({ ...errors, source: '' });
                  }}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">-- Select subcontractor --</option>
                  {subcontractors.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} ({sub.positions.length} positions)
                    </option>
                  ))}
                </select>
              </div>

              {selectedSourceSubId && (
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">Source Position</label>
                  <select
                    value={selectedSourcePosIndex}
                    onChange={(e) => {
                      setSelectedSourcePosIndex(parseInt(e.target.value));
                      setErrors({ ...errors, source: '' });
                    }}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={-1}>-- Select position --</option>
                    {sourcePositions.map((pos, idx) => (
                      <option key={idx} value={idx}>
                        {pos.labor_category} (${pos.rate.toFixed(2)}/hr)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {errors.source && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.source}
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Arrow indicator */}
        <div className="flex justify-center">
          <ArrowRight className="w-6 h-6 text-muted-foreground" />
        </div>

        {/* Section 2: Target Selection */}
        <Card className="p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">2. Target Subcontractor</h3>

          <div className="flex gap-4 mb-4">
            <Button
              variant={targetMode === 'existing' ? 'primary' : 'outline'}
              onClick={() => setTargetMode('existing')}
              className="flex-1"
            >
              Existing Subcontractor
            </Button>
            <Button
              variant={targetMode === 'new' ? 'primary' : 'outline'}
              onClick={() => setTargetMode('new')}
              className="flex-1"
            >
              Create New
            </Button>
          </div>

          {targetMode === 'existing' ? (
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Target Subcontractor</label>
              {availableTargetSubs.length > 0 ? (
                <select
                  value={selectedTargetSubId}
                  onChange={(e) => {
                    setSelectedTargetSubId(e.target.value);
                    setErrors({ ...errors, target: '' });
                  }}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">-- Select target subcontractor --</option>
                  {availableTargetSubs.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} ({sub.positions.length} positions)
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No other subcontractors available. Create a new one below.
                </p>
              )}
              {errors.target && (
                <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.target}
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
                  setErrors({ ...errors, targetName: '' });
                }}
                placeholder="e.g., Acme Consulting LLC"
                className="w-full"
              />
              {errors.targetName && (
                <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.targetName}
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Section 3: Hours Allocation */}
        <Card className="p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">3. Hours to Transfer</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Specify how many hours to transfer for each year
          </p>

          <div className="space-y-3">
            {Array.from({ length: totalYears }, (_, i) => i + 1).map((year) => {
              const yearStr = year.toString();
              const available = availableHours[yearStr] || 0;
              const allocated = hoursAllocation[yearStr] || 0;
              const percentage = available > 0 ? (allocated / available) * 100 : 0;

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
                        value={allocated || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          setHoursAllocation({ ...hoursAllocation, [yearStr]: value });
                          setErrors({ ...errors, [`hours_${yearStr}`]: '', hours: '' });
                        }}
                        className="w-32"
                        min={0}
                        max={available}
                      />
                      <span className="text-sm text-muted-foreground">
                        / {available.toLocaleString()} hrs available
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

export default TransferSubcontractorModal;
