import { SpreadsheetPosition, AdvancedPosition } from '@/types';

/**
 * Get available percentiles (those with non-null wage values) for a position.
 * Used to filter dropdown options to only show valid percentiles.
 */
export const getAvailablePercentiles = (
  position: SpreadsheetPosition | AdvancedPosition
): Array<{value: '10th' | '25th' | '50th' | '75th' | '90th', wage: number}> => {
  const percentiles: Array<{value: '10th' | '25th' | '50th' | '75th' | '90th', wage: number}> = [];

  if (position.wage_10th != null) percentiles.push({value: '10th', wage: position.wage_10th});
  if (position.wage_25th != null) percentiles.push({value: '25th', wage: position.wage_25th});
  if (position.wage_50th != null) percentiles.push({value: '50th', wage: position.wage_50th});
  if (position.wage_75th != null) percentiles.push({value: '75th', wage: position.wage_75th});
  if (position.wage_90th != null) percentiles.push({value: '90th', wage: position.wage_90th});

  return percentiles;
};

/**
 * Get the current wage for a position based on the selected percentile.
 * Prioritizes custom_salary if manually entered.
 */
export const getCurrentWage = (position: SpreadsheetPosition | AdvancedPosition): number => {
  if (position.custom_salary) return position.custom_salary;

  // Use selected_wage if available
  if (position.selected_wage) return position.selected_wage;

  // Calculate from percentile
  if (position.percentile) {
    const cleanPercentile = position.percentile.replace(' (default)', '');
    const percentileKey = `wage_${cleanPercentile}` as keyof (SpreadsheetPosition | AdvancedPosition);
    const wage = position[percentileKey];
    if (typeof wage === 'number') return wage;
  }

  return 0;
};
