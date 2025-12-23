import { SpreadsheetPosition, AdvancedPosition } from '@/types';

/**
 * Get the effective salary for a position, supporting multi-salary selection.
 *
 * Priority order:
 * 1. selected_salaries (averaged) - new multi-select approach
 * 2. custom_salary - legacy single custom amount
 * 3. wage based on percentile - BLS data
 * 4. selected_wage - fallback
 * 5. 0 - no data available
 *
 * @param position The position to get salary from
 * @returns The effective salary amount
 */
export function getEffectiveSalary(position: SpreadsheetPosition | AdvancedPosition): number {
  // New multi-select approach
  if (position.selected_salaries && position.selected_salaries.length > 0) {
    const sum = position.selected_salaries.reduce((acc, salary) => acc + salary, 0);
    return sum / position.selected_salaries.length;
  }

  // Backward compatibility: legacy custom_salary
  if (position.custom_salary) {
    return position.custom_salary;
  }

  // BLS wage based on percentile
  const percentileWage = position[`wage_${position.percentile}` as keyof typeof position];
  if (typeof percentileWage === 'number' && percentileWage > 0) {
    return percentileWage;
  }

  // Fallback to selected_wage (SpreadsheetPosition only)
  if ('selected_wage' in position && position.selected_wage) {
    return position.selected_wage;
  }

  return 0;
}

/**
 * Get count of selected salaries
 *
 * @param position The position to check
 * @returns Number of salaries selected (1 for legacy single selection)
 */
export function getSalarySelectionCount(position: SpreadsheetPosition | AdvancedPosition): number {
  if (position.selected_salaries && position.selected_salaries.length > 0) {
    return position.selected_salaries.length;
  }

  // Legacy mode - count as 1 if any salary is set
  if (position.custom_salary || position[`wage_${position.percentile}`]) {
    return 1;
  }

  return 0;
}

/**
 * Check if position is using multi-select mode
 *
 * @param position The position to check
 * @returns True if using multi-select, false if legacy single-select
 */
export function isMultiSelectMode(position: SpreadsheetPosition | AdvancedPosition): boolean {
  return !!(position.selected_salaries && position.selected_salaries.length > 0);
}

/**
 * Get display label for salary (e.g., "Avg (3)" or "75th" or "Custom")
 *
 * @param position The position to get label for
 * @returns Display label string
 */
export function getSalaryDisplayLabel(position: SpreadsheetPosition | AdvancedPosition): string {
  // Multi-select mode
  if (position.selected_salaries && position.selected_salaries.length > 1) {
    return `Avg (${position.selected_salaries.length})`;
  }

  if (position.selected_salaries && position.selected_salaries.length === 1) {
    // Single selection in new format - show source
    if (position.salary_sources?.percentiles.length === 1) {
      return position.salary_sources.percentiles[0];
    }
    if (position.salary_sources?.custom_amounts.length === 1) {
      return 'Custom';
    }
  }

  // Legacy single-select mode
  if (position.custom_salary) {
    return 'Custom';
  }

  return position.percentile;
}

/**
 * Get detailed breakdown of selected salaries for tooltip/display
 *
 * @param position The position to get breakdown for
 * @returns Array of salary source descriptions
 */
export function getSalaryBreakdown(position: SpreadsheetPosition | AdvancedPosition): Array<{ label: string; amount: number }> {
  const breakdown: Array<{ label: string; amount: number }> = [];

  if (position.selected_salaries && position.salary_sources) {
    // Add percentile salaries
    position.salary_sources.percentiles.forEach((percentile) => {
      const wage = position[`wage_${percentile}` as keyof typeof position];
      if (typeof wage === 'number') {
        breakdown.push({ label: `${percentile} percentile`, amount: wage });
      }
    });

    // Add custom amounts
    position.salary_sources.custom_amounts.forEach((amount, index) => {
      breakdown.push({ label: `Custom ${index + 1}`, amount });
    });
  } else if (position.custom_salary) {
    // Legacy custom salary
    breakdown.push({ label: 'Custom', amount: position.custom_salary });
  } else {
    // Legacy percentile
    const wage = position[`wage_${position.percentile}` as keyof typeof position];
    if (typeof wage === 'number') {
      breakdown.push({ label: `${position.percentile} percentile`, amount: wage });
    }
  }

  return breakdown;
}
