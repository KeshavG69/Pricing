'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SpreadsheetPosition, AdvancedPosition } from '@/types';
import { getAvailablePercentiles } from '@/lib/utils/percentileHelpers';
import { isGSAPosition, getGSARateForYear } from '@/lib/utils/salaryHelpers';
import { Plus, X, Building2 } from 'lucide-react';
import { usePricingStore } from '@/lib/stores/pricingStore';

type PercentileValue = '10th' | '25th' | '50th' | '75th' | '90th';

interface SalaryContextMenuProps {
  x: number;
  y: number;
  position: SpreadsheetPosition | AdvancedPosition;
  onClose: () => void;
  onApply: (updates: Partial<SpreadsheetPosition | AdvancedPosition>) => void;
  onOpenModal: () => void; // To open the full modal for adding custom amounts
}

export const SalaryContextMenu = ({
  x,
  y,
  position,
  onClose,
  onApply,
  onOpenModal,
}: SalaryContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const totalYears = usePricingStore((state) => state.totalYears);

  // Check if GSA position
  const isGSA = isGSAPosition(position);

  // Multi-select state (BLS mode)
  const [selectedPercentiles, setSelectedPercentiles] = useState<PercentileValue[]>([]);
  const [customAmounts, setCustomAmounts] = useState<number[]>([]);

  // GSA state
  const [gsaCurrentYear, setGsaCurrentYear] = useState<number>(1);
  const [gsaCustomRate, setGsaCustomRate] = useState<number | null>(null);

  // Initialize state from position
  useEffect(() => {
    if (isGSA) {
      // GSA mode
      if (position.gsa_current_year) {
        setGsaCurrentYear(position.gsa_current_year);
      } else if (position.gsa_rates_by_year) {
        const years = Object.keys(position.gsa_rates_by_year)
          .map(Number)
          .filter((y) => !isNaN(y))
          .sort((a, b) => a - b);
        setGsaCurrentYear(years[0] || 1);
      }
      setGsaCustomRate(position.gsa_custom_rate || null);
    } else {
      // BLS mode
      if (position.salary_sources) {
        setSelectedPercentiles([...position.salary_sources.percentiles]);
        setCustomAmounts([...position.salary_sources.custom_amounts]);
      } else if (position.custom_salary) {
        setSelectedPercentiles([]);
        setCustomAmounts([position.custom_salary]);
      } else {
        setSelectedPercentiles([position.percentile]);
        setCustomAmounts([]);
      }
    }
  }, [position, isGSA]);

  // Get available percentiles (BLS mode)
  const availablePercentiles = useMemo(() => {
    if (isGSA) return [];
    return getAvailablePercentiles(position);
  }, [position, isGSA]);

  // Get available contract years (GSA mode)
  const availableContractYears = useMemo(() => {
    if (!isGSA || !position.gsa_rates_by_year) return [];
    return Object.keys(position.gsa_rates_by_year)
      .map(Number)
      .filter((y) => !isNaN(y))
      .sort((a, b) => a - b);
  }, [position, isGSA]);

  // Calculate selected salaries and average
  const { selectedSalaries, averageSalary } = useMemo(() => {
    const salaries: number[] = [];

    selectedPercentiles.forEach((p) => {
      const wage = position[`wage_${p}` as keyof typeof position];
      if (typeof wage === 'number' && wage > 0) {
        salaries.push(wage);
      }
    });

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

  // Toggle percentile
  const togglePercentile = (percentile: PercentileValue) => {
    setSelectedPercentiles((prev) => {
      if (prev.includes(percentile)) {
        return prev.filter((p) => p !== percentile);
      }
      return [...prev, percentile];
    });
  };

  // Remove custom amount
  const removeCustomAmount = (index: number) => {
    setCustomAmounts((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle apply
  const handleApply = () => {
    if (isGSA) {
      // GSA mode - use null to explicitly clear custom rate
      const updates: Partial<SpreadsheetPosition | AdvancedPosition> = {
        gsa_current_year: gsaCurrentYear,
        gsa_custom_rate: gsaCustomRate, // null will clear, number will set
      };
      onApply(updates);
    } else {
      // BLS mode
      const updates: Partial<SpreadsheetPosition | AdvancedPosition> = {
        selected_salaries: selectedSalaries,
        salary_sources: {
          percentiles: selectedPercentiles,
          custom_amounts: customAmounts,
        },
        percentile: selectedPercentiles[0] || position.percentile,
        custom_salary: undefined,
      };
      onApply(updates);
    }
    onClose();
  };

  // Check if valid
  const isValid = isGSA ? gsaCurrentYear > 0 : selectedSalaries.length > 0;

  // Position calculation
  const getPosition = () => {
    if (!menuRef.current) return { x, y };

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 10;
    }
    if (y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 10;
    }

    return { x: Math.max(10, adjustedX), y: Math.max(10, adjustedY) };
  };

  const menuPosition = menuRef.current ? getPosition() : { x, y };

  // Close handlers
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Get current GSA rate (with custom override)
  const currentGSARate = gsaCustomRate || (position.gsa_rates_by_year?.[String(gsaCurrentYear)] || 0);

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-[320px] rounded-lg border border-border bg-popover shadow-xl text-popover-foreground"
      style={{
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
      }}
    >
      {isGSA ? (
        /* ========== GSA MODE ========== */
        <>
          {/* Header with current rate */}
          <div className={`px-3 py-2 border-b border-border ${gsaCustomRate ? 'bg-blue-50 dark:bg-blue-950/20' : 'bg-green-50 dark:bg-green-950/20'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className={`w-3 h-3 ${gsaCustomRate ? 'text-blue-600' : 'text-green-700'}`} />
                <span>Year 1 Rate:</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${gsaCustomRate ? 'text-blue-600' : 'text-green-700'}`}>
                  ${currentGSARate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${gsaCustomRate ? 'text-blue-600 bg-blue-600/10' : 'text-green-700 bg-green-700/10'}`}>
                  {gsaCustomRate ? 'Custom' : 'GSA'}
                </span>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div className="py-1 max-h-[250px] overflow-y-auto">
            {/* Custom rate display when set */}
            {gsaCustomRate && (
              <>
                <div className="w-full px-3 py-2 flex items-center justify-between bg-blue-50 dark:bg-blue-950/20">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold">✓</span>
                    </div>
                    <span className="text-sm text-foreground">Custom Rate</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-mono text-blue-600">
                      ${gsaCustomRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr
                    </span>
                    <button
                      onClick={() => {
                        // Clear custom rate and apply immediately
                        onApply({
                          gsa_current_year: gsaCurrentYear,
                          gsa_custom_rate: null,
                        });
                        onClose();
                      }}
                      className="p-0.5 hover:bg-red-100 rounded text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="border-t border-border my-1" />
              </>
            )}

            {/* Contract year selection - always visible */}
            <div className="px-3 py-1 text-xs text-muted-foreground">
              {gsaCustomRate ? 'Or use GSA rates:' : 'Contract Year → Year 1'}
            </div>
            {availableContractYears.map((year) => {
              const isSelected = !gsaCustomRate && gsaCurrentYear === year;
              const rate = position.gsa_rates_by_year?.[String(year)] || 0;
              return (
                <button
                  key={year}
                  onClick={() => {
                    // Apply immediately on selection
                    onApply({
                      gsa_current_year: year,
                      gsa_custom_rate: null, // Clear custom rate when selecting GSA year
                    });
                    onClose();
                  }}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors ${
                    isSelected ? 'bg-green-100 dark:bg-green-950/30' : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-4 h-4 text-green-700 cursor-pointer"
                    />
                    <span className="text-sm text-foreground">Year {year}</span>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">
                    ${rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/hr
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom rate input */}
          <div className="border-t border-border px-3 py-2 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-2">Custom Rate:</div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                placeholder="Enter rate..."
                className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:border-blue-500"
                min="0"
                step="0.01"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = parseFloat((e.target as HTMLInputElement).value);
                    if (!isNaN(value) && value > 0) {
                      onApply({
                        gsa_current_year: gsaCurrentYear,
                        gsa_custom_rate: value,
                      });
                      onClose();
                    }
                  }
                }}
                id="gsa-custom-rate-input"
              />
              <span className="text-xs text-muted-foreground">/hr</span>
              <button
                onClick={() => {
                  const input = document.getElementById('gsa-custom-rate-input') as HTMLInputElement;
                  const value = parseFloat(input?.value || '0');
                  if (!isNaN(value) && value > 0) {
                    onApply({
                      gsa_current_year: gsaCurrentYear,
                      gsa_custom_rate: value,
                    });
                    onClose();
                  }
                }}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Set
              </button>
            </div>
          </div>
        </>
      ) : (
        /* ========== BLS MODE ========== */
        <>
          {/* Header with average */}
          <div className={`px-3 py-2 border-b border-border ${selectedSalaries.length > 1 ? 'bg-purple-50 dark:bg-purple-950/20' : 'bg-muted/50'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedSalaries.length > 1 ? 'Average:' : 'Selected:'}
              </span>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${selectedSalaries.length > 1 ? 'text-purple-600 dark:text-purple-400' : 'text-foreground'}`}>
                  ${averageSalary.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                {selectedSalaries.length > 1 && (
                  <span className="text-xs text-purple-600 bg-purple-600/10 px-1.5 py-0.5 rounded">
                    {selectedSalaries.length}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Percentile checkboxes */}
          <div className="py-1 max-h-[250px] overflow-y-auto">
            {availablePercentiles.map((p) => {
              const isSelected = selectedPercentiles.includes(p.value as PercentileValue);
              return (
                <button
                  key={p.value}
                  onClick={() => togglePercentile(p.value as PercentileValue)}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors ${
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-primary cursor-pointer"
                    />
                    <span className="text-sm text-foreground">{p.value}</span>
                  </div>
                  <span className="text-sm font-mono text-muted-foreground">
                    ${p.wage.toLocaleString()}
                  </span>
                </button>
              );
            })}

            {/* Divider if custom amounts exist */}
            {customAmounts.length > 0 && (
              <div className="border-t border-border my-1" />
            )}

            {/* Custom amounts */}
            {customAmounts.map((amount, index) => (
              <div
                key={`custom-${index}`}
                className="w-full px-3 py-2 flex items-center justify-between bg-blue-50 dark:bg-blue-950/20"
              >
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">✓</span>
                  </div>
                  <span className="text-sm text-foreground">Custom</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-mono text-blue-600">
                    ${amount.toLocaleString()}
                  </span>
                  <button
                    onClick={() => removeCustomAmount(index)}
                    className="p-0.5 hover:bg-red-100 rounded text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer with actions */}
          <div className="border-t border-border px-3 py-2 flex items-center justify-between bg-muted/30">
            <button
              onClick={() => {
                onOpenModal();
                onClose();
              }}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add Custom...
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={!isValid}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  isValid
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(menu, document.body) : null;
};

export default SalaryContextMenu;
