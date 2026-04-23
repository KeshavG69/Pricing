import { create } from 'zustand';
import { debounce } from 'lodash-es';
import {
  SpreadsheetPosition,
  Subcontractor,
  TravelItem,
  ODCItem,
  Extension,
  SurgeOption,
  IndirectRates,
  EscalationRates,
  JobPosition,
  AdvancedPosition,
  Aggregates,
  ConversionData,
  SubcontractorPosition,
  Proposal,
  WageSource,
} from '@/types';
import { pricingApi } from '../api/pricing';
import { proposalsApi } from '../api/proposals';
import { useOrganizationStore } from './organizationStore';
import { getEffectiveSalary, isGSAPosition, getGSARateForYear, reverseEngineerGSARate } from '../utils/salaryHelpers';
import { trackHubSpotEvent } from '../utils/hubspot';

interface PricingState {
  // Data
  proposalId: string | null;
  proposalName: string;
  solicitationNumber?: string;
  primeContractorName: string;
  dcaaContact: string;
  positions: SpreadsheetPosition[];
  subcontractors: Subcontractor[];
  travel: TravelItem[];
  odcs: ODCItem[];
  extensions: Extension[];  // Extension periods beyond regular contract years
  surge: SurgeOption | null;  // NEW: Surge option (Scenario 2: percentage-based)
  rates: IndirectRates;
  escalationRates: EscalationRates;
  wageSource: WageSource;  // BLS or GSA wage source configuration

  // Metadata
  totalYears: number;
  baseYears: number;
  optionYears: number;
  monthsPerYear: Record<string, number>;
  isDirty: boolean;
  isRecalculating: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  error: string | null;

  // Advanced mode state
  advancedMode: boolean;
  subcontractorConfigured: boolean;  // Track if questionnaire was completed
  positionsAdvanced: AdvancedPosition[];
  expandedPositions: Set<string>;
  manualOverrides: Map<string, Set<string>>;
  aggregates: Aggregates;
  ratesReferenceExpanded: boolean;
  advancedModeVersion: number; // Force re-render counter
  activeTab: 'files' | 'overview' | 'main' | 'subcontractors' | 'wage-data';
  savedScrollPosition: { top: number; left: number } | null;  // For scroll preservation

  // Actions
  loadProposal: (proposalId: string, existingProposal?: Proposal) => Promise<void>;
  updatePosition: (id: string, updates: Partial<SpreadsheetPosition>, options?: { skipWageSync?: boolean }) => void;
  getWageSyncInfo: (id: string, updates: Partial<SpreadsheetPosition>) => { willSync: boolean; matchingCount: number; laborCategory: string | null };
  addPosition: (position: Omit<SpreadsheetPosition, 'id'>) => void;
  deletePosition: (id: string) => void;
  addSubcontractor: (subcontractor: Omit<Subcontractor, 'id'>) => void;
  deleteSubcontractor: (id: string) => void;
  renameSubcontractor: (id: string, newName: string) => void;
  deleteSubcontractorPosition: (subId: string, posIndex: number) => void;
  updateSubcontractorPosition: (subId: string, posIndex: number, updates: Partial<SubcontractorPosition>) => void;
  getLinkedSubcontractorPosition: (positionId: string) => { subId: string; posIndex: number; subPos: SubcontractorPosition } | null;
  updateLinkedBaseRate: (positionId: string, newBaseRate: number) => void;
  transferSubcontractorHours: (data: {
    sourceSubcontractorId: string;
    sourcePositionIndex: number;
    targetSubcontractorId?: string;
    newSubcontractorName?: string;
    hoursAllocation: Record<string, number>;
  }) => Promise<void>;
  convertToSubcontractor: (data: ConversionData) => Promise<void>;
  addTravel: (travel: Omit<TravelItem, 'id'>) => void;
  updateTravel: (id: string, updates: Partial<TravelItem>) => void;
  deleteTravel: (id: string) => void;
  addODC: (odc: Omit<ODCItem, 'id'>) => void;
  updateODC: (id: string, updates: Partial<ODCItem>) => void;
  deleteODC: (id: string) => void;
  updateRates: (rates: Partial<IndirectRates>) => void;
  updateEscalationRates: (rates: Partial<EscalationRates>) => void;
  updateMonthsForYear: (year: string, months: number) => void;
  updateAllMonths: (monthsPerYear: Record<string, number>) => void;
  updatePrimeContractorName: (name: string) => void;
  recalculate: () => Promise<void>;
  exportToExcel: (overrides?: { primeContractorName?: string }) => Promise<void>;
  saveProposal: () => Promise<{ success: boolean; error?: string }>;
  reset: () => void;

  // Advanced mode actions
  enableAdvancedMode: () => void;
  disableAdvancedMode: () => void;
  transformToAdvanced: () => void;
  updateAdvancedPosition: (id: string, updates: Partial<AdvancedPosition>) => void;
  togglePositionExpansion: (id: string) => void;
  addManualOverride: (positionId: string, field: string) => void;
  clearManualOverrides: (positionId?: string) => void;
  recalculateAdvanced: () => Promise<void>;
  toggleRatesReference: () => void;
  setActiveTab: (tab: 'files' | 'overview' | 'main' | 'subcontractors' | 'wage-data') => void;
  preCreateSubcontractors: (subs: { name: string }[]) => void;
  autoAllocateWorkshare: () => Promise<void>;
  assignPositionToContractor: (positionId: string, subcontractorId: string | null) => Promise<void>;
  saveScrollPosition: (position: { top: number; left: number }) => void;
  restoreScrollPosition: () => { top: number; left: number } | null;
}

// Helper to check if a position is a key position (cannot be auto-allocated to subcontractors)
// Uses fuzzy matching for PM/FA variations
const isKeyPosition = (position: { is_key_position?: boolean; labor_category: string }): boolean => {
  // Check if LLM flagged it as key during document parsing
  if (position.is_key_position) {
    return true;
  }

  // Fallback: fuzzy check labor category for PM/FA variations (case-insensitive)
  const lc = position.labor_category.toLowerCase();

  // Program Manager variations: PM, Prog Manager, Program Mgr, etc.
  const pmPatterns = [
    'program manager',
    'program mgr',
    'prog manager',
    'prog mgr',
    'programme manager',  // British spelling
    /\bpm\b/,  // "PM" as standalone word (e.g., "Senior PM", "PM III")
    /\bp\.?m\.?\b/,  // "P.M." or "P.M"
  ];

  // Financial Analyst variations: FA, Finance Analyst, etc.
  const faPatterns = [
    'financial analyst',
    'finance analyst',
    'financial anlyst',  // Common typo
    /\bfa\b/,  // "FA" as standalone word
    /\bf\.?a\.?\b/,  // "F.A." or "F.A"
  ];

  // Check PM patterns
  for (const pattern of pmPatterns) {
    if (typeof pattern === 'string') {
      if (lc.includes(pattern)) return true;
    } else {
      if (pattern.test(lc)) return true;
    }
  }

  // Check FA patterns
  for (const pattern of faPatterns) {
    if (typeof pattern === 'string') {
      if (lc.includes(pattern)) return true;
    } else {
      if (pattern.test(lc)) return true;
    }
  }

  return false;
};

// Export for use in UI components
export { isKeyPosition };

// Helper to map JobPosition to SpreadsheetPosition
const mapJobToPosition = (job: JobPosition, index: number): SpreadsheetPosition => {
  // Check if this is a GSA position
  const isGSA = job.wage_source === 'gsa';

  // Find first available percentile with a valid wage (for BLS positions)
  let percentile = job.selected_percentile || '50th';

  // Validate that the percentile has a wage value (BLS only)
  if (!isGSA) {
    const percentileWage = job[`wage_${percentile}` as keyof JobPosition];
    if (percentileWage == null) {
      // Fallback: find first non-null percentile
      const fallbacks = ['50th', '75th', '25th', '90th', '10th'] as const;
      for (const p of fallbacks) {
        if (job[`wage_${p}` as keyof JobPosition] != null) {
          percentile = p;
          break;
        }
      }
    }
  }

  // Calculate selected_wage from the determined percentile (BLS) or GSA rate (GSA)
  let selectedWage: number | undefined;
  if (isGSA && job.gsa_rates_by_year) {
    // For GSA, use the first year's rate for display
    const currentYear = job.gsa_current_year || 1;
    selectedWage = job.gsa_rates_by_year[String(currentYear)];
  } else {
    selectedWage = job[`wage_${percentile}` as keyof JobPosition] as number | undefined;
  }

  return {
    id: `pos_${index}_${Date.now()}`,
    labor_category: job.labor_category,
    description: job.description, // Job description from document parsing
    experience: job.experience,
    location: job.location,
    location_type: job.location_type || 'On-Site', // Default to On-Site
    soc_code: job.soc_code,
    soc_title: job.soc_title,
    percentile,
    wage_10th: job.wage_10th,
    wage_25th: job.wage_25th,
    wage_50th: job.wage_50th,
    wage_75th: job.wage_75th,
    wage_90th: job.wage_90th,
    selected_wage: selectedWage,
    hours_per_year: job.hours_per_year || { '1': job.hours || 1880 },
    ot_hours_per_year: job.ot_hours_per_year, // Overtime hours per year
    standard_fte_hours: job.standard_fte_hours,
    yearly_amounts: [],
    total_amount: 0,
    // GSA-specific fields
    wage_source: job.wage_source,
    gsa_lcat_id: job.gsa_lcat_id,
    gsa_title: job.gsa_title,
    gsa_rates_by_year: job.gsa_rates_by_year,
    gsa_current_year: job.gsa_current_year,
    gsa_discount_rate: job.gsa_discount_rate,
    // Key position flag
    is_key_position: job.is_key_position,
    // Surge flag
    is_surge: job.is_surge,
  };
};

// Helper to build year hours for recalculation request
const buildYearHours = (hours_per_year: Record<string, number>) => {
  const result: Record<string, number> = {};
  Object.entries(hours_per_year).forEach(([year, hours]) => {
    result[`year${year}_hours`] = hours;
  });
  return result;
};

// Helper to calculate passthrough costs (S&MH + G&A on sub labor)
const calculatePassthrough = (
  subCostsByYear: Record<string, number>,
  rates: { smh: number; ga_passthrough: number }
): Record<string, number> => {
  const result: Record<string, number> = {};
  Object.entries(subCostsByYear).forEach(([year, cost]) => {
    result[year] = cost * (rates.smh + rates.ga_passthrough);
  });
  return result;
};

// Helper to calculate fee costs (separate for prime vs sub labor)
const calculateFee = (
  primeLaborByYear: Record<string, number>,
  subLaborByYear: Record<string, number>,
  feeRates: { prime_labor: number; sub_labor: number }
): Record<string, number> => {
  const result: Record<string, number> = {};
  const years = new Set([
    ...Object.keys(primeLaborByYear),
    ...Object.keys(subLaborByYear),
  ]);

  years.forEach((year) => {
    const primeFee = (primeLaborByYear[year] || 0) * feeRates.prime_labor;
    const subFee = (subLaborByYear[year] || 0) * feeRates.sub_labor;
    result[year] = primeFee + subFee;
  });

  return result;
};

// Helper to calculate subcontractor costs by year
const calculateSubcontractorCostsByYear = (subcontractors: Subcontractor[]): Record<string, number> => {
  const result: Record<string, number> = {};

  subcontractors.forEach((sub) => {
    sub.positions.forEach((pos) => {
      Object.entries(pos.hours_per_year).forEach(([year, hours]) => {
        if (!result[year]) {
          result[year] = 0;
        }
        result[year] += hours * pos.rate;
      });
    });
  });

  return result;
};

// Proposal cache for faster loading
const proposalCache = new Map<string, {
  data: any;
  timestamp: number;
  ttl: number;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedProposal = (proposalId: string) => {
  const cached = proposalCache.get(proposalId);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    console.log('✅ Using cached proposal data');
    return cached.data;
  }
  return null;
};

const setCachedProposal = (proposalId: string, data: any) => {
  proposalCache.set(proposalId, {
    data,
    timestamp: Date.now(),
    ttl: CACHE_TTL,
  });
  console.log('💾 Cached proposal data');
};

export const usePricingStore = create<PricingState>((set, get) => {
  // Calculate grand total contract value (all components)
  const calculateGrandTotal = (): number => {
    const state = get();

    // Calculate prime labor by year (DL + Fringe + OH + G&A from aggregates)
    const primeLaborTotal = Object.values(state.aggregates.byYear).reduce((sum, yearData) => {
      return sum + (yearData.dl + yearData.fringe + yearData.oh + yearData.ga);
    }, 0);

    // Calculate overtime costs
    const otTotal = Object.values(state.aggregates.byYear).reduce((sum, yearData) => {
      return sum + (yearData.ot || 0);
    }, 0);

    // Calculate subcontractor costs with escalation
    let subTotal = 0;
    const calcMarkupDivisor = 1 + (state.rates.smh || 0) + (state.rates.ga_passthrough || 0) + (state.rates.sub_fee || 0);
    state.subcontractors.forEach(sub => {
      sub.positions.forEach(pos => {
        // For GSA-sourced sub positions, look up the original prime position
        const origPrimePos = pos.original_position_id
          ? state.positions.find(p => p.id === pos.original_position_id)
          : null;
        const isGSASubPos = origPrimePos ? isGSAPosition(origPrimePos) : false;

        Object.entries(pos.hours_per_year || {}).forEach(([year, hours]) => {
          const yearNum = parseInt(year, 10);

          let effectiveRate: number;
          if (isGSASubPos && origPrimePos) {
            // GSA sub: derive from prime position's actual GSA schedule
            const gsaYearRate = getGSARateForYear(origPrimePos, yearNum, state.escalationRates);
            const discountRate = origPrimePos.gsa_discount_rate || 0;
            effectiveRate = (gsaYearRate * (1 - discountRate)) / calcMarkupDivisor;
          } else if (pos.rates_per_year?.[year] !== undefined) {
            effectiveRate = pos.rates_per_year[year];
          } else {
            let escalationMultiplier = 1;
            for (let y = 2; y <= yearNum; y++) {
              const escalationKey = `${y - 1}_to_${y}` as keyof typeof state.escalationRates;
              const escalationRate = state.escalationRates[escalationKey] || 0;
              escalationMultiplier *= (1 + escalationRate);
            }
            effectiveRate = pos.rate * escalationMultiplier;
          }

          subTotal += hours * effectiveRate;

          // Add overtime if exists
          const otHours = (pos.ot_hours_per_year || {})[year] || 0;
          const otMultiplier = state.rates.ot_multiplier || 1.5;
          subTotal += otHours * effectiveRate * otMultiplier;
        });
      });
    });

    // Calculate passthrough (SMH + G&A on subcontractor costs)
    const passthroughTotal = subTotal * ((state.rates.smh || 0) + (state.rates.ga_passthrough || 0));

    // Calculate fee (on prime + subcontractor labor)
    const primeFee = primeLaborTotal * (state.rates.fee || 0);
    const subFee = subTotal * (state.rates.sub_fee || state.rates.fee || 0);
    const feeTotal = primeFee + subFee;

    // Calculate travel costs with escalation and G&A
    let travelTotal = 0;
    state.travel.forEach(item => {
      Object.entries(item.amount_per_year || {}).forEach(([year, amount]) => {
        const yearNum = parseInt(year, 10);
        let finalAmount = amount;

        if (item.escalate) {
          let escalationMultiplier = 1;
          for (let y = 2; y <= yearNum; y++) {
            const escalationKey = `${y - 1}_to_${y}` as keyof typeof state.escalationRates;
            const escalationRate = state.escalationRates[escalationKey] || 0;
            escalationMultiplier *= (1 + escalationRate);
          }
          finalAmount = amount * escalationMultiplier;
        }

        // Apply G&A markup
        const gaRate = state.rates.ga || 0;
        travelTotal += finalAmount * (1 + gaRate);
      });
    });

    // Calculate ODC costs with escalation and S&MH
    let odcTotal = 0;
    state.odcs.forEach(item => {
      Object.entries(item.amount_per_year || {}).forEach(([year, amount]) => {
        const yearNum = parseInt(year, 10);
        let finalAmount = amount;

        if (item.escalate) {
          let escalationMultiplier = 1;
          for (let y = 2; y <= yearNum; y++) {
            const escalationKey = `${y - 1}_to_${y}` as keyof typeof state.escalationRates;
            const escalationRate = state.escalationRates[escalationKey] || 0;
            escalationMultiplier *= (1 + escalationRate);
          }
          finalAmount = amount * escalationMultiplier;
        }

        // Apply S&MH markup
        const smhRate = state.rates.smh || 0;
        odcTotal += finalAmount * (1 + smhRate);
      });
    });

    // Calculate surge costs (if surge option exists).
    // Surge base is fee-INCLUSIVE prime labor (= billable rate): per DFARS
    // 252.217-7001, surge hours are priced at the same billable rate as base
    // work, and government billable rate always includes fee.
    let surgeTotal = 0;
    if (state.surge && state.surge.percentage !== null) {
      const surgePercentage = state.surge.percentage;
      const surgeMultiplier = state.rates.surge_multiplier || 1.15;
      const primeLaborWithFee = primeLaborTotal + primeFee;
      surgeTotal = primeLaborWithFee * surgePercentage * surgeMultiplier;
    }

    // Grand total
    return primeLaborTotal + otTotal + subTotal + passthroughTotal + feeTotal + travelTotal + odcTotal + surgeTotal;
  };

  // Helper function for actual transformation logic
  const performTransformToAdvanced = (options?: { skipVersionIncrement?: boolean }) => {
    const state = get();

    console.log('[TRANSFORM] ========== TRANSFORM START ==========');
    console.log('[TRANSFORM] Current rates:', {
      fringe: state.rates.fringe,
      oh_onsite: state.rates.oh_onsite,
      oh_offsite: state.rates.oh_offsite,
      ga: state.rates.ga,
      fee: state.rates.fee
    });
    console.log('[TRANSFORM] Positions to transform:', state.positions.length);
    console.log('[TRANSFORM] Escalation rates:', state.escalationRates);

    // Convert each SpreadsheetPosition to AdvancedPosition
    const advanced = state.positions.map((pos) => {
      const breakdown: AdvancedPosition['breakdown'] = {};
      const isGSA = isGSAPosition(pos);

      // For each year, create detailed breakdown
      Object.entries(pos.hours_per_year).forEach(([year, hours]) => {
        const yearNum = parseInt(year, 10);

        if (isGSA) {
          // GSA positions: Reverse engineer for DISPLAY purposes
          // The GSA rate is the final FBLR, but we show it broken down
          // as if it were calculated with indirect rates (for consistency in UI)

          console.log(`[TRANSFORM_GSA] Position: ${pos.labor_category}, Year: ${yearNum}`);
          console.log('[TRANSFORM_GSA] gsa_rates_by_year:', pos.gsa_rates_by_year);
          console.log('[TRANSFORM_GSA] gsa_current_year:', pos.gsa_current_year);
          console.log('[TRANSFORM_GSA] gsa_custom_rate:', pos.gsa_custom_rate);
          console.log('[TRANSFORM_GSA] gsa_discount_rate:', pos.gsa_discount_rate);

          const originalGsaRate = getGSARateForYear(pos, yearNum, state.escalationRates);
          console.log('[TRANSFORM_GSA] originalGsaRate from getGSARateForYear:', originalGsaRate);

          // Apply discount if set by user
          const discountRate = pos.gsa_discount_rate || 0;
          const gsaRate = originalGsaRate * (1 - discountRate);
          console.log('[TRANSFORM_GSA] Final gsaRate after discount:', gsaRate);

          const gsaBreakdown = reverseEngineerGSARate(gsaRate, state.rates, pos.location_type);

          // IMPORTANT: For GSA, the breakdown is ONLY for display purposes
          // The actual cost is ALWAYS gsaRate * hours (independent of indirect rates)
          const dlAmount = gsaBreakdown.dlRate * hours;
          const fringeAmount = gsaBreakdown.fringe * hours;
          const ohAmount = gsaBreakdown.oh * hours;
          const gaAmount = gsaBreakdown.ga * hours;
          const feeAmount = gsaBreakdown.fee * hours;
          // Use GSA rate directly for total (NOT gsaBreakdown.fblr)
          const totalAmount = gsaRate * hours;

          breakdown[year] = {
            hours,
            wage: gsaRate, // Original GSA rate for reference
            dlRate: gsaBreakdown.dlRate,
            dlAmount,
            fringe: gsaBreakdown.fringe,
            fringeAmount,
            oh: gsaBreakdown.oh,
            ohAmount,
            ga: gsaBreakdown.ga,
            gaAmount,
            fee: gsaBreakdown.fee,
            feeAmount,
            fblr: gsaRate, // GSA rate is the true FBLR (not reverse-engineered value)
            totalAmount,
          };

          console.log('[TRANSFORM_GSA] breakdown.fblr set to:', gsaRate);
        } else {
          // BLS positions: Calculate with indirect rates and escalation
          // Use getEffectiveSalary to handle multi-select averaging
          const baseWage = getEffectiveSalary(pos);

          // Skip if no valid wage or hours
          if (!baseWage || baseWage === 0 || !pos.standard_fte_hours || pos.standard_fte_hours === 0) {
            breakdown[year] = {
              hours,
              wage: 0,
              dlRate: 0,
              dlAmount: 0,
              fringe: 0,
              fringeAmount: 0,
              oh: 0,
              ohAmount: 0,
              ga: 0,
              gaAmount: 0,
              fee: 0,
              feeAmount: 0,
              fblr: 0,
              totalAmount: 0,
            };
            return;
          }

          // Apply compound escalation for years after year 1
          let wage = baseWage;
          for (let y = 1; y < yearNum; y++) {
            const escKey = `${y}_to_${y + 1}`;
            const escRate = state.escalationRates[escKey] || 0;
            wage *= (1 + escRate);
          }

          // IMPORTANT: Calculate hourly rate using STANDARD FTE hours from contract, not actual hours
          // This ensures consistent hourly rate for partial years (like 6-month extensions)
          // Each contract defines its own standard FTE hours (1880, 1920, 2080, etc.)
          const standardFTEHours = pos.standard_fte_hours;
          const dlRate = wage / standardFTEHours;
          const dlAmount = dlRate * hours;

          const fringe = dlRate * state.rates.fringe;
          const fringeAmount = fringe * hours;

          // Determine which OH rate to use based on location_type
          // Default to On-Site if not specified
          // Fallback: oh_onsite/oh_offsite → oh → 0.0711
          const ohOnsite = state.rates.oh_onsite !== undefined ? state.rates.oh_onsite : (state.rates.oh !== undefined ? state.rates.oh : 0.0711);
          const ohOffsite = state.rates.oh_offsite !== undefined ? state.rates.oh_offsite : (state.rates.oh !== undefined ? state.rates.oh : 0.0711);
          const locationType = pos.location_type || 'On-Site'; // Default to On-Site
          const ohRate = locationType === 'On-Site' ? ohOnsite : ohOffsite;
          const oh = (dlRate + fringe) * ohRate;
          const ohAmount = oh * hours;

          const ga = (dlRate + fringe + oh) * state.rates.ga;
          const gaAmount = ga * hours;

          const fee = (dlRate + fringe + oh + ga) * state.rates.fee;
          const feeAmount = fee * hours;

          // FBLR includes fee for UI display
          const fblr = dlRate + fringe + oh + ga + fee;
          const totalAmount = fblr * hours;

          breakdown[year] = {
            hours,
            wage,
            dlRate,
            dlAmount,
            fringe,
            fringeAmount,
            oh,
            ohAmount,
            ga,
            gaAmount,
            fee,
            feeAmount,
            fblr,
            totalAmount,
          };
        }
      });

      return {
        ...pos,
        breakdown,
        total_hours: Object.values(pos.hours_per_year).reduce((sum, h) => sum + h, 0),
        total_amount: Object.values(breakdown).reduce((sum, b) => sum + b.totalAmount, 0),
      } as AdvancedPosition;
    });

    // Calculate aggregates
    const aggregates: Aggregates = {
      totalDL: 0,
      totalFringe: 0,
      totalOH: 0,
      totalGA: 0,
      totalFee: 0,
      totalFBLR: 0,
      totalOT: 0,
      byYear: {},
    };

    advanced.forEach((pos) => {
      // CRITICAL: Skip positions assigned to subcontractors to avoid double-counting
      // Positions with assigned_subcontractor_id should ONLY be counted in subcontractor totals
      if (pos.assigned_subcontractor_id) {
        return;
      }

      Object.entries(pos.breakdown).forEach(([year, breakdown]) => {
        if (!aggregates.byYear[year]) {
          aggregates.byYear[year] = {
            dl: 0,
            fringe: 0,
            oh: 0,
            ga: 0,
            fee: 0,
            fblr: 0,
            ot: 0,
            totalAmount: 0,
          };
        }

        aggregates.byYear[year].dl += breakdown.dlAmount;
        aggregates.byYear[year].fringe += breakdown.fringeAmount;
        aggregates.byYear[year].oh += breakdown.ohAmount;
        aggregates.byYear[year].ga += breakdown.gaAmount;
        aggregates.byYear[year].fee += breakdown.feeAmount;
        aggregates.byYear[year].fblr += breakdown.totalAmount;

        // Calculate OT cost: OT hours × FBLR × OT multiplier
        const otHours = pos.ot_hours_per_year?.[year] || 0;
        if (otHours > 0) {
          const otMultiplier = state.rates.ot_multiplier || 1.5;
          const otCost = otHours * breakdown.fblr * otMultiplier;
          aggregates.byYear[year].ot += otCost;
          aggregates.totalOT += otCost;
        }

        aggregates.byYear[year].totalAmount += breakdown.totalAmount;

        aggregates.totalDL += breakdown.dlAmount;
        aggregates.totalFringe += breakdown.fringeAmount;
        aggregates.totalOH += breakdown.ohAmount;
        aggregates.totalGA += breakdown.gaAmount;
        aggregates.totalFee += breakdown.feeAmount;
        aggregates.totalFBLR += breakdown.totalAmount;
      });
    });

    console.log('[TRANSFORM] Calculated positions count:', advanced.length);
    console.log('[TRANSFORM] Sample position breakdown (first pos, year 1):', advanced[0]?.breakdown['1']);
    console.log('[TRANSFORM] Aggregates calculated:', {
      totalDL: aggregates.totalDL,
      totalFringe: aggregates.totalFringe,
      totalOH: aggregates.totalOH,
      totalGA: aggregates.totalGA,
      totalFBLR: aggregates.totalFBLR
    });

    // Only increment version if not explicitly skipped (to prevent unnecessary remounts)
    const oldVersion = state.advancedModeVersion;
    const newVersion = options?.skipVersionIncrement
      ? state.advancedModeVersion
      : state.advancedModeVersion + 1;
    console.log('[TRANSFORM] Version change:', {
      oldVersion,
      newVersion,
      skipped: options?.skipVersionIncrement || false,
      willIncrement: newVersion !== oldVersion
    });

    set({
      positionsAdvanced: advanced,
      aggregates,
      advancedModeVersion: newVersion
    });

    // Verify the version was actually set
    const updatedState = get();
    console.log('[TRANSFORM] State updated - version after set():', updatedState.advancedModeVersion);
    console.log('[TRANSFORM] ========== TRANSFORM END ==========');
  };


  // Debounced recalculation (500ms)
  const debouncedRecalculate = debounce(async () => {
    const state = get();
    if (!state.proposalId) return;

    set({ isRecalculating: true });
    console.log('Recalculating...');

    try {
      const response = await pricingApi.recalculate({
        positions: state.positions.map((p) => ({
          id: p.id,
          percentile: p.percentile?.replace(' (default)', '') || '50th',  // Strip suffix, default to 50th
          wage_10th: p.wage_10th,
          wage_25th: p.wage_25th,
          wage_50th: p.wage_50th,
          wage_75th: p.wage_75th,
          wage_90th: p.wage_90th,
          location_type: p.location_type || 'On-Site',  // Add location_type for OH rate selection
          ...buildYearHours(p.hours_per_year),
        })),
        rates: state.rates,
        escalation_rates: state.escalationRates,
        total_years: state.totalYears,
      });

      // Update positions with calculated data
      const updatedPositions = state.positions.map((pos) => {
        const result = response.results.find((r) => r.id === pos.id);
        return {
          ...pos,
          yearly_amounts: result?.years,
          total_amount: result?.total_amount,
        };
      });

      set({
        positions: updatedPositions,
        isRecalculating: false,
        isDirty: true,
      });

      // Always transform to update detailed view (used by both initial and advanced mode)
      performTransformToAdvanced();

      console.log('Calculations updated');

      // Trigger auto-save
      debouncedAutoSave();
    } catch (error: any) {
      console.error('Recalculation failed:', error);
      set({ isRecalculating: false });
    }
  }, 500);

  // Debounced auto-save (2000ms)
  const debouncedAutoSave = debounce(async () => {
    const state = get();

    console.log('[AUTO-SAVE] Debounce triggered', {
      proposalId: state.proposalId,
      isDirty: state.isDirty,
      positions: state.positions.length,
    });

    if (!state.proposalId || !state.isDirty) {
      console.warn('[AUTO-SAVE] SKIPPED - Guard check failed', {
        hasProposalId: !!state.proposalId,
        proposalIdValue: state.proposalId,
        isDirtyValue: state.isDirty,
      });
      return;
    }

    set({ isSaving: true });
    console.log('💾 Attempting auto-save to MongoDB...');

    try {
      // Calculate grand total contract value (all components)
      const totalCost = calculateGrandTotal();

      await proposalsApi.update(state.proposalId, {
        prime_contractor_name: state.primeContractorName,  // Save at proposal level
        total_cost: totalCost,  // Grand total contract value
        spreadsheet_data: {
          positions: state.positions,
          subcontractors: state.subcontractors,
          travel: state.travel,
          odcs: state.odcs,
          extensions: state.extensions,
          surge: state.surge,
          rates: state.rates,
          escalation_rates: state.escalationRates,
          months_per_year: state.monthsPerYear,
          subcontractor_configured: state.subcontractorConfigured,
          advanced_mode: state.advancedMode,
        },
      });

      console.log('✅ Auto-save successful!');
      console.log('   - Positions saved:', state.positions.length);
      console.log('   - Subcontractors saved:', state.subcontractors.length);
      console.log('   - Subcontractor data:', state.subcontractors);

      // Invalidate cache so next load fetches fresh data from MongoDB
      if (state.proposalId) {
        proposalCache.delete(state.proposalId);
        console.log('🗑️  Cache invalidated for proposal:', state.proposalId);
      }

      set({
        isDirty: false,
        isSaving: false,
        lastSaved: new Date(),
      });
    } catch (error: any) {
      console.error('❌ Auto-save failed:', error);
      console.error('   - Error details:', error.response?.data || error.message);
      console.error('   - Failed payload:', {
        positions: state.positions.length,
        subcontractors: state.subcontractors.length,
        subcontractorData: state.subcontractors,
      });
      set({ isSaving: false });
      // Silently fail - don't show error toast
    }
  }, 2000);

  return {
    // Initial state
    proposalId: null,
    proposalName: '',
    solicitationNumber: '',
    primeContractorName: 'TBD',
    dcaaContact: '',
    positions: [],
    subcontractors: [],
    travel: [],
    odcs: [],
    extensions: [],
    surge: null,  // NEW: Surge option (populated from proposal data)
    rates: {} as IndirectRates,  // Will be populated from backend (org settings)
    escalationRates: {} as EscalationRates,  // Will be populated from backend (org settings)
    wageSource: { type: 'bls' } as WageSource,  // Default to BLS, updated from proposal
    totalYears: 1,
    baseYears: 1,
    optionYears: 0,
    monthsPerYear: { "1": 12 },
    isDirty: false,
    isRecalculating: false,
    isSaving: false,
    lastSaved: null,
    error: null,

    // Advanced mode initial state
    advancedMode: false,
    subcontractorConfigured: false,
    positionsAdvanced: [],
    expandedPositions: new Set<string>(),
    manualOverrides: new Map<string, Set<string>>(),
    aggregates: {
      totalDL: 0,
      totalFringe: 0,
      totalOH: 0,
      totalGA: 0,
      totalFee: 0,
      totalFBLR: 0,
      totalOT: 0,
      byYear: {},
    },
    ratesReferenceExpanded: false,
    advancedModeVersion: 0,
    activeTab: 'overview',
    savedScrollPosition: null,

    loadProposal: async (proposalId, existingProposal) => {
      try {
        // If existingProposal is provided, skip cache (it's fresh data)
        if (!existingProposal) {
          // Check cache only when fetching from API
          const cachedData = getCachedProposal(proposalId);
          if (cachedData) {
            set(cachedData);

            // If proposal was saved in advanced mode, restore the advanced view
            if (cachedData.advancedMode) {
              console.log('[LOAD FROM CACHE] Restoring advanced mode view...');
              performTransformToAdvanced();
            }

            return;
          }
        }

        // Use existing proposal data if provided, otherwise fetch
        const proposal = existingProposal || await proposalsApi.get(proposalId);

        // Extract positions from spreadsheet_data (single source of truth)
        // NOTE: jobs fallback is ONLY for old proposals (pre-refactor). New proposals write directly to spreadsheet_data.positions
        let positions: SpreadsheetPosition[] = [];
        let positionsFromJobs = false; // Track if we need to save new IDs

        // Get standard FTE hours from metadata (contract-level setting)
        const standardFteHours = proposal.metadata?.fte_hours_threshold;

        if (proposal.spreadsheet_data?.positions && proposal.spreadsheet_data.positions.length > 0) {
          positions = proposal.spreadsheet_data.positions;
          // Apply defaults and standard_fte_hours from metadata to all positions
          positions = positions.map((pos) => ({
            ...pos,
            location_type: pos.location_type || 'On-Site', // Default to On-Site
            standard_fte_hours: standardFteHours || pos.standard_fte_hours
          }));

          // MIGRATION: Copy ot_hours_per_year and is_surge from jobs if missing
          if (proposal.jobs && proposal.jobs.length > 0) {
            const needsOTMigration = positions.some(pos => !pos.ot_hours_per_year && pos.labor_category);
            const needsSurgeMigration = positions.some(pos => pos.is_surge === undefined && pos.labor_category);

            if (needsOTMigration || needsSurgeMigration) {
              console.log('[MIGRATION] Copying OT hours and surge flags from jobs to positions');

              // Build lookup map for O(n) instead of O(n²)
              const jobsMap = new Map(
                proposal.jobs.map(job => [
                  `${job.labor_category}_${job.hours_per_year?.['1']}`,
                  job
                ])
              );

              positions = positions.map((pos) => {
                const lookupKey = `${pos.labor_category}_${pos.hours_per_year?.['1']}`;
                const matchingJob = jobsMap.get(lookupKey);

                if (matchingJob) {
                  const updates: any = { ...pos };
                  if (!pos.ot_hours_per_year && matchingJob.ot_hours_per_year) {
                    console.log(`[MIGRATION] Copying OT hours for: ${pos.labor_category}`);
                    updates.ot_hours_per_year = matchingJob.ot_hours_per_year;
                  }
                  if (pos.is_surge === undefined && matchingJob.is_surge !== undefined) {
                    console.log(`[MIGRATION] Copying surge flag for: ${pos.labor_category}`);
                    updates.is_surge = matchingJob.is_surge;
                  }
                  return updates;
                }
                return pos;
              });
              positionsFromJobs = true; // Mark as needing save
            }
          }

          // Migration: Copy descriptions from jobs to positions if missing
          if (proposal.jobs && Array.isArray(proposal.jobs) && proposal.jobs.length > 0) {
            const positionsNeedDescriptions = positions.some(pos => !pos.description);
            const jobsHaveDescriptions = proposal.jobs.some(job => !!job.description);

            if (positionsNeedDescriptions && jobsHaveDescriptions) {
              console.log('[MIGRATION] Copying descriptions from jobs to positions');

              // Build lookup map for O(n) instead of O(n²)
              const jobsByCategory = new Map(
                proposal.jobs.map(job => [job.labor_category, job])
              );

              positions = positions.map((pos) => {
                // If position already has description, skip
                if (pos.description) return pos;

                // Lookup matching job by labor_category
                const matchingJob = jobsByCategory.get(pos.labor_category);

                if (matchingJob?.description) {
                  console.log(`[MIGRATION] Copied description for position: ${pos.labor_category}`);
                  return {
                    ...pos,
                    description: matchingJob.description
                  };
                }

                return pos;
              });

              // Mark as needing save to persist the migration
              positionsFromJobs = true;
              console.log('[MIGRATION] Descriptions copied, will save to backend');
            }
          }
        } else if (proposal.jobs && proposal.jobs.length > 0) {
          positions = proposal.jobs.map((job, index) => {
            const mappedPos = mapJobToPosition(job, index);
            // Apply standard_fte_hours from metadata if not in job
            if (standardFteHours && !mappedPos.standard_fte_hours) {
              mappedPos.standard_fte_hours = standardFteHours;
            }
            return mappedPos;
          });
          positionsFromJobs = true; // New temp IDs generated, need to save
        }

        // Generate default months if not provided
        let totalYears = proposal.metadata?.total_years || 1;

        // If there are extensions, calculate actual total including them
        const extensionsArray = proposal.spreadsheet_data?.extensions || [];
        if (extensionsArray.length > 0) {
          const maxExtensionYear = Math.max(...extensionsArray.map((ext: any) => ext.year));
          totalYears = Math.max(totalYears, maxExtensionYear);
        }

        const defaultMonthsPerYear: Record<string, number> = {};
        for (let i = 1; i <= totalYears; i++) {
          defaultMonthsPerYear[i.toString()] = 12;
        }

        // If prime contractor name is TBD or empty, use organization name
        let primeContractorName = proposal.prime_contractor_name || 'TBD';
        if (primeContractorName === 'TBD' || !primeContractorName) {
          const orgState = useOrganizationStore.getState();
          if (orgState.organization?.name) {
            primeContractorName = orgState.organization.name;
            console.log('[PRICING] Using organization name as prime contractor:', primeContractorName);

            // Immediately save to backend to persist the change
            proposalsApi.update(proposalId, { prime_contractor_name: primeContractorName });
          }
        }

        // Load subcontractor configuration state
        const subcontractorConfigured = proposal.spreadsheet_data?.subcontractor_configured || false;
        // Detect advanced mode: explicit flag OR has subcontractors OR subcontractor_configured
        // This handles proposals activated before we added the advanced_mode flag
        const hasSubcontractors = proposal.spreadsheet_data?.subcontractors && proposal.spreadsheet_data.subcontractors.length > 0;
        const advancedMode = proposal.spreadsheet_data?.advanced_mode || subcontractorConfigured || hasSubcontractors || false;

        // Load rates from spreadsheet_data (single source of truth)
        // Fallback to top-level for old proposals (pre-refactor)
        let rates = proposal.spreadsheet_data?.rates || proposal.rates;

        // Ensure rates object exists
        if (!rates) {
          rates = {
            fringe: 0.247,
            oh_onsite: 0.0711,
            oh_offsite: 0.0711,
            ga: 0.2243,
            fee: 0.07,
          };
        } else {
          // Migrate old 'oh' to new structure
          if (rates.oh !== undefined && rates.oh !== null && !rates.oh_onsite && !rates.oh_offsite) {
            rates = {
              ...rates,
              oh_onsite: rates.oh,
              oh_offsite: rates.oh,
            };
            delete rates.oh;
          }

          // Ensure oh_onsite and oh_offsite always exist (fallback to defaults)
          if (rates.oh_onsite === undefined || rates.oh_onsite === null) {
            rates = {
              ...rates,
              oh_onsite: 0.0711,
            };
          }
          if (rates.oh_offsite === undefined || rates.oh_offsite === null) {
            rates = {
              ...rates,
              oh_offsite: 0.0711,
            };
          }
        }

        // MIGRATION: Fix old subcontractor positions (pre-dropdown assignment)
        // Old flow removed positions from main array and didn't set shows_in_main_grid flag
        // New flow keeps positions in main array with assigned_subcontractor_id
        let subcontractors = proposal.spreadsheet_data?.subcontractors || [];
        let needsMigration = false;

        // Check if any subcontractor has positions without shows_in_main_grid flag
        const hasOldPositions = subcontractors.some((sub: Subcontractor) =>
          sub.positions?.some((pos: SubcontractorPosition) => pos.shows_in_main_grid !== true)
        );

        if (hasOldPositions) {
          console.log('[MIGRATION] Detected old subcontractor positions, starting migration...');

          subcontractors = subcontractors.map((sub: Subcontractor) => {
            const updatedPositions = sub.positions.map((subPos: SubcontractorPosition) => {
              // If already has the flag, skip
              if (subPos.shows_in_main_grid === true) {
                return subPos;
              }

              console.log(`[MIGRATION] Migrating old subcontractor position: ${subPos.labor_category} in ${sub.name}`);

              // Check if this position exists in main positions array
              const existsInMain = positions.some((p: SpreadsheetPosition) =>
                p.id === subPos.original_position_id ||
                (p.labor_category === subPos.labor_category && p.assigned_subcontractor_id === sub.id)
              );

              // If not in main positions, add it back
              if (!existsInMain && subPos.original_position_id) {
                console.log(`[MIGRATION] Restoring position to main array: ${subPos.labor_category}`);

                // Reconstruct main position from subcontractor data
                const restoredPosition: SpreadsheetPosition = {
                  id: subPos.original_position_id,
                  labor_category: subPos.labor_category,
                  hours_per_year: { ...subPos.hours_per_year },
                  ot_hours_per_year: subPos.ot_hours_per_year ? { ...subPos.ot_hours_per_year } : undefined,
                  assigned_subcontractor_id: sub.id,
                  location_type: subPos.location_type || 'On-Site',
                  standard_fte_hours: standardFteHours,
                  percentile: '50th', // Default to median for restored positions
                  // Keep the last rate that was set in subcontractor
                  last_subcontractor_base_rate: subPos.rate,
                };

                positions.push(restoredPosition);
                needsMigration = true;
              } else if (existsInMain) {
                // Position exists, make sure assigned_subcontractor_id is set
                positions = positions.map(p => {
                  if (p.id === subPos.original_position_id && !p.assigned_subcontractor_id) {
                    console.log(`[MIGRATION] Setting assigned_subcontractor_id for: ${p.labor_category}`);
                    needsMigration = true;
                    return {
                      ...p,
                      assigned_subcontractor_id: sub.id,
                    };
                  }
                  return p;
                });
              }

              // Add the shows_in_main_grid flag to subcontractor position
              return {
                ...subPos,
                shows_in_main_grid: true,
              };
            });

            return {
              ...sub,
              positions: updatedPositions,
            };
          });

          if (needsMigration) {
            console.log('[MIGRATION] Migration complete, will save to backend');
            positionsFromJobs = true; // Trigger auto-save
          }
        }

        // MIGRATION: Copy ot_hours_per_year from main positions to subcontractor positions
        const needsSubOTMigration = subcontractors.some((sub: Subcontractor) =>
          sub.positions.some((subPos: SubcontractorPosition) =>
            !subPos.ot_hours_per_year && subPos.original_position_id
          )
        );

        if (needsSubOTMigration) {
          console.log('[MIGRATION] Copying OT hours from main positions to subcontractor positions');

          // Build lookup map of position ID -> position
          const positionsMap = new Map(
            positions.map(p => [p.id, p])
          );

          subcontractors = subcontractors.map((sub: Subcontractor) => ({
            ...sub,
            positions: sub.positions.map((subPos: SubcontractorPosition) => {
              // Skip if already has OT hours or no link to main position
              if (subPos.ot_hours_per_year || !subPos.original_position_id) {
                return subPos;
              }

              // Find linked main position
              const mainPos = positionsMap.get(subPos.original_position_id);
              if (mainPos?.ot_hours_per_year) {
                console.log(`[MIGRATION] Copying OT hours for subcontractor position: ${subPos.labor_category} in ${sub.name}`);
                return {
                  ...subPos,
                  ot_hours_per_year: { ...mainPos.ot_hours_per_year },
                };
              }

              return subPos;
            }),
          }));

          positionsFromJobs = true; // Mark as needing save
        }

        set({
          proposalId,
          proposalName: proposal.name,
          solicitationNumber: proposal.solicitation_number,
          primeContractorName,
          dcaaContact: proposal.dcaa_contact || '',
          positions,
          subcontractors,
          travel: proposal.spreadsheet_data?.travel || [],
          odcs: proposal.spreadsheet_data?.odcs || [],
          extensions: proposal.spreadsheet_data?.extensions || [],
          surge: proposal.spreadsheet_data?.surge || null,  // NEW: Load surge option
          rates: rates,  // Use migrated rates
          escalationRates: proposal.spreadsheet_data?.escalation_rates || proposal.escalation_rates,  // Load from spreadsheet_data (fallback to top-level for old proposals)
          wageSource: proposal.wage_source || { type: 'bls' },  // Load wage source from proposal
          totalYears,
          baseYears: proposal.metadata?.base_years || 1,
          optionYears: proposal.metadata?.option_years || 0,
          monthsPerYear: proposal.metadata?.months_per_year || defaultMonthsPerYear,
          isDirty: false,
          lastSaved: null,
          error: null,
          // Restore advanced mode state
          subcontractorConfigured,
          advancedMode,
        });

        // Cache the loaded state for faster future access
        setCachedProposal(proposalId, {
          proposalId,
          proposalName: proposal.name,
          solicitationNumber: proposal.solicitation_number,
          primeContractorName,
          dcaaContact: proposal.dcaa_contact || '',
          positions,
          subcontractors,  // Use migrated subcontractors
          travel: proposal.spreadsheet_data?.travel || [],
          odcs: proposal.spreadsheet_data?.odcs || [],
          extensions: proposal.spreadsheet_data?.extensions || [],
          surge: proposal.spreadsheet_data?.surge || null,  // NEW: Load surge option
          rates: rates,  // Use migrated rates
          escalationRates: proposal.spreadsheet_data?.escalation_rates || proposal.escalation_rates,  // Load from spreadsheet_data (fallback to top-level for old proposals)
          wageSource: proposal.wage_source || { type: 'bls' },  // Cache wage source
          totalYears,
          baseYears: proposal.metadata?.base_years || 1,
          optionYears: proposal.metadata?.option_years || 0,
          monthsPerYear: proposal.metadata?.months_per_year || defaultMonthsPerYear,
          isDirty: false,
          lastSaved: null,
          error: null,
          subcontractorConfigured,
          advancedMode,
        });

        // If proposal was saved in advanced mode, restore the advanced view
        if (advancedMode) {
          console.log('[LOAD] Restoring advanced mode view...');
          performTransformToAdvanced();
        }

        // If positions came from jobs (not spreadsheet_data), save them immediately
        // This persists the new IDs so SOC changes and other updates work correctly
        if (positionsFromJobs && positions.length > 0) {
          console.log('[LOAD] Positions loaded from jobs, saving to spreadsheet_data immediately...');
          try {
            // IMPORTANT: Transform to advanced mode first to calculate aggregates
            // This populates the aggregates needed for calculateGrandTotal()
            console.log('[LOAD] Transforming to calculate aggregates before save...');
            performTransformToAdvanced();

            // Use calculateGrandTotal() which calculates from aggregates
            const totalCost = calculateGrandTotal();
            console.log('[LOAD] Calculated total_cost:', totalCost);

            await proposalsApi.update(proposalId, {
              prime_contractor_name: primeContractorName,
              total_cost: totalCost,
              spreadsheet_data: {
                positions,
                subcontractors: proposal.spreadsheet_data?.subcontractors || [],
                travel: proposal.spreadsheet_data?.travel || [],
                odcs: proposal.spreadsheet_data?.odcs || [],
                extensions: proposal.spreadsheet_data?.extensions || [],
                surge: proposal.spreadsheet_data?.surge || null,
                rates: rates,  // Use migrated rates
                escalation_rates: proposal.spreadsheet_data?.escalation_rates || proposal.escalation_rates,
                months_per_year: proposal.metadata?.months_per_year || defaultMonthsPerYear,
                subcontractor_configured: subcontractorConfigured,
                advanced_mode: advancedMode,
              },
            });
            console.log('[LOAD] ✅ Positions saved to spreadsheet_data with total_cost:', totalCost);
          } catch (saveError) {
            console.error('[LOAD] ❌ Failed to save positions:', saveError);
          }
        }

        // NOTE: Don't auto-recalculate on initial load
        // The spreadsheet shows editable data, but FBLR calculations
        // are only fetched when user explicitly triggers "Advanced Analysis"
      } catch (error: any) {
        set({
          error: error.response?.data?.detail || 'Failed to load proposal',
        });
      }
    },

    getWageSyncInfo: (id, updates) => {
      const state = get();

      // Detect if wage-related or labor category fields are being updated (includes both BLS and GSA fields)
      const wageFields = ['selected_wage', 'selected_salaries', 'percentile', 'gsa_custom_rate',
                         'wage_10th', 'wage_25th', 'wage_50th', 'wage_75th', 'wage_90th',
                         'soc_code', 'soc_title', 'location', 'labor_category',
                         'gsa_lcat_id', 'gsa_title', 'gsa_rates_by_year', 'wage_source'];
      const hasWageUpdate = Object.keys(updates).some(key => wageFields.includes(key));

      // Get target position's labor category
      const targetPosition = state.positions.find(p => p.id === id);
      const targetLaborCategory = targetPosition?.labor_category || null;

      console.log('[getWageSyncInfo] Checking:', {
        positionId: id,
        updateFields: Object.keys(updates),
        hasWageUpdate,
        targetLaborCategory,
        allPositions: state.positions.map(p => ({ id: p.id, laborCategory: p.labor_category }))
      });

      // Show confirmation for wage changes, location changes, and labor category changes
      const shouldSyncWages = hasWageUpdate && targetLaborCategory;

      if (shouldSyncWages) {
        const matchingCount = state.positions.filter(
          p => p.labor_category === targetLaborCategory && p.id !== id
        ).length;
        console.log('[getWageSyncInfo] Should sync:', {
          matchingCount,
          matchingPositions: state.positions
            .filter(p => p.labor_category === targetLaborCategory && p.id !== id)
            .map(p => ({ id: p.id, laborCategory: p.labor_category }))
        });
        return { willSync: true, matchingCount, laborCategory: targetLaborCategory };
      }

      console.log('[getWageSyncInfo] No sync needed');
      return { willSync: false, matchingCount: 0, laborCategory: targetLaborCategory };
    },

    updatePosition: (id, updates, options) => {
      const state = get();

      // Detect if wage-related or labor category fields are being updated (includes both BLS and GSA fields)
      const wageFields = ['selected_wage', 'selected_salaries', 'percentile', 'gsa_custom_rate',
                         'wage_10th', 'wage_25th', 'wage_50th', 'wage_75th', 'wage_90th',
                         'soc_code', 'soc_title', 'location', 'labor_category',
                         'gsa_lcat_id', 'gsa_title', 'gsa_rates_by_year', 'wage_source'];
      const hasWageUpdate = Object.keys(updates).some(key => wageFields.includes(key));

      // Check if this is ONLY a location_type change (to prevent unnecessary grid remounts)
      // NOTE: location (geographic) changes ARE wage changes, only location_type (On-Site/Off-Site) should skip version increment
      const isLocationTypeOnlyChange =
        Object.keys(updates).length === 1 &&
        updates.location_type !== undefined;

      // Helper to deep clone values (arrays/objects) to avoid reference sharing
      const deepClone = (value: any) => {
        if (Array.isArray(value)) {
          return [...value];
        } else if (typeof value === 'object' && value !== null) {
          return { ...value };
        }
        return value;
      };

      // Get target position's labor category for wage sync
      const targetPosition = state.positions.find(p => p.id === id);
      const targetLaborCategory = targetPosition?.labor_category;

      // Show confirmation for wage changes, location changes, and labor category changes
      // Respect the skipWageSync option if provided
      const shouldSyncWages = hasWageUpdate && targetLaborCategory && !options?.skipWageSync;

      if (hasWageUpdate && targetLaborCategory) {
        const matchingCount = state.positions.filter(
          p => p.labor_category === targetLaborCategory && p.id !== id
        ).length;
        if (options?.skipWageSync) {
          console.log(`[WAGE SYNC] Wage sync explicitly skipped by user for labor_category: "${targetLaborCategory}"`);
        } else if (shouldSyncWages) {
          console.log(`[WAGE SYNC] Detected change for labor_category: "${targetLaborCategory}" (${matchingCount} other positions will sync)`);
        }
      }

      // If location_type is being updated, also update linked subcontractor positions
      if (updates.location_type !== undefined) {
        console.log('[UPDATE POSITION] location_type changed, updating linked subcontractors...');

        // Find all subcontractor positions linked to this prime position
        const updatedSubcontractors = state.subcontractors.map(sub => {
          const hasLinkedPositions = sub.positions.some(pos => pos.original_position_id === id);

          if (hasLinkedPositions) {
            console.log(`[UPDATE POSITION] Updating location_type for subcontractor: ${sub.name}`);
            return {
              ...sub,
              positions: sub.positions.map(pos => {
                if (pos.original_position_id === id) {
                  console.log(`  - Position: ${pos.labor_category} → ${updates.location_type}`);
                  return { ...pos, location_type: updates.location_type };
                }
                return pos;
              })
            };
          }
          return sub;
        });

        // Update subcontractors in state
        set({ subcontractors: updatedSubcontractors });
      }

      if (state.advancedMode) {
        // In advanced mode, use the advanced update logic
        console.log('[ADVANCED MODE] Updating position via updatePosition', { id, updates, skipWageSync: options?.skipWageSync });

        // SINGLE atomic update: target position + wage sync in ONE set() call
        set((prevState) => ({
          positions: prevState.positions.map((p) => {
            if (p.id === id) {
              // Update target position with deep cloned values
              const clonedUpdates: Partial<SpreadsheetPosition> = {};
              for (const [key, value] of Object.entries(updates)) {
                clonedUpdates[key as keyof SpreadsheetPosition] = deepClone(value) as any;
              }
              return { ...p, ...clonedUpdates };
            } else if (shouldSyncWages && p.labor_category === targetLaborCategory) {
              // Wage sync: Update matching positions with ONLY wage fields (deep cloned)
              // NOTE: This only happens for manual wage changes, NOT location changes
              const wageUpdates: Partial<SpreadsheetPosition> = {};
              wageFields.forEach(field => {
                if (updates[field as keyof typeof updates] !== undefined) {
                  wageUpdates[field as keyof SpreadsheetPosition] = deepClone(updates[field as keyof typeof updates]) as any;
                }
              });
              console.log(`[WAGE SYNC] Syncing to position: ${p.id} (${p.labor_category})`);
              return { ...p, ...wageUpdates };
            }
            return p;
          }),
        }));

        // Then retransform to advanced mode to recalculate breakdown
        // ALWAYS increment version for wage changes to force grid re-render
        // Only skip version increment for location_type changes to prevent unnecessary grid remount
        const shouldSkipVersionIncrement = isLocationTypeOnlyChange && !hasWageUpdate;
        console.log('[ADVANCED MODE] Calling transformToAdvanced', {
          isLocationTypeOnlyChange,
          hasWageUpdate,
          shouldSkipVersionIncrement
        });
        performTransformToAdvanced({ skipVersionIncrement: shouldSkipVersionIncrement });

        // Set isDirty AFTER transformation to ensure it persists through all state updates
        console.log('[ADVANCED MODE] Setting isDirty=true');
        set({ isDirty: true });

        // Trigger auto-save directly (no need to recalculate via API in advanced mode)
        console.log('[ADVANCED MODE] Triggering debouncedAutoSave (will run in 2s)');
        debouncedAutoSave();
      } else {
        // Basic mode logic
        console.log('[BASIC MODE] Updating position', { id, updates, skipWageSync: options?.skipWageSync });

        // SINGLE atomic update: target position + wage sync in ONE set() call
        set((prevState) => ({
          positions: prevState.positions.map((p) => {
            if (p.id === id) {
              // Update target position with deep cloned values
              const clonedUpdates: Partial<SpreadsheetPosition> = {};
              for (const [key, value] of Object.entries(updates)) {
                clonedUpdates[key as keyof SpreadsheetPosition] = deepClone(value) as any;
              }
              return { ...p, ...clonedUpdates };
            } else if (shouldSyncWages && p.labor_category === targetLaborCategory) {
              // Wage sync: Update matching positions with ONLY wage fields (deep cloned)
              // NOTE: This only happens for manual wage changes, NOT location changes, and respects skipWageSync option
              const wageUpdates: Partial<SpreadsheetPosition> = {};
              wageFields.forEach(field => {
                if (updates[field as keyof typeof updates] !== undefined) {
                  wageUpdates[field as keyof SpreadsheetPosition] = deepClone(updates[field as keyof typeof updates]) as any;
                }
              });
              console.log(`[WAGE SYNC] Syncing to position: ${p.id} (${p.labor_category})`);
              return { ...p, ...wageUpdates };
            }
            return p;
          }),
          isDirty: true, // Set dirty immediately
        }));

        // Always transform to update advanced view (even in "basic" mode if advanced grid is displayed)
        // Skip version increment ONLY for location_type-only changes without wage updates
        const shouldSkipVersionIncrement = isLocationTypeOnlyChange && !hasWageUpdate;
        console.log('[BASIC MODE] Calling transformToAdvanced to update grid', {
          isLocationTypeOnlyChange,
          hasWageUpdate,
          shouldSkipVersionIncrement
        });
        performTransformToAdvanced({ skipVersionIncrement: shouldSkipVersionIncrement });

        // For location_type-only changes, skip recalculation
        if (!isLocationTypeOnlyChange) {
          // Trigger recalculate for UI updates
          debouncedRecalculate();
        }

        // Also trigger auto-save directly to ensure persistence
        console.log('[BASIC MODE] Triggering debouncedAutoSave (will run in 2s)');
        debouncedAutoSave();
      }
    },

    addPosition: (position) => {
      const id = `pos_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      set((state) => ({
        positions: [...state.positions, { ...position, id }],
      }));
      debouncedRecalculate();
    },

    deletePosition: (id) => {
      set((state) => ({
        positions: state.positions.filter((p) => p.id !== id),
      }));
      debouncedRecalculate();
    },

    addSubcontractor: (subcontractor) => {
      const id = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      set((state) => ({
        subcontractors: [...state.subcontractors, { ...subcontractor, id }],
        isDirty: true,
      }));
      debouncedAutoSave();
    },

    deleteSubcontractor: (id) => {
      const state = get();

      // Find the subcontractor being deleted
      const subToDelete = state.subcontractors.find(s => s.id === id);
      if (!subToDelete) {
        console.error('[DELETE SUB] Subcontractor not found:', id);
        return;
      }

      console.log('[DELETE SUB] Deleting subcontractor:', subToDelete.name);
      console.log('[DELETE SUB] Positions to return:', subToDelete.positions.length);

      // Build map of prime position ID -> updated hours (OLD FLOW only)
      const primeHoursUpdates: Record<string, Record<string, number>> = {};
      // Prime IDs that only need assigned_subcontractor_id cleared (NEW FLOW)
      const primesToClearAssignment = new Set<string>();

      // For each position in the deleted subcontractor
      subToDelete.positions.forEach(subPos => {
        if (!subPos.original_position_id) {
          console.log('[DELETE SUB] Position has no original_position_id, skipping:', subPos.labor_category);
          return;
        }

        const primeId = subPos.original_position_id;
        const primePos = state.positions.find(p => p.id === primeId);

        if (!primePos) {
          console.log('[DELETE SUB] Prime position not found:', primeId);
          return;
        }

        if (subPos.shows_in_main_grid) {
          // NEW FLOW (dropdown assignment): prime hours were never reduced, just clear assignment
          console.log('[DELETE SUB] NEW FLOW - clearing assignment for prime', primeId);
          primesToClearAssignment.add(primeId);
          return;
        }

        // OLD FLOW (convert to subcontractor): add the deleted sub's hours back to prime
        const newPrimeHours: Record<string, number> = {};

        // Get all years from both prime and sub positions
        const allYears = new Set([
          ...Object.keys(primePos.hours_per_year),
          ...Object.keys(subPos.hours_per_year)
        ]);

        allYears.forEach(year => {
          const currentPrimeHours = primePos.hours_per_year[year] || 0;
          const returningHours = subPos.hours_per_year[year] || 0;
          newPrimeHours[year] = currentPrimeHours + returningHours;
        });

        console.log('[DELETE SUB] Adding hours back to prime', primeId, ':', newPrimeHours);
        console.log('[DELETE SUB]   Current prime hours:', primePos.hours_per_year);
        console.log('[DELETE SUB]   Returning hours:', subPos.hours_per_year);

        primeHoursUpdates[primeId] = newPrimeHours;
      });

      // Update state: positions and subcontractors
      set((prevState) => {
        // Update prime positions with returned hours AND clear assigned_subcontractor_id
        const updatedPositions = prevState.positions.map(pos => {
          if (primeHoursUpdates[pos.id]) {
            // OLD FLOW: return hours and clear assignment
            return {
              ...pos,
              hours_per_year: { ...primeHoursUpdates[pos.id] },
              assigned_subcontractor_id: undefined,
            };
          }
          if (primesToClearAssignment.has(pos.id)) {
            // NEW FLOW: hours were never reduced, just clear assignment
            return {
              ...pos,
              assigned_subcontractor_id: undefined,
            };
          }
          // Also clear assignment for any other positions assigned to this subcontractor
          if (pos.assigned_subcontractor_id === id) {
            return {
              ...pos,
              assigned_subcontractor_id: undefined
            };
          }
          return pos;
        });

        return {
          positions: updatedPositions,
          subcontractors: prevState.subcontractors.filter((s) => s.id !== id),
          isDirty: true,
        };
      });

      // Re-transform to update grid display (both Basic and Advanced mode)
      if (state.advancedMode) {
        console.log('[DELETE SUB] Re-transforming to advanced mode');
        performTransformToAdvanced();
      } else {
        // In Basic Mode, also need to transform to update the grid display
        console.log('[DELETE SUB] Transforming to update grid display');
        performTransformToAdvanced({ skipVersionIncrement: true });
      }

      console.log('[DELETE SUB] Delete complete, triggering auto-save');
      debouncedAutoSave();
    },

    renameSubcontractor: (id, newName) => {
      const state = get();

      // Validate the new name
      const trimmedName = newName.trim();
      if (!trimmedName) {
        console.error('[RENAME SUB] New name cannot be empty');
        return;
      }

      // Check if another subcontractor already has this name
      const existingSubWithName = state.subcontractors.find(
        sub => sub.id !== id && sub.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (existingSubWithName) {
        console.error('[RENAME SUB] Another subcontractor already has this name:', trimmedName);
        return;
      }

      // Find the subcontractor to rename
      const subToRename = state.subcontractors.find(s => s.id === id);
      if (!subToRename) {
        console.error('[RENAME SUB] Subcontractor not found:', id);
        return;
      }

      console.log('[RENAME SUB] Renaming subcontractor:', subToRename.name, '→', trimmedName);

      // Update the subcontractor name
      set((prevState) => ({
        subcontractors: prevState.subcontractors.map(sub =>
          sub.id === id ? { ...sub, name: trimmedName } : sub
        ),
        isDirty: true,
      }));

      console.log('[RENAME SUB] Rename complete, triggering auto-save');
      debouncedAutoSave();
    },

    deleteSubcontractorPosition: (subId, posIndex) => {
      const state = get();

      // Find the subcontractor
      const sub = state.subcontractors.find(s => s.id === subId);
      if (!sub || !sub.positions[posIndex]) {
        console.error('[DELETE SUB POS] Subcontractor or position not found:', subId, posIndex);
        return;
      }

      const subPos = sub.positions[posIndex];
      console.log('[DELETE SUB POS] Deleting position:', subPos.labor_category, 'from', sub.name);
      console.log('[DELETE SUB POS] Position details:', {
        original_position_id: subPos.original_position_id,
        shows_in_main_grid: subPos.shows_in_main_grid,
      });

      // Return hours to prime position if linked (OLD FLOW: convert to subcontractor)
      // OR clear subcontractor assignment if shows_in_main_grid (NEW FLOW: dropdown assignment)
      let primeHoursUpdate: Record<string, number> | null = null;
      let primeId: string | null = null;
      let clearSubcontractorAssignment = false;

      if (subPos.original_position_id) {
        primeId = subPos.original_position_id;
        const primePos = state.positions.find(p => p.id === primeId);

        if (primePos) {
          // Check if this is a "shows in main grid" position (dropdown assignment flow)
          if (subPos.shows_in_main_grid) {
            // NEW FLOW: Just clear the subcontractor assignment, don't add hours back
            console.log('[DELETE SUB POS] Clearing subcontractor assignment from prime position');
            clearSubcontractorAssignment = true;
          } else {
            // OLD FLOW: Add the deleted sub position's hours back to current prime hours
            primeHoursUpdate = {};

            // Get all years from both prime and sub positions
            const allYears = new Set([
              ...Object.keys(primePos.hours_per_year),
              ...Object.keys(subPos.hours_per_year)
            ]);

            allYears.forEach(year => {
              const currentPrimeHours = primePos.hours_per_year[year] || 0;
              const returningHours = subPos.hours_per_year[year] || 0;
              primeHoursUpdate![year] = currentPrimeHours + returningHours;
            });

            console.log('[DELETE SUB POS] Adding hours back to prime:', primeHoursUpdate);
            console.log('[DELETE SUB POS]   Current prime hours:', primePos.hours_per_year);
            console.log('[DELETE SUB POS]   Returning hours:', subPos.hours_per_year);
          }
        } else {
          console.log('[DELETE SUB POS] Prime position not found:', primeId);
        }
      }

      // Update state
      set((prevState) => {
        // Update prime position based on the type of deletion
        let updatedPositions = prevState.positions;

        if (primeId) {
          if (clearSubcontractorAssignment) {
            // NEW FLOW: Clear the assigned_subcontractor_id
            updatedPositions = prevState.positions.map(pos => {
              if (pos.id === primeId) {
                return {
                  ...pos,
                  assigned_subcontractor_id: undefined,
                };
              }
              return pos;
            });
          } else if (primeHoursUpdate) {
            // OLD FLOW: Return hours to prime position
            updatedPositions = prevState.positions.map(pos => {
              if (pos.id === primeId) {
                return {
                  ...pos,
                  hours_per_year: { ...primeHoursUpdate! }
                };
              }
              return pos;
            });
          }
        }

        // Remove position from subcontractor
        const updatedSubcontractors = prevState.subcontractors
          .map(s => {
            if (s.id === subId) {
              const newPositions = s.positions.filter((_, idx) => idx !== posIndex);
              return { ...s, positions: newPositions };
            }
            return s;
          });

        return {
          positions: updatedPositions,
          subcontractors: updatedSubcontractors,
          isDirty: true,
        };
      });

      // Re-transform to update grid display (both Basic and Advanced mode)
      if (state.advancedMode) {
        console.log('[DELETE SUB POS] Re-transforming to advanced mode');
        performTransformToAdvanced();
      } else {
        // In Basic Mode, also need to transform to update the grid display
        console.log('[DELETE SUB POS] Transforming to update grid display');
        performTransformToAdvanced({ skipVersionIncrement: true });
      }

      console.log('[DELETE SUB POS] Delete complete, triggering auto-save');
      debouncedAutoSave();
    },

    updateSubcontractorPosition: (subId, posIndex, updates) => {
      set((state) => ({
        subcontractors: state.subcontractors.map((sub) => {
          if (sub.id === subId && sub.positions[posIndex]) {
            const updatedPositions = [...sub.positions];
            updatedPositions[posIndex] = { ...updatedPositions[posIndex], ...updates };
            return { ...sub, positions: updatedPositions };
          }
          return sub;
        }),
        isDirty: true,
      }));
      debouncedAutoSave();
    },

    getLinkedSubcontractorPosition: (positionId) => {
      const state = get();
      const position = state.positions.find(p => p.id === positionId);

      if (!position?.assigned_subcontractor_id) {
        return null;
      }

      const subcontractor = state.subcontractors.find(s => s.id === position.assigned_subcontractor_id);
      if (!subcontractor) {
        return null;
      }

      const posIndex = subcontractor.positions.findIndex(
        sp => sp.original_position_id === positionId
      );

      if (posIndex === -1) {
        return null;
      }

      return {
        subId: subcontractor.id,
        posIndex,
        subPos: subcontractor.positions[posIndex]
      };
    },

    updateLinkedBaseRate: (positionId, newBaseRate) => {
      const linked = get().getLinkedSubcontractorPosition(positionId);

      if (!linked) {
        console.warn('[UPDATE LINKED RATE] No linked subcontractor position found for:', positionId);
        return;
      }

      console.log('[UPDATE LINKED RATE]', {
        positionId,
        newBaseRate,
        subId: linked.subId,
        posIndex: linked.posIndex,
        oldRate: linked.subPos.rate
      });

      // Update the subcontractor position rate AND save to position for future toggles
      set((state) => ({
        subcontractors: state.subcontractors.map((sub) => {
          if (sub.id === linked.subId) {
            const updatedPositions = [...sub.positions];
            updatedPositions[linked.posIndex] = {
              ...updatedPositions[linked.posIndex],
              rate: newBaseRate
            };
            return { ...sub, positions: updatedPositions };
          }
          return sub;
        }),
        // ALSO update the position's last_subcontractor_base_rate
        positions: state.positions.map(p =>
          p.id === positionId
            ? { ...p, last_subcontractor_base_rate: newBaseRate }
            : p
        ),
        isDirty: true,
      }));

      // Re-transform to update main grid display
      if (get().advancedMode) {
        performTransformToAdvanced();
      }

      debouncedAutoSave();
    },

    transferSubcontractorHours: async (data) => {
      console.log('[TRANSFER] Starting transfer:', data);
      const state = get();

      // Find source subcontractor and position
      const sourceSub = state.subcontractors.find(s => s.id === data.sourceSubcontractorId);
      if (!sourceSub) {
        console.error('[TRANSFER] Source subcontractor not found:', data.sourceSubcontractorId);
        return;
      }

      const sourcePos = sourceSub.positions[data.sourcePositionIndex];
      if (!sourcePos) {
        console.error('[TRANSFER] Source position not found at index:', data.sourcePositionIndex);
        return;
      }

      console.log('[TRANSFER] Source position:', sourcePos.labor_category, 'from', sourceSub.name);

      // Find or create target subcontractor
      let targetSub = state.subcontractors.find(s => s.id === data.targetSubcontractorId);
      let isNewTargetSub = false;

      if (!targetSub && data.newSubcontractorName) {
        const newId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        targetSub = {
          id: newId,
          name: data.newSubcontractorName,
          positions: [],
        };
        isNewTargetSub = true;
        console.log('[TRANSFER] Creating new target subcontractor:', data.newSubcontractorName);
      }

      if (!targetSub) {
        console.error('[TRANSFER] No target subcontractor specified');
        return;
      }

      // Calculate remaining hours for source position after transfer
      const remainingSourceHours: Record<string, number> = {};
      let sourceHasRemainingHours = false;

      Object.entries(sourcePos.hours_per_year).forEach(([year, hours]) => {
        const transferring = data.hoursAllocation[year] || 0;
        const remaining = hours - transferring;
        remainingSourceHours[year] = remaining;
        if (remaining > 0) sourceHasRemainingHours = true;
      });

      console.log('[TRANSFER] Remaining source hours:', remainingSourceHours);

      // Check if target already has a position with the same labor_category and original_position_id
      const existingTargetPosIndex = targetSub.positions.findIndex(
        p => p.labor_category === sourcePos.labor_category &&
             p.original_position_id === sourcePos.original_position_id
      );

      // Build updated target subcontractor
      let updatedTargetSub: typeof targetSub;

      if (existingTargetPosIndex >= 0) {
        // Merge hours into existing position
        const existingPos = targetSub.positions[existingTargetPosIndex];
        const mergedHours: Record<string, number> = { ...existingPos.hours_per_year };
        Object.entries(data.hoursAllocation).forEach(([year, hours]) => {
          mergedHours[year] = (mergedHours[year] || 0) + hours;
        });

        const updatedPositions = [...targetSub.positions];
        updatedPositions[existingTargetPosIndex] = {
          ...existingPos,
          hours_per_year: mergedHours,
        };

        updatedTargetSub = { ...targetSub, positions: updatedPositions };
        console.log('[TRANSFER] Merged into existing target position');
      } else {
        // Create new position in target
        const newTargetPos: SubcontractorPosition = {
          labor_category: sourcePos.labor_category,
          rate: sourcePos.rate,
          hours_per_year: { ...data.hoursAllocation },
          ot_hours_per_year: sourcePos.ot_hours_per_year ? { ...sourcePos.ot_hours_per_year } : undefined,
          original_position_id: sourcePos.original_position_id,
          original_total_hours: sourcePos.original_total_hours,
          location_type: sourcePos.location_type,
        };

        updatedTargetSub = {
          ...targetSub,
          positions: [...targetSub.positions, newTargetPos],
        };
        console.log('[TRANSFER] Created new position in target');
      }

      // Update state
      set((prevState) => {
        let updatedSubcontractors = prevState.subcontractors.map(sub => {
          // Update source subcontractor
          if (sub.id === data.sourceSubcontractorId) {
            if (sourceHasRemainingHours) {
              // Update source position with remaining hours
              const updatedPositions = [...sub.positions];
              updatedPositions[data.sourcePositionIndex] = {
                ...sourcePos,
                hours_per_year: remainingSourceHours,
              };
              return { ...sub, positions: updatedPositions };
            } else {
              // Remove source position entirely
              return {
                ...sub,
                positions: sub.positions.filter((_, idx) => idx !== data.sourcePositionIndex),
              };
            }
          }

          // Update target subcontractor (if existing)
          if (sub.id === targetSub!.id) {
            return updatedTargetSub;
          }

          return sub;
        });

        // Add new target subcontractor if created
        if (isNewTargetSub) {
          updatedSubcontractors = [...updatedSubcontractors, updatedTargetSub];
        }

        return {
          subcontractors: updatedSubcontractors,
          isDirty: true,
        };
      });

      // Re-transform to update grid display (both Basic and Advanced mode)
      if (state.advancedMode) {
        console.log('[TRANSFER] Re-transforming to advanced mode');
        performTransformToAdvanced();
      } else {
        // In Basic Mode, also need to transform to update the grid display
        console.log('[TRANSFER] Transforming to update grid display');
        performTransformToAdvanced({ skipVersionIncrement: true });
      }

      console.log('[TRANSFER] Transfer complete, triggering auto-save');
      debouncedAutoSave();
    },

    convertToSubcontractor: async (data) => {
      console.log('🔄 Converting to subcontractor:', data);
      const state = get();
      const positionIndex = state.positions.findIndex((p) => p.id === data.positionId);
      const position = state.positions[positionIndex];

      if (!position || positionIndex === -1) {
        console.error('❌ Position not found:', data.positionId);
        return;
      }

      // 1. Create or find subcontractor
      let subcontractor = state.subcontractors.find((s) => s.id === data.subcontractorId);
      let isNewSubcontractor = false;

      if (!subcontractor && data.newSubcontractorName) {
        const newId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        subcontractor = {
          id: newId,
          name: data.newSubcontractorName,
          positions: [],
        };
        isNewSubcontractor = true;
      }

      if (!subcontractor) {
        console.error('❌ No subcontractor provided');
        return;
      }

      // 2. Calculate original_total_hours
      // This tracks the original prime hours before ANY subcontractor allocation
      // Formula: prime_hours = original_total_hours - sum(all_linked_sub_hours)
      let originalTotalHours: Record<string, number>;

      // Check if there are existing subs linked to this prime position
      const existingSubPositions = state.subcontractors.flatMap(sub =>
        sub.positions.filter(pos => pos.original_position_id === position.id)
      );

      if (existingSubPositions.length > 0 && existingSubPositions[0].original_total_hours) {
        // Copy from existing sub (they all share the same original)
        originalTotalHours = { ...existingSubPositions[0].original_total_hours };
        console.log('[CONVERT] Using existing original_total_hours:', originalTotalHours);
      } else {
        // First time converting - original = current prime hours + hours being allocated
        originalTotalHours = {};
        Object.keys(position.hours_per_year).forEach(year => {
          const primeHours = position.hours_per_year[year] || 0;
          const allocating = data.hoursAllocation[year] || 0;
          originalTotalHours[year] = primeHours + allocating;
        });
        console.log('[CONVERT] First conversion - calculated original_total_hours:', originalTotalHours);
      }

      // 3. Create subcontractor position (transfer data except rates)
      const subPosition: SubcontractorPosition = {
        labor_category: position.labor_category,
        rate: data.rate,
        original_base_rate: data.rate, // Store original rate chosen at conversion (immutable)
        hours_per_year: data.hoursAllocation,
        ot_hours_per_year: position.ot_hours_per_year ? { ...position.ot_hours_per_year } : undefined,
        original_position_id: position.id, // Link back to prime position
        original_total_hours: originalTotalHours, // Track original hours for hour return on delete
        location_type: position.location_type || 'On-Site', // Inherit from prime position
      };

      // 4. Add position to subcontractor
      const updatedSubcontractor = {
        ...subcontractor,
        positions: [...subcontractor.positions, subPosition],
      };

      // 5. Calculate remaining hours for prime position
      const remainingHours: Record<string, number> = {};

      Object.entries(position.hours_per_year).forEach(([year, hours]) => {
        const allocated = data.hoursAllocation[year] || 0;
        const remaining = hours - allocated;
        remainingHours[year] = remaining;
      });

      // 5. Update state
      set((state) => {
        const newState: any = {
          isDirty: true,
        };

        // Update or add subcontractor
        if (isNewSubcontractor) {
          newState.subcontractors = [...state.subcontractors, updatedSubcontractor];
        } else {
          newState.subcontractors = state.subcontractors.map((s) =>
            s.id === updatedSubcontractor.id ? updatedSubcontractor : s
          );
        }

        // Update prime position with remaining hours (keep even if 0 to show lineage)
        newState.positions = state.positions.map((p) =>
          p.id === position.id ? { ...p, hours_per_year: remainingHours } : p
        );

        return newState;
      });

      console.log('✅ Subcontractor added:', updatedSubcontractor);
      console.log('📊 Updated subcontractors array:', get().subcontractors);

      // 6. Trigger recalculation
      debouncedRecalculate();

      // 8. Force IMMEDIATE save to MongoDB (bypass debounce)
      if (state.proposalId) {
        console.log('💾 Forcing immediate save to MongoDB...');
        try {
          // Calculate total cost
          const totalCost = calculateGrandTotal();

          await proposalsApi.update(state.proposalId, {
            total_cost: totalCost,
            spreadsheet_data: {
              positions: get().positions,
              subcontractors: get().subcontractors,
              travel: get().travel,
              odcs: get().odcs,
              extensions: get().extensions,
              surge: get().surge,  // NEW: Save surge option
              rates: get().rates,
              escalation_rates: get().escalationRates,
              months_per_year: get().monthsPerYear,
              subcontractor_configured: get().subcontractorConfigured,
              advanced_mode: get().advancedMode,
            },
          });
          console.log('✅ Proposal saved successfully');

          // 9. Save scroll position BEFORE any state changes
          const scrollContainer = document.querySelector('.rdg');
          let savedScrollPosition = { top: 0, left: 0 };
          if (scrollContainer) {
            savedScrollPosition = {
              top: scrollContainer.scrollTop,
              left: scrollContainer.scrollLeft
            };
            get().saveScrollPosition(savedScrollPosition);
            console.log('[CONVERT] Saved scroll position before reload:', savedScrollPosition);
          }

          // 10. Invalidate cache BEFORE refetching (critical!)
          proposalCache.delete(state.proposalId);
          console.log('🗑️  Cache cleared before reload');

          // 11. Refetch proposal and reload pricing data (no page reload!)
          console.log('🔄 Refetching proposal data...');
          const freshProposal = await proposalsApi.get(state.proposalId);

          // Reload pricing data with fresh proposal
          await get().loadProposal(state.proposalId, freshProposal);

          // 12. Always retransform the positions (used by both initial and advanced mode)
          console.log('🔄 Retransforming positions...');
          performTransformToAdvanced();

          // 13. Restore scroll position after DOM updates using requestAnimationFrame
          const restoreScroll = () => {
            // Use requestAnimationFrame to wait for browser paint
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const newScrollContainer = document.querySelector('.rdg');
                const savedPosition = get().savedScrollPosition;

                if (newScrollContainer && savedPosition) {
                  console.log('[CONVERT] Attempting to restore scroll position:', savedPosition);

                  // Force scroll restoration
                  newScrollContainer.scrollTop = savedPosition.top;
                  newScrollContainer.scrollLeft = savedPosition.left;

                  // Verify it worked
                  const actualTop = newScrollContainer.scrollTop;
                  const actualLeft = newScrollContainer.scrollLeft;

                  console.log('[CONVERT] Scroll position after restore:', {
                    expected: savedPosition,
                    actual: { top: actualTop, left: actualLeft },
                    success: Math.abs(actualTop - savedPosition.top) < 5
                  });

                  // If it didn't work, try again
                  if (Math.abs(actualTop - savedPosition.top) > 5) {
                    console.log('[CONVERT] Scroll restoration failed, retrying...');
                    setTimeout(() => {
                      newScrollContainer.scrollTop = savedPosition.top;
                      newScrollContainer.scrollLeft = savedPosition.left;
                    }, 100);
                  }
                } else {
                  console.warn('[CONVERT] Could not restore scroll:', {
                    hasContainer: !!newScrollContainer,
                    hasPosition: !!savedPosition
                  });
                }
              });
            });
          };

          // Call immediately and with fallback delays
          restoreScroll();
          setTimeout(restoreScroll, 100);
          setTimeout(restoreScroll, 250);

          console.log('✅ Pricing data refreshed - subcontractor now visible!');
        } catch (error) {
          console.error('❌ Failed to save/refresh proposal:', error);
        }
      }
    },

    addTravel: (travel) => {
      const id = `travel_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      set((state) => ({
        travel: [...state.travel, { ...travel, id }],
        isDirty: true,
      }));
      debouncedAutoSave();
    },

    updateTravel: (id, updates) => {
      set((state) => ({
        travel: state.travel.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        isDirty: true,
      }));
      debouncedAutoSave();
    },

    deleteTravel: (id) => {
      set((state) => ({
        travel: state.travel.filter((t) => t.id !== id),
        isDirty: true,
      }));
      debouncedAutoSave();
    },

    addODC: (odc) => {
      const id = `odc_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      set((state) => ({
        odcs: [...state.odcs, { ...odc, id }],
        isDirty: true,
      }));
      debouncedAutoSave();
    },

    updateODC: (id, updates) => {
      set((state) => ({
        odcs: state.odcs.map((o) => (o.id === id ? { ...o, ...updates } : o)),
        isDirty: true,
      }));
      debouncedAutoSave();
    },

    deleteODC: (id) => {
      set((state) => ({
        odcs: state.odcs.filter((o) => o.id !== id),
        isDirty: true,
      }));
      debouncedAutoSave();
    },

    updateRates: (rates) => {
      const state = get();

      console.log('[STORE] updateRates called with:', rates);
      console.log('[STORE] Current rates before update:', state.rates);
      console.log('[STORE] Advanced mode:', state.advancedMode);

      // Update rates
      const newRates = { ...state.rates, ...rates };
      console.log('[STORE] New rates after merge:', newRates);

      set({
        rates: newRates,
        isDirty: true, // Mark as dirty to trigger auto-save
      });

      console.log('[STORE] Rates updated in store, isDirty set to true');

      // ALWAYS transform when rates change (used by both initial and advanced mode)
      console.log('[STORE] Calling performTransformToAdvanced (needed for table display)');
      performTransformToAdvanced();
      console.log('[STORE] Transform completed');

      // Trigger auto-save directly
      console.log('[STORE] Calling debouncedAutoSave');
      debouncedAutoSave();
    },

    updateEscalationRates: (rates) => {
      const state = get();

      // Update escalation rates
      set({
        escalationRates: { ...state.escalationRates, ...rates },
        isDirty: true, // Mark as dirty to trigger auto-save
      });

      // ALWAYS transform when escalation rates change (used by both initial and advanced mode)
      console.log('[RATES] Calling performTransformToAdvanced (needed for table display)');
      performTransformToAdvanced();
      console.log('[RATES] Transform completed');

      // Trigger auto-save directly
      console.log('[RATES] Calling debouncedAutoSave');
      debouncedAutoSave();
    },

    updateMonthsForYear: (year, months) => {
      set((state) => ({
        monthsPerYear: {
          ...state.monthsPerYear,
          [year]: Math.max(1, Math.min(12, Math.floor(months)))
        },
        isDirty: true
      }));
      debouncedRecalculate();
      debouncedAutoSave();
    },

    updateAllMonths: (monthsPerYear) => {
      const validated: Record<string, number> = {};
      Object.entries(monthsPerYear).forEach(([year, months]) => {
        validated[year] = Math.max(1, Math.min(12, Math.floor(months)));
      });
      set({ monthsPerYear: validated, isDirty: true });
      debouncedRecalculate();
      debouncedAutoSave();
    },

    updatePrimeContractorName: (name) => {
      set({ primeContractorName: name, isDirty: true });
      debouncedAutoSave();
    },

    recalculate: async () => {
      // Force immediate recalculation (bypass debounce)
      debouncedRecalculate.cancel();
      await debouncedRecalculate();
    },

    exportToExcel: async (_overrides) => {
      const state = get();
      if (!state.proposalId) return;

      try {
        console.log('Generating Excel file from proposal:', state.proposalId);

        // Save current state before exporting (ensures latest changes are in MongoDB)
        if (state.isDirty) {
          console.log('💾 Saving changes before Excel export...');
          await get().saveProposal();
        }

        // Basic mode: Export simple Excel spreadsheet matching frontend grid
        if (!state.advancedMode) {
          console.log('Exporting basic mode spreadsheet...');

          // Import XLSX library dynamically
          const XLSX = await import('xlsx');

          // Helper to calculate averaged FBLR
          const calculateAveragedFBLR = (p: SpreadsheetPosition) => {
            const isGSA = isGSAPosition(p);

            // GSA positions: Calculate averaged GSA rate across years (no indirect rates)
            if (isGSA) {
              let totalAmount = 0;
              let totalHours = 0;

              for (let year = 1; year <= state.totalYears; year++) {
                const yearStr = year.toString();
                const hoursThisYear = p.hours_per_year[yearStr] || 0;
                const gsaRate = getGSARateForYear(p, year, state.escalationRates);

                if (hoursThisYear > 0 && gsaRate > 0) {
                  totalAmount += gsaRate * hoursThisYear;
                  totalHours += hoursThisYear;
                }
              }

              if (totalHours === 0) {
                return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0, isGSA: true };
              }

              const avgRate = totalAmount / totalHours;
              // GSA: No indirect rates, FBLR = DL rate
              return { dlRate: avgRate, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: avgRate, isGSA: true };
            }

            // BLS positions: Use existing calculation with indirect rates
            const baseWage = getEffectiveSalary(p);
            if (baseWage === 0 || state.totalYears === 0) {
              return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0, isGSA: false };
            }

            let totalSalary = 0;
            let totalHours = 0;
            let currentYearWage = baseWage;
            const fteHours = p.standard_fte_hours!;

            for (let year = 1; year <= state.totalYears; year++) {
              const yearStr = year.toString();
              const hoursThisYear = p.hours_per_year[yearStr] || 0;

              // Get months for this year (default to 12)
              const monthsThisYear = state.monthsPerYear[yearStr] || 12;
              const monthFraction = monthsThisYear / 12.0;

              if (hoursThisYear > 0) {
                const hourlyRateThisYear = currentYearWage / fteHours;
                const salaryEarnedThisYear = hourlyRateThisYear * hoursThisYear;
                totalSalary += salaryEarnedThisYear;
                totalHours += hoursThisYear;
              }

              // Apply PRORATED escalation for next year
              if (year < state.totalYears) {
                const escalationKey = `${year}_to_${year + 1}`;
                const fullYearEscalation = state.escalationRates[escalationKey] || 0;
                const proratedEscalation = fullYearEscalation * monthFraction;
                currentYearWage = currentYearWage * (1 + proratedEscalation);
              }
            }

            if (totalHours === 0) {
              return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0, isGSA: false };
            }

            const dlRate = totalSalary / totalHours;
            const fringe = dlRate * state.rates.fringe;
            // Use appropriate OH rate based on position location_type (default to On-Site)
            const ohRate = p.location_type === 'Off-Site'
              ? (state.rates.oh_offsite ?? state.rates.oh_onsite ?? 0.0711)
              : (state.rates.oh_onsite ?? state.rates.oh_offsite ?? 0.0711);
            const oh = (dlRate + fringe) * ohRate;
            const ga = (dlRate + fringe + oh) * state.rates.ga;
            const fee = (dlRate + fringe + oh + ga) * state.rates.fee;
            const fblr = dlRate + fringe + oh + ga + fee;

            return { dlRate, fringe, oh, ga, fee, fblr, isGSA: false };
          };

          // Prepare data for Excel
          const excelData = state.positions.map(p => {
            const averaged = calculateAveragedFBLR(p);
            const isGSA = isGSAPosition(p);

            const row: any = {
              'Labor Category': p.labor_category,
              'Rate Source': isGSA ? 'GSA' : 'BLS',
              'Experience (yrs)': p.experience ?? '-',
              'Location': p.location ?? '-',
            };

            // Add source-specific columns
            if (isGSA) {
              row['GSA LCAT ID'] = p.gsa_lcat_id ?? '-';
              row['GSA Title'] = p.gsa_title ?? '-';
              row['GSA Rate ($/hr)'] = getEffectiveSalary(p);
            } else {
              row['BLS Code'] = p.soc_code ?? '-';
              row['BLS Category'] = p.soc_title ?? '-';
              row['Percentile'] = p.percentile;
              row['Wage 10th'] = p.wage_10th ?? 0;
              row['Wage 25th'] = p.wage_25th ?? 0;
              row['Wage 50th'] = p.wage_50th ?? 0;
              row['Wage 75th'] = p.wage_75th ?? 0;
              row['Wage 90th'] = p.wage_90th ?? 0;
              row['Selected Wage'] = getEffectiveSalary(p);
            }

            // Add year columns dynamically
            for (let i = 1; i <= state.totalYears; i++) {
              const yearLabel = i === 1 ? 'Base Year Hours' : `Option Year ${i - 1} Hours`;
              row[yearLabel] = p.hours_per_year[i.toString()] ?? 0;
            }

            // Add averaged rate columns
            row['Averaged DL Rate ($/hr)'] = averaged.dlRate.toFixed(2);
            if (!isGSA) {
              // Only show indirect rate columns for BLS positions
              row['Averaged Fringe ($/hr)'] = averaged.fringe.toFixed(2);
              row['Averaged OH ($/hr)'] = averaged.oh.toFixed(2);
              row['Averaged G&A ($/hr)'] = averaged.ga.toFixed(2);
              row['Averaged Fee ($/hr)'] = averaged.fee.toFixed(2);
            }
            row['Averaged Full Burdened Rate ($/hr)'] = averaged.fblr.toFixed(2);

            return row;
          });

          // Create workbook and worksheet
          const worksheet = XLSX.utils.json_to_sheet(excelData);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Job Positions');

          // Generate Excel file and download
          XLSX.writeFile(workbook, `${state.proposalName}_Basic.xlsx`);

          console.log('Excel file downloaded successfully');
          return;
        }

        // Use new backend endpoint that fetches proposal data from MongoDB
        const blob = await pricingApi.exportToExcel(state.proposalId);

        // Trigger download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.proposalName}_Pricing.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        console.log('Excel file downloaded successfully');

        // Mark proposal as downloaded (changes status from "In Progress" to "Submitted")
        try {
          await proposalsApi.markDownloaded(state.proposalId);
          console.log('Proposal marked as downloaded');
        } catch (error) {
          console.error('Failed to mark proposal as downloaded:', error);
          // Don't throw - the Excel was already downloaded successfully
        }
      } catch (error: any) {
        console.error('Excel export failed:', error);
        console.error('Error details:', error.response?.data);
      }
    },

    // Advanced mode actions
    enableAdvancedMode: () => {
      set({ advancedMode: true });
    },

    disableAdvancedMode: () => {
      set({ advancedMode: false });
    },

    transformToAdvanced: () => {
      // Direct synchronous call
      performTransformToAdvanced();
    },

    updateAdvancedPosition: (id, updates) => {
      console.log('[ADVANCED MODE] Updating position', { id, updates });

      const state = get();

      // Detect if wage-related or labor category fields are being updated (includes both BLS and GSA fields)
      const wageFields = ['selected_wage', 'selected_salaries', 'percentile', 'gsa_custom_rate',
                         'wage_10th', 'wage_25th', 'wage_50th', 'wage_75th', 'wage_90th',
                         'soc_code', 'soc_title', 'location', 'labor_category',
                         'gsa_lcat_id', 'gsa_title', 'gsa_rates_by_year', 'wage_source'];
      const hasWageUpdate = Object.keys(updates).some(key => wageFields.includes(key));

      // NOTE: updateAdvancedPosition is called AFTER user confirmation in the dialog
      // So we don't need to check for location changes here - the dialog already handled it
      const shouldSyncWages = hasWageUpdate;

      // If wage-related fields are being updated, sync across positions with same labor_category
      if (shouldSyncWages) {
        const targetPosition = state.positions.find(p => p.id === id);
        if (targetPosition) {
          const laborCategory = targetPosition.labor_category;
          console.log('[WAGE SYNC] Detected change for labor_category:', laborCategory);

          // Find all positions with matching labor_category (exact match)
          const matchingPositions = state.positions.filter(
            p => p.labor_category === laborCategory && p.id !== id
          );

          if (matchingPositions.length > 0) {
            console.log(`[WAGE SYNC] Found ${matchingPositions.length} matching positions to sync`);

            // Extract only wage-related updates to apply to matching positions
            const wageUpdates: Partial<AdvancedPosition> = {};
            wageFields.forEach(field => {
              if (updates[field as keyof typeof updates] !== undefined) {
                wageUpdates[field as keyof AdvancedPosition] = updates[field as keyof typeof updates] as any;
              }
            });

            // Update matching positions first
            set((prevState) => ({
              positions: prevState.positions.map((p) => {
                if (p.labor_category === laborCategory && p.id !== id) {
                  console.log(`[WAGE SYNC] Syncing to position: ${p.id}`);
                  return { ...p, ...wageUpdates };
                }
                return p;
              }),
            }));
          }
        }
      }

      // Update the underlying positions array first (WITHOUT isDirty)
      set((state) => ({
        positions: state.positions.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      }));

      // Then retransform to advanced mode to recalculate breakdown
      console.log('[ADVANCED MODE] Calling transformToAdvanced');
      performTransformToAdvanced();

      // Set isDirty AFTER transformation to ensure it persists through all state updates
      console.log('[ADVANCED MODE] Setting isDirty=true, proposalId=', get().proposalId);
      set({ isDirty: true });

      // Trigger auto-save directly (no need to recalculate via API in advanced mode)
      console.log('[ADVANCED MODE] Triggering debouncedAutoSave (will run in 2s)');
      debouncedAutoSave();
    },

    togglePositionExpansion: (id) => {
      set((state) => {
        const expanded = new Set(state.expandedPositions);
        if (expanded.has(id)) {
          expanded.delete(id);
        } else {
          expanded.add(id);
        }
        return { expandedPositions: expanded };
      });
    },

    addManualOverride: (positionId, field) => {
      set((state) => {
        const overrides = new Map(state.manualOverrides);
        if (!overrides.has(positionId)) {
          overrides.set(positionId, new Set());
        }
        overrides.get(positionId)!.add(field);
        return { manualOverrides: overrides };
      });
    },

    clearManualOverrides: (positionId) => {
      set((state) => {
        const overrides = new Map(state.manualOverrides);
        if (positionId) {
          overrides.delete(positionId);
        } else {
          overrides.clear();
        }
        return { manualOverrides: overrides };
      });
    },

    recalculateAdvanced: async () => {
      const state = get();
      if (!state.proposalId) return;

      set({ isRecalculating: true });
      console.log('Recalculating advanced mode...');

      try {
        // Note: Manual overrides are currently not sent to backend
        // TODO: Implement advanced recalculation with manual override preservation
        // const positions = state.positionsAdvanced.map((pos) => {
        //   const overrides = state.manualOverrides.get(pos.id) || new Set();
        //   // Build breakdown with manual overrides preserved
        //   const breakdown = { ...pos.breakdown };
        //   // For each year, mark which fields to skip in recalculation
        //   Object.keys(breakdown).forEach((year) => {
        //     Object.keys(breakdown[year]).forEach((field) => {
        //       if (overrides.has(`${year}.${field}`)) {
        //         (breakdown[year] as any)[`${field}_manual`] = true;
        //       }
        //     });
        //   });
        //   return { id: pos.id, percentile: pos.percentile, breakdown };
        // });

        // Call API (for now, we'll use the same recalculate endpoint)
        // TODO: Create a dedicated recalculateAdvanced endpoint
        const response = await pricingApi.recalculate({
          positions: state.positions.map((p) => ({
            id: p.id,
            percentile: p.percentile?.replace(' (default)', '') || '50th',  // Strip suffix, default to 50th
            wage_10th: p.wage_10th,
            wage_25th: p.wage_25th,
            wage_50th: p.wage_50th,
            wage_75th: p.wage_75th,
            wage_90th: p.wage_90th,
            ...buildYearHours(p.hours_per_year),
          })),
          rates: state.rates,
          escalation_rates: state.escalationRates,
          total_years: state.totalYears,
        });

        // Update positions with calculated data
        const updatedPositions = state.positions.map((pos) => {
          const result = response.results.find((r) => r.id === pos.id);
          return {
            ...pos,
            yearly_amounts: result?.years,
            total_amount: result?.total_amount,
          };
        });

        set({
          positions: updatedPositions,
          isRecalculating: false,
        });

        // Re-transform to advanced mode with new calculations
        performTransformToAdvanced();

        console.log('Advanced mode recalculation complete');
      } catch (error: any) {
        console.error('Advanced recalculation failed:', error);
        set({ isRecalculating: false });
      }
    },

    toggleRatesReference: () => {
      set((state) => ({
        ratesReferenceExpanded: !state.ratesReferenceExpanded,
      }));
    },

    setActiveTab: (tab) => {
      set({ activeTab: tab });
    },

    preCreateSubcontractors: (subs) => {
      console.log('[STORE] Pre-creating subcontractors:', subs);

      // Create subcontractor objects with empty positions array
      const newSubcontractors: Subcontractor[] = subs.map((sub) => ({
        id: `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name: sub.name,
        positions: [],
      } as Subcontractor));

      set((state) => ({
        subcontractors: [...state.subcontractors, ...newSubcontractors],
        subcontractorConfigured: true,
        isDirty: true,
      }));

      console.log('[STORE] Subcontractors pre-created:', newSubcontractors);

      // Trigger auto-save
      debouncedAutoSave();
    },

    autoAllocateWorkshare: async () => {
      const state = get();
      console.log('[AUTO-ALLOCATE] Starting workshare allocation...');

      // Filter subcontractors that have worksharePercent > 0
      const subsWithWorkshare = state.subcontractors.filter(
        (s: any) => s.worksharePercent && s.worksharePercent > 0
      );

      if (subsWithWorkshare.length === 0) {
        console.log('[AUTO-ALLOCATE] No subcontractors with workshare % found');
        return;
      }

      // Get IDs of eligible positions (exclude key positions)
      const eligiblePositionIds = state.positions
        .filter((pos) => !isKeyPosition(pos))
        .map((pos) => pos.id);
      const keyPositions = state.positions.filter((pos) => isKeyPosition(pos));

      console.log('[AUTO-ALLOCATE] Key positions excluded:', keyPositions.map(p => p.labor_category));
      console.log('[AUTO-ALLOCATE] Eligible positions:', eligiblePositionIds.length);
      console.log('[AUTO-ALLOCATE] Subcontractors with workshare:', subsWithWorkshare.map((s: any) => `${s.name}: ${s.worksharePercent}%`));

      // Build all allocations - use mutable copies that get updated as we go
      const updatedSubcontractors = [...state.subcontractors];
      const updatedPositions = state.positions.map(p => ({ ...p, hours_per_year: { ...p.hours_per_year } }));

      // IMPORTANT: Clear existing positions for subcontractors with workshare before re-allocating
      // This prevents duplicate positions if autoAllocateWorkshare is called multiple times
      for (const sub of subsWithWorkshare) {
        const subIndex = updatedSubcontractors.findIndex(s => s.id === sub.id);
        if (subIndex !== -1) {
          const existingCount = updatedSubcontractors[subIndex].positions.length;
          updatedSubcontractors[subIndex] = {
            ...updatedSubcontractors[subIndex],
            positions: [], // Clear existing positions
          };
          console.log(`[AUTO-ALLOCATE] Cleared ${existingCount} existing positions for ${sub.name}`);
        }
      }

      // Calculate total workshare percentage to determine prime's share
      const totalWorksharePercent = subsWithWorkshare.reduce(
        (sum, s: any) => sum + (s.worksharePercent || 0), 0
      ) / 100;
      const primeSharePercent = 1 - totalWorksharePercent;

      console.log(`[AUTO-ALLOCATE] Total workshare: ${totalWorksharePercent * 100}%, Prime share: ${primeSharePercent * 100}%`);

      for (const sub of subsWithWorkshare) {
        const worksharePercent = (sub as any).worksharePercent / 100; // Convert to decimal
        const subIndex = updatedSubcontractors.findIndex(s => s.id === sub.id);

        for (const posId of eligiblePositionIds) {
          const posIndex = updatedPositions.findIndex(p => p.id === posId);
          if (posIndex === -1) continue;

          const currentPosition = updatedPositions[posIndex];

          // Use FTE hours as the base for allocation (not current hours which may be reduced)
          const fteHours = currentPosition.standard_fte_hours || 1920;

          // Calculate allocation based on FTE hours
          // Each subcontractor gets: FTE * worksharePercent for each active year
          const hoursAllocation: Record<string, number> = {};
          let hasAllocation = false;

          // Get active years from the position's hours_per_year
          const activeYears = Object.keys(currentPosition.hours_per_year).filter(
            year => (currentPosition.hours_per_year[year] || 0) > 0
          );

          activeYears.forEach((year) => {
            const allocatedHours = Math.floor(fteHours * worksharePercent);
            if (allocatedHours > 0) {
              hoursAllocation[year] = allocatedHours;
              hasAllocation = true;
            }
          });

          if (!hasAllocation) continue;

          // Calculate subcontractor rate (use position's base hourly rate)
          const effectiveSalary = getEffectiveSalary(currentPosition);
          const subRate = effectiveSalary / fteHours;

          // Create subcontractor position
          const subPosition: SubcontractorPosition = {
            labor_category: currentPosition.labor_category,
            rate: subRate,
            hours_per_year: hoursAllocation,
            ot_hours_per_year: currentPosition.ot_hours_per_year ? { ...currentPosition.ot_hours_per_year } : undefined,
          };

          // Add to subcontractor
          if (subIndex !== -1) {
            updatedSubcontractors[subIndex] = {
              ...updatedSubcontractors[subIndex],
              positions: [...updatedSubcontractors[subIndex].positions, subPosition],
            };
          }

          console.log(`[AUTO-ALLOCATE] ${currentPosition.labor_category} -> ${sub.name}: ${JSON.stringify(hoursAllocation)} hours @ $${subRate.toFixed(2)}/hr`);
        }
      }

      // Now update prime positions: set hours to FTE * primeSharePercent for each active year
      for (const posId of eligiblePositionIds) {
        const posIndex = updatedPositions.findIndex(p => p.id === posId);
        if (posIndex === -1) continue;

        const currentPosition = updatedPositions[posIndex];
        const fteHours = currentPosition.standard_fte_hours || 1920;
        const primeHours = Math.floor(fteHours * primeSharePercent);

        const updatedHoursPerYear: Record<string, number> = {};

        // Only set hours for years that were originally active
        Object.keys(currentPosition.hours_per_year).forEach((year) => {
          if ((currentPosition.hours_per_year[year] || 0) > 0) {
            updatedHoursPerYear[year] = primeHours;
          } else {
            updatedHoursPerYear[year] = 0;
          }
        });

        updatedPositions[posIndex] = {
          ...currentPosition,
          hours_per_year: updatedHoursPerYear,
        };

        console.log(`[AUTO-ALLOCATE] Prime ${currentPosition.labor_category}: ${primeHours} hours/year (${primeSharePercent * 100}% of ${fteHours} FTE)`);
      }

      // Update state in batch
      set({
        positions: updatedPositions,
        subcontractors: updatedSubcontractors,
        isDirty: true,
      });

      console.log('[AUTO-ALLOCATE] Allocation complete, triggering save...');

      // Save to backend
      if (state.proposalId) {
        try {
          // Calculate total cost
          const totalCost = calculateGrandTotal();

          await proposalsApi.update(state.proposalId, {
            total_cost: totalCost,
            spreadsheet_data: {
              positions: updatedPositions,
              subcontractors: updatedSubcontractors,
              travel: state.travel,
              odcs: state.odcs,
              extensions: state.extensions,
              surge: state.surge,
              rates: state.rates,
              escalation_rates: state.escalationRates,
              months_per_year: state.monthsPerYear,
              subcontractor_configured: state.subcontractorConfigured,
              advanced_mode: state.advancedMode,
            },
          });
          console.log('[AUTO-ALLOCATE] Saved to backend successfully');

          // Invalidate cache
          proposalCache.delete(state.proposalId);
        } catch (error) {
          console.error('[AUTO-ALLOCATE] Failed to save:', error);
        }
      }
    },

    assignPositionToContractor: async (positionId: string, subcontractorId: string | null) => {
      console.log('🔄 Assigning position to contractor:', positionId, subcontractorId || 'Prime');
      const state = get();

      // Find the position
      const position = state.positions.find(p => p.id === positionId);
      if (!position) {
        console.error('❌ Position not found:', positionId);
        return;
      }

      // Case 1: Switching back to Prime
      if (subcontractorId === null) {
        console.log('📤 Returning position to Prime');

        // Save scroll position before state update
        const scrollContainer = document.querySelector('.rdg');
        let savedScrollPosition = { top: 0, left: 0 };
        if (scrollContainer) {
          savedScrollPosition = {
            top: scrollContainer.scrollTop,
            left: scrollContainer.scrollLeft
          };
          console.log('[RETURN TO PRIME] Saved scroll position:', savedScrollPosition);
        }

        // Update position to remove subcontractor assignment but preserve the last edited rate
        const updatedPositions = state.positions.map(p => {
          if (p.id === positionId) {
            // Find the current subcontractor position to get its rate
            const currentSub = state.subcontractors.find(s => s.id === p.assigned_subcontractor_id);
            const subPos = currentSub?.positions.find(sp =>
              sp.original_position_id === positionId && sp.shows_in_main_grid
            );

            console.log(`💾 Preserving edited rate: $${subPos?.rate?.toFixed(2) || 'N/A'}/hr`);

            return {
              ...p,
              assigned_subcontractor_id: undefined,
              last_subcontractor_base_rate: subPos?.rate // Preserve the edited rate
            };
          }
          return p;
        });

        // Remove from subcontractor's positions array
        const updatedSubcontractors = state.subcontractors.map(sub => ({
          ...sub,
          positions: sub.positions.filter(subPos =>
            subPos.original_position_id !== positionId || !subPos.shows_in_main_grid
          ),
        }));

        set({
          positions: updatedPositions,
          subcontractors: updatedSubcontractors,
          isDirty: true,
        });

        // Re-transform to update grid immediately
        performTransformToAdvanced();

        // Restore scroll position after transform
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const newScrollContainer = document.querySelector('.rdg');
            if (newScrollContainer && savedScrollPosition.top > 0) {
              newScrollContainer.scrollTop = savedScrollPosition.top;
              newScrollContainer.scrollLeft = savedScrollPosition.left;
              console.log('[RETURN TO PRIME] Restored scroll position:', savedScrollPosition);
            }
          });
        });

        console.log('✅ Position returned to Prime');
        await get().saveProposal();
        return;
      }

      // Case 2: Assigning to a subcontractor
      console.log('📥 Assigning to subcontractor...');

      const subcontractor = state.subcontractors.find(s => s.id === subcontractorId);
      if (!subcontractor) {
        console.error('❌ Subcontractor not found:', subcontractorId);
        return;
      }

      // Calculate base rate from FBLR
      let fblr: number;

      // Check if GSA position
      if (isGSAPosition(position)) {
        // GSA: Rate is already fully burdened, use directly
        console.log('[ASSIGN_TO_SUB] GSA position detected');
        console.log('[ASSIGN_TO_SUB] gsa_rates_by_year:', position.gsa_rates_by_year);

        const discountRate = position.gsa_discount_rate || 0;
        const gsaRate = getGSARateForYear(position, 1, state.escalationRates);
        fblr = gsaRate * (1 - discountRate);
        console.log('[ASSIGN_TO_SUB] Final FBLR after discount:', fblr);
      } else {
        // BLS: Calculate FBLR from annual salary
        console.log('[ASSIGN_TO_SUB] BLS position detected');
        const effectiveSalary = getEffectiveSalary(position);
        const fteHours = position.standard_fte_hours || 1920;
        const dlRate = effectiveSalary / fteHours;

        // Calculate FBLR using prime rates
        const fringeRate = state.rates.fringe || 0.247;
        const ohRate = (position.location_type === 'Off-Site' ? state.rates.oh_offsite : state.rates.oh_onsite) || 0.0711;
        const gaRate = state.rates.ga || 0.2243;
        const feeRate = state.rates.fee || 0.08;

        const fringeAmount = dlRate * fringeRate;
        const ohAmount = (dlRate + fringeAmount) * ohRate;
        const gaAmount = (dlRate + fringeAmount + ohAmount) * gaRate;
        const feeAmount = (dlRate + fringeAmount + ohAmount + gaAmount) * feeRate;
        fblr = dlRate + fringeAmount + ohAmount + gaAmount + feeAmount;
        console.log('[ASSIGN_TO_SUB] Calculated FBLR:', fblr);
      }

      // Check if there's a previously edited rate to preserve
      const subFee = state.rates.sub_fee || 0;
      const smh = state.rates.smh || 0;
      const gaPassthrough = state.rates.ga_passthrough || 0;
      const markupDivisor = 1 + smh + gaPassthrough + subFee;
      let baseRate: number;
      let ratesPerYear: Record<string, number> | undefined;

      if (position.last_subcontractor_base_rate !== undefined) {
        // Reuse the last edited rate
        baseRate = position.last_subcontractor_base_rate;
        console.log(`💾 Reusing previously edited rate: $${baseRate.toFixed(2)}/hr`);
      } else if (isGSAPosition(position) && position.gsa_rates_by_year) {
        // GSA: back-calculate per-year rates using PROPOSAL YEAR keys (1, 2, 3...)
        // gsa_rates_by_year uses contract year keys (e.g. 3, 4, 5 when gsa_current_year=3)
        // but hours_per_year and all lookups use proposal year keys (1, 2, 3...)
        // so we must use getGSARateForYear() which handles the gsa_current_year offset
        const discountRate = position.gsa_discount_rate || 0;
        ratesPerYear = {};
        Object.keys(position.hours_per_year).forEach((yearStr) => {
          const proposalYear = parseInt(yearStr);
          const gsaYearRate = getGSARateForYear(position, proposalYear, state.escalationRates);
          ratesPerYear![yearStr] = (gsaYearRate * (1 - discountRate)) / markupDivisor;
        });
        baseRate = ratesPerYear['1'] ?? fblr / markupDivisor;
        console.log(`💰 GSA per-year rates calculated (proposal-year keys):`, ratesPerYear);
      } else {
        // BLS: back-calculate from FBLR
        baseRate = fblr / markupDivisor;
        console.log(`💰 Calculated base rate: $${baseRate.toFixed(2)}/hr (from FBLR: $${fblr.toFixed(2)}/hr)`);
      }

      // Update position with subcontractor assignment
      const updatedPositions = state.positions.map(p =>
        p.id === positionId
          ? { ...p, assigned_subcontractor_id: subcontractorId }
          : p
      );

      // Create SubcontractorPosition for the Subcontractor tab
      const subPosition: SubcontractorPosition = {
        labor_category: position.labor_category,
        rate: baseRate,
        original_base_rate: baseRate,
        rates_per_year: ratesPerYear,
        hours_per_year: { ...position.hours_per_year },
        ot_hours_per_year: position.ot_hours_per_year ? { ...position.ot_hours_per_year } : undefined,
        original_position_id: position.id,
        original_total_hours: { ...position.hours_per_year },
        location_type: position.location_type,
        shows_in_main_grid: true, // KEY FLAG - this position shows in main grid
      };

      // Add to subcontractor (or update if already exists)
      const updatedSubcontractors = state.subcontractors.map(s => {
        if (s.id === subcontractorId) {
          // Remove any existing shows_in_main_grid position for this positionId (to avoid duplicates)
          const filteredPositions = s.positions.filter(p =>
            !(p.original_position_id === positionId && p.shows_in_main_grid)
          );
          return {
            ...s,
            positions: [...filteredPositions, subPosition],
          };
        }
        return s;
      });

      // Save scroll position before state update
      const scrollContainer = document.querySelector('.rdg');
      let savedScrollPosition = { top: 0, left: 0 };
      if (scrollContainer) {
        savedScrollPosition = {
          top: scrollContainer.scrollTop,
          left: scrollContainer.scrollLeft
        };
        console.log('[ASSIGN] Saved scroll position:', savedScrollPosition);
      }

      set({
        positions: updatedPositions,
        subcontractors: updatedSubcontractors,
        isDirty: true,
      });

      // Re-transform to update grid immediately
      performTransformToAdvanced();

      console.log('✅ Position assigned to subcontractor');

      // Save first, then restore scroll after all renders complete
      await get().saveProposal();

      // Restore scroll position after save completes (which triggers more renders)
      const restoreScroll = () => {
        const newScrollContainer = document.querySelector('.rdg');
        if (newScrollContainer && savedScrollPosition.top > 0) {
          newScrollContainer.scrollTop = savedScrollPosition.top;
          newScrollContainer.scrollLeft = savedScrollPosition.left;
          console.log('[ASSIGN] Restored scroll position:', savedScrollPosition);
        }
      };

      // Multiple attempts to ensure it sticks through all re-renders
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          restoreScroll();
          setTimeout(restoreScroll, 50);
          setTimeout(restoreScroll, 150);
          setTimeout(restoreScroll, 300);
        });
      });
    },

    saveScrollPosition: (position) => {
      console.log('[SCROLL] Saving scroll position:', position);
      set({ savedScrollPosition: position });
    },

    restoreScrollPosition: () => {
      const pos = get().savedScrollPosition;
      if (pos) {
        console.log('[SCROLL] Restoring scroll position:', pos);
        set({ savedScrollPosition: null }); // Clear after use
      }
      return pos;
    },

    // Manual save function (immediate, non-debounced)
    saveProposal: async () => {
      const state = get();

      console.log('[MANUAL-SAVE] Save button clicked', {
        proposalId: state.proposalId,
        isDirty: state.isDirty,
        positions: state.positions.length,
      });

      if (!state.proposalId) {
        console.warn('[MANUAL-SAVE] SKIPPED - No proposal ID');
        return { success: false, error: 'No proposal loaded' };
      }

      set({ isSaving: true });
      console.log('💾 Manual save initiated...');

      try {
        // Calculate total cost from all positions
        const totalCost = calculateGrandTotal();

        await proposalsApi.update(state.proposalId, {
          prime_contractor_name: state.primeContractorName,
          total_cost: totalCost,
          spreadsheet_data: {
            positions: state.positions,
            subcontractors: state.subcontractors,
            travel: state.travel,
            odcs: state.odcs,
            extensions: state.extensions,
            surge: state.surge,
            rates: state.rates,
            escalation_rates: state.escalationRates,
            months_per_year: state.monthsPerYear,
            subcontractor_configured: state.subcontractorConfigured,
            advanced_mode: state.advancedMode,
          },
        });

        console.log('✅ Manual save successful!');
        console.log('   - Positions saved:', state.positions.length);
        console.log('   - Subcontractors saved:', state.subcontractors.length);

        // Invalidate cache so next load fetches fresh data from MongoDB
        if (state.proposalId) {
          proposalCache.delete(state.proposalId);
          console.log('🗑️  Cache invalidated for proposal:', state.proposalId);
        }

        set({
          isDirty: false,
          isSaving: false,
          lastSaved: new Date(),
        });

        // Track proposal creation/save event in HubSpot
        trackHubSpotEvent('proposal_created', {
          position_count: state.positions.length,
          mode: state.advancedMode ? 'advanced' : 'basic',
        });

        return { success: true };
      } catch (error: any) {
        console.error('❌ Manual save failed:', error);
        console.error('   - Error details:', error.response?.data || error.message);
        set({ isSaving: false });
        return { success: false, error: error.response?.data?.detail || error.message || 'Save failed' };
      }
    },

    reset: () => {
      set({
        proposalId: null,
        proposalName: '',
        solicitationNumber: '',
        primeContractorName: 'TBD',
        dcaaContact: '',
        positions: [],
        subcontractors: [],
        travel: [],
        odcs: [],
        extensions: [],
        surge: null,  // NEW: Surge option reset to null
        rates: {} as IndirectRates,  // Will be populated from backend (org settings)
        escalationRates: {} as EscalationRates,  // Will be populated from backend (org settings)
        wageSource: { type: 'bls' } as WageSource,  // Reset to default BLS
        totalYears: 1,
        baseYears: 1,
        optionYears: 0,
        isDirty: false,
        isRecalculating: false,
        isSaving: false,
        lastSaved: null,
        error: null,
        // Reset advanced mode state
        advancedMode: false,
        subcontractorConfigured: false,
        positionsAdvanced: [],
        expandedPositions: new Set<string>(),
        manualOverrides: new Map<string, Set<string>>(),
        aggregates: {
          totalDL: 0,
          totalFringe: 0,
          totalOH: 0,
          totalGA: 0,
          totalFee: 0,
          totalFBLR: 0,
          totalOT: 0,
          byYear: {},
        },
        ratesReferenceExpanded: false,
        advancedModeVersion: 0,
        activeTab: 'overview',
        savedScrollPosition: null,
      });
    },
  };
});

// Expose store to window for debugging (dev only)
if (typeof window !== 'undefined') {
  (window as any).pricingStore = usePricingStore;
}
