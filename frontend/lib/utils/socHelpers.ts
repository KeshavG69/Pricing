/**
 * Utility functions for SOC (Standard Occupational Classification) code formatting and handling
 */

/**
 * Format SOC code to consistent 6-digit display format without hyphen.
 *
 * Examples:
 * - "15-1252" → "151252"
 * - "151252" → "151252" (already formatted)
 * - null/undefined → "-"
 *
 * @param socCode - Raw SOC code (6 digits with or without hyphen)
 * @returns Formatted SOC code without hyphen (XXXXXX) or "-" if invalid
 */
export function formatSocCode(socCode: string | undefined | null): string {
  if (!socCode) return '-';

  // Remove any existing hyphens
  const clean = socCode.replace(/-/g, '');

  // Validate: must be 6 digits
  if (clean.length !== 6 || !/^\d{6}$/.test(clean)) {
    return socCode; // Return as-is if invalid format
  }

  // Return as 6-digit format without hyphen
  return clean;
}

/**
 * Normalize SOC code to 6-digit format without hyphen (for API calls/storage).
 *
 * Examples:
 * - "15-1252" → "151252"
 * - "151252" → "151252" (already normalized)
 *
 * @param socCode - SOC code with or without hyphen
 * @returns 6-digit SOC code without hyphen
 */
export function normalizeSocCode(socCode: string | undefined | null): string | null {
  if (!socCode) return null;

  // Remove hyphens
  const clean = socCode.replace(/-/g, '');

  // Validate: must be 6 digits
  if (clean.length !== 6 || !/^\d{6}$/.test(clean)) {
    return null;
  }

  return clean;
}
