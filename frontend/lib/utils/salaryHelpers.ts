import { SpreadsheetPosition, AdvancedPosition, IndirectRates } from '@/types';

/**
 * Check if position uses GSA rates (no indirect rates applied)
 *
 * @param position The position to check
 * @returns True if GSA position, false otherwise
 */
export function isGSAPosition(position: SpreadsheetPosition | AdvancedPosition): boolean {
  // Primary check: explicit wage_source field
  if (position.wage_source === 'gsa') {
    return true;
  }

  // Fallback: Check for GSA-specific data (for backward compatibility)
  // If position has gsa_rates_by_year and gsa_current_year, treat as GSA
  if (position.gsa_rates_by_year && Object.keys(position.gsa_rates_by_year).length > 0 && position.gsa_current_year) {
    return true;
  }

  return false;
}

/**
 * Reverse engineer GSA rate into FBLR components for display purposes.
 *
 * GSA rates are final "fully burdened" rates. To show a breakdown in the UI
 * (matching the BLS display format), we reverse-calculate what the DL rate
 * would be if the same indirect rates were applied.
 *
 * Forward formula (BLS):
 *   FBLR = DL × (1 + fringe) × (1 + oh) × (1 + ga) × (1 + fee)
 *
 * Reverse formula (GSA):
 *   DL = GSA_Rate / [(1 + fringe) × (1 + oh) × (1 + ga) × (1 + fee)]
 *
 * Then apply the cascade forward to get individual components.
 *
 * NOTE: This is PURELY for display/presentation. The actual GSA rate is used
 * directly in cost calculations without any indirect rates.
 *
 * @param gsaRate The GSA hourly rate (final FBLR)
 * @param rates The indirect rates to use for reverse engineering
 * @param locationType Optional 'On-Site' | 'Off-Site' — picks oh_onsite vs oh_offsite
 *                     to match how BLS positions present OH. Defaults to On-Site.
 * @returns Breakdown object with dl_rate, fringe, oh, ga, fee, and fblr
 */
export function reverseEngineerGSARate(
  gsaRate: number,
  rates: IndirectRates,
  locationType?: string
): {
  dlRate: number;
  fringe: number;
  oh: number;
  ga: number;
  fee: number;
  fblr: number;
} {
  // Pick OH rate based on location_type to match BLS breakdown behavior.
  // Fallback chain: location-specific rate → opposite rate → legacy oh → default
  const ohOnsite = rates.oh_onsite ?? rates.oh_offsite ?? rates.oh ?? 0.0711;
  const ohOffsite = rates.oh_offsite ?? rates.oh_onsite ?? rates.oh ?? 0.0711;
  const locType = locationType || 'On-Site';
  const ohRate = locType === 'On-Site' ? ohOnsite : ohOffsite;

  console.log(`[REVERSE_ENGINEER_GSA] Input: gsaRate=${gsaRate}, fringe=${rates.fringe}, oh_onsite=${rates.oh_onsite}, oh_offsite=${rates.oh_offsite}, ohRate=${ohRate}, ga=${rates.ga}, fee=${rates.fee}`);

  // Calculate the total multiplier from all indirect rates
  const multiplier =
    (1 + rates.fringe) *
    (1 + ohRate) *
    (1 + rates.ga) *
    (1 + rates.fee);

  console.log(`[REVERSE_ENGINEER_GSA] Multiplier: ${multiplier}`);

  // Reverse engineer the DL rate
  const dlRate = gsaRate / multiplier;
  console.log(`[REVERSE_ENGINEER_GSA] DL Rate: ${dlRate}`);

  // Apply the BLS cascade forward to get individual components
  const fringe = dlRate * rates.fringe;
  const subtotal_1 = dlRate + fringe;

  const oh = subtotal_1 * ohRate;
  const subtotal_2 = subtotal_1 + oh;

  const ga = subtotal_2 * rates.ga;
  const subtotal_3 = subtotal_2 + ga;

  const fee = subtotal_3 * rates.fee;

  const fblr = subtotal_3 + fee;

  return {
    dlRate,
    fringe,
    oh,
    ga,
    fee,
    fblr, // Should approximately equal gsaRate (may have small rounding differences)
  };
}

/**
 * Get GSA rate for a specific proposal year, mapping to the correct contract year.
 *
 * If a custom rate is set (gsa_custom_rate), it overrides GSA rates for all years.
 *
 * Contract year mapping:
 * - Proposal Year 1 → Contract Year (gsa_current_year)
 * - Proposal Year 2 → Contract Year (gsa_current_year + 1)
 * - etc.
 *
 * @param position The GSA position
 * @param proposalYear The proposal year (1-based)
 * @returns The GSA hourly rate for that year, or 0 if not found
 */
export function getGSARateForYear(
  position: SpreadsheetPosition | AdvancedPosition,
  proposalYear: number,
  escalationRates?: Record<string, number | undefined>
): number {
  // Custom rate overrides all years (null/undefined means "not set"; 0 is a valid rate)
  if (position.gsa_custom_rate != null) {
    return position.gsa_custom_rate;
  }

  if (!position.gsa_rates_by_year) {
    return 0;
  }

  const currentGsaYear = position.gsa_current_year || 1;
  const contractYear = currentGsaYear + (proposalYear - 1);
  const rate = position.gsa_rates_by_year[String(contractYear)];

  if (rate) {
    return rate;
  }

  // Fallback: if contract year not found, try to find the nearest available year
  const availableYears = Object.keys(position.gsa_rates_by_year)
    .map(Number)
    .filter((y) => !isNaN(y))
    .sort((a, b) => a - b);

  if (availableYears.length === 0) {
    return 0;
  }

  // Use the last available year if we're past the contract period
  if (contractYear > Math.max(...availableYears)) {
    const lastAvailableYear = Math.max(...availableYears);
    const lastAvailableRate = position.gsa_rates_by_year[String(lastAvailableYear)] || 0;

    // If no escalation rates provided, return last year's rate (backward compatibility)
    if (!escalationRates) {
      return lastAvailableRate;
    }

    // Apply compound escalation from last available year to target contract year
    // Map contract years to proposal years for escalation lookup
    let escalatedRate = lastAvailableRate;
    const lastProposalYear = lastAvailableYear - currentGsaYear + 1;

    for (let year = lastAvailableYear; year < contractYear; year++) {
      // Calculate corresponding proposal year transition
      const proposalYear = year - currentGsaYear + 1;
      const nextProposalYear = proposalYear + 1;
      const escKey = `${proposalYear}_to_${nextProposalYear}`;
      const escRate = escalationRates[escKey] || 0;
      escalatedRate *= (1 + escRate);
    }

    return escalatedRate;
  }

  // Use the first available year if we're before
  return position.gsa_rates_by_year[String(Math.min(...availableYears))] || 0;
}

/**
 * Get the effective salary for a position, supporting multi-salary selection.
 *
 * Priority order (for BLS positions):
 * 1. selected_salaries (averaged) - new multi-select approach
 * 2. custom_salary - legacy single custom amount
 * 3. wage based on percentile - BLS data
 * 4. selected_wage - fallback
 * 5. 0 - no data available
 *
 * For GSA positions:
 * Returns the year 1 GSA rate (for display purposes).
 * Use getGSARateForYear() for actual calculations.
 *
 * @param position The position to get salary from
 * @returns The effective salary amount (hourly for GSA, annual for BLS)
 */
export function getEffectiveSalary(position: SpreadsheetPosition | AdvancedPosition): number {
  // GSA positions use gsa_rates_by_year (returns hourly rate for year 1)
  if (isGSAPosition(position)) {
    return getGSARateForYear(position, 1);
  }

  // New multi-select approach (BLS)
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
  if (position.custom_salary || position.selected_wage) {
    return 1;
  }

  // Check percentile wage
  if (position.percentile) {
    const cleanPercentile = position.percentile.replace(' (default)', '');
    const percentileKey = `wage_${cleanPercentile}` as keyof (SpreadsheetPosition | AdvancedPosition);
    const wage = position[percentileKey];
    if (typeof wage === 'number' && wage > 0) {
      return 1;
    }
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
 * Get display label for salary (e.g., "Avg (3)" or "75th" or "Custom" or "GSA")
 *
 * @param position The position to get label for
 * @returns Display label string
 */
export function getSalaryDisplayLabel(position: SpreadsheetPosition | AdvancedPosition): string {
  // GSA positions show "GSA" or "Custom" label
  if (isGSAPosition(position)) {
    if (position.gsa_custom_rate != null) {
      return 'Custom';
    }
    return 'GSA';
  }

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

  // Return percentile (strip " (default)" suffix) or default to 50th
  return position.percentile?.replace(' (default)', '') || '50th';
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
