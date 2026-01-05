import { create } from 'zustand';
import { debounce } from 'lodash-es';
import {
  SpreadsheetPosition,
  Subcontractor,
  TravelItem,
  ODCItem,
  Extension,
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
  activeTab: 'files' | 'overview' | 'main' | 'subcontractors' | 'rate-table';

  // Actions
  loadProposal: (proposalId: string, existingProposal?: Proposal) => Promise<void>;
  updatePosition: (id: string, updates: Partial<SpreadsheetPosition>) => void;
  addPosition: (position: Omit<SpreadsheetPosition, 'id'>) => void;
  deletePosition: (id: string) => void;
  addSubcontractor: (subcontractor: Omit<Subcontractor, 'id'>) => void;
  deleteSubcontractor: (id: string) => void;
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
  setActiveTab: (tab: 'files' | 'overview' | 'main' | 'subcontractors' | 'rate-table') => void;
  preCreateSubcontractors: (subs: { name: string; worksharePercent: number }[]) => void;
  autoAllocateWorkshare: () => Promise<void>;
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
    experience: job.experience,
    location: job.location,
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
    standard_fte_hours: job.standard_fte_hours,
    yearly_amounts: [],
    total_amount: 0,
    // GSA-specific fields
    wage_source: job.wage_source,
    gsa_lcat_id: job.gsa_lcat_id,
    gsa_title: job.gsa_title,
    gsa_rates_by_year: job.gsa_rates_by_year,
    gsa_current_year: job.gsa_current_year,
    // Key position flag
    is_key_position: job.is_key_position,
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
  // Helper function for actual transformation logic
  const performTransformToAdvanced = () => {
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
          const originalGsaRate = getGSARateForYear(pos, yearNum);

          // Apply discount if set by user
          const discountRate = pos.gsa_discount_rate || 0;
          const gsaRate = originalGsaRate * (1 - discountRate);

          const gsaBreakdown = reverseEngineerGSARate(gsaRate, state.rates);

          const dlAmount = gsaBreakdown.dlRate * hours;
          const fringeAmount = gsaBreakdown.fringe * hours;
          const ohAmount = gsaBreakdown.oh * hours;
          const gaAmount = gsaBreakdown.ga * hours;
          const feeAmount = gsaBreakdown.fee * hours;
          const totalAmount = gsaBreakdown.fblr * hours;

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
            fblr: gsaBreakdown.fblr, // Should approximately equal gsaRate
            totalAmount,
          };
        } else {
          // BLS positions: Calculate with indirect rates and escalation
          // Use getEffectiveSalary to handle multi-select averaging
          const baseWage = getEffectiveSalary(pos);

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
          const standardFTEHours = pos.standard_fte_hours!; // Always provided by jd_parser
          const dlRate = wage / standardFTEHours;
          const dlAmount = dlRate * hours;

          const fringe = dlRate * state.rates.fringe;
          const fringeAmount = fringe * hours;

          // Determine which OH rate to use based on location_type
          // Fallback: oh_onsite/oh_offsite → oh → 0.0711
          const ohOnsite = state.rates.oh_onsite !== undefined ? state.rates.oh_onsite : (state.rates.oh !== undefined ? state.rates.oh : 0.0711);
          const ohOffsite = state.rates.oh_offsite !== undefined ? state.rates.oh_offsite : (state.rates.oh !== undefined ? state.rates.oh : 0.0711);
          const ohRate = pos.location_type === 'On-Site' ? ohOnsite : ohOffsite;
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
      byYear: {},
    };

    advanced.forEach((pos) => {
      Object.entries(pos.breakdown).forEach(([year, breakdown]) => {
        if (!aggregates.byYear[year]) {
          aggregates.byYear[year] = {
            dl: 0,
            fringe: 0,
            oh: 0,
            ga: 0,
            fee: 0,
            fblr: 0,
            totalAmount: 0,
          };
        }

        aggregates.byYear[year].dl += breakdown.dlAmount;
        aggregates.byYear[year].fringe += breakdown.fringeAmount;
        aggregates.byYear[year].oh += breakdown.ohAmount;
        aggregates.byYear[year].ga += breakdown.gaAmount;
        aggregates.byYear[year].fee += breakdown.feeAmount;
        aggregates.byYear[year].fblr += breakdown.totalAmount;
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

    // Increment version to force React re-render
    const newVersion = state.advancedModeVersion + 1;
    console.log('[TRANSFORM] Setting new version:', newVersion);

    set({
      positionsAdvanced: advanced,
      aggregates,
      advancedModeVersion: newVersion
    });

    console.log('[TRANSFORM] State updated - should trigger re-render');
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
          percentile: p.percentile,
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
      // Calculate total cost from all positions
      const totalCost = state.positions.reduce((sum, position) => {
        const positionTotal = position.total_amount || 0;
        return sum + positionTotal;
      }, 0);

      await proposalsApi.update(state.proposalId, {
        prime_contractor_name: state.primeContractorName,  // Save at proposal level
        total_cost: totalCost,  // Add total cost calculation
        spreadsheet_data: {
          positions: state.positions,
          subcontractors: state.subcontractors,
          travel: state.travel,
          odcs: state.odcs,
          extensions: state.extensions,
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
      byYear: {},
    },
    ratesReferenceExpanded: false,
    advancedModeVersion: 0,
    activeTab: 'overview',

    loadProposal: async (proposalId, existingProposal) => {
      try {
        // If existingProposal is provided, skip cache (it's fresh data)
        if (!existingProposal) {
          // Check cache only when fetching from API
          const cachedData = getCachedProposal(proposalId);
          if (cachedData) {
            set(cachedData);
            return;
          }
        }

        // Use existing proposal data if provided, otherwise fetch
        const proposal = existingProposal || await proposalsApi.get(proposalId);

        // Extract positions from jobs or spreadsheet_data
        let positions: SpreadsheetPosition[] = [];
        let positionsFromJobs = false; // Track if we need to save new IDs

        // Get standard FTE hours from metadata (contract-level setting)
        const standardFteHours = proposal.metadata?.fte_hours_threshold;

        if (proposal.spreadsheet_data?.positions && proposal.spreadsheet_data.positions.length > 0) {
          positions = proposal.spreadsheet_data.positions;
          // Apply standard_fte_hours from metadata to all positions
          if (standardFteHours) {
            positions = positions.map((pos) => ({
              ...pos,
              standard_fte_hours: standardFteHours
            }));
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
        const advancedMode = proposal.spreadsheet_data?.advanced_mode || false;

        // Migrate old 'oh' field to 'oh_onsite' and 'oh_offsite'
        let rates = proposal.spreadsheet_data?.rates || proposal.rates;
        if (rates && rates.oh !== undefined && !rates.oh_onsite) {
          console.log('[MIGRATION] Migrating old OH rate to on-site/off-site rates');
          rates = {
            ...rates,
            oh_onsite: rates.oh,
            oh_offsite: rates.oh,
          };
          delete rates.oh;
        }

        set({
          proposalId,
          proposalName: proposal.name,
          solicitationNumber: proposal.solicitation_number,
          primeContractorName,
          dcaaContact: proposal.dcaa_contact || '',
          positions,
          subcontractors: proposal.spreadsheet_data?.subcontractors || [],
          travel: proposal.spreadsheet_data?.travel || [],
          odcs: proposal.spreadsheet_data?.odcs || [],
          extensions: proposal.spreadsheet_data?.extensions || [],
          rates: rates,  // Use migrated rates
          escalationRates: proposal.spreadsheet_data?.escalation_rates || proposal.escalation_rates,  // Try spreadsheet_data first
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
          subcontractors: proposal.spreadsheet_data?.subcontractors || [],
          travel: proposal.spreadsheet_data?.travel || [],
          odcs: proposal.spreadsheet_data?.odcs || [],
          extensions: proposal.spreadsheet_data?.extensions || [],
          rates: rates,  // Use migrated rates
          escalationRates: proposal.spreadsheet_data?.escalation_rates || proposal.escalation_rates,  // Try spreadsheet_data first
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
            const totalCost = positions.reduce((sum, pos) => sum + (pos.total_amount || 0), 0);
            await proposalsApi.update(proposalId, {
              prime_contractor_name: primeContractorName,
              total_cost: totalCost,
              spreadsheet_data: {
                positions,
                subcontractors: proposal.spreadsheet_data?.subcontractors || [],
                travel: proposal.spreadsheet_data?.travel || [],
                odcs: proposal.spreadsheet_data?.odcs || [],
                extensions: proposal.spreadsheet_data?.extensions || [],
                rates: rates,  // Use migrated rates
                escalation_rates: proposal.spreadsheet_data?.escalation_rates || proposal.escalation_rates,
                months_per_year: proposal.metadata?.months_per_year || defaultMonthsPerYear,
                subcontractor_configured: subcontractorConfigured,
                advanced_mode: advancedMode,
              },
            });
            console.log('[LOAD] ✅ Positions saved to spreadsheet_data');
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

    updatePosition: (id, updates) => {
      console.log('[BASIC MODE] Updating position', { id, updates });

      set((state) => ({
        positions: state.positions.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
        isDirty: true, // Set dirty immediately
      }));

      // Trigger recalculate for UI updates
      debouncedRecalculate();

      // Also trigger auto-save directly to ensure persistence
      console.log('[BASIC MODE] Triggering debouncedAutoSave (will run in 2s)');
      debouncedAutoSave();
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
      set((state) => ({
        subcontractors: state.subcontractors.filter((s) => s.id !== id),
        isDirty: true,
      }));
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

      // 2. Create subcontractor position (transfer data except rates)
      const subPosition: SubcontractorPosition = {
        labor_category: position.labor_category,
        rate: data.rate,
        hours_per_year: data.hoursAllocation,
        original_position_id: position.id, // Link back to prime position
        location_type: position.location_type || 'On-Site', // Inherit from prime position
      };

      // 3. Add position to subcontractor
      const updatedSubcontractor = {
        ...subcontractor,
        positions: [...subcontractor.positions, subPosition],
      };

      // 4. Calculate remaining hours for prime position
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

      // 6. Update backend with subcontractor hours
      if (state.proposalId) {
        try {
          // Calculate total allocated subcontractor hours
          const totalSubHours = Object.values(data.hoursAllocation).reduce(
            (sum, hours) => sum + hours,
            0
          );

          // Call backend API to update position
          await proposalsApi.updatePositionSubcontractorHours(
            state.proposalId,
            positionIndex,
            totalSubHours
          );

          console.log(`✅ Backend updated: position ${positionIndex} with ${totalSubHours} subcontractor hours`);
        } catch (error) {
          console.error('❌ Failed to update backend:', error);
        }
      }

      // 7. Trigger recalculation
      debouncedRecalculate();

      // 8. Force IMMEDIATE save to MongoDB (bypass debounce)
      if (state.proposalId) {
        console.log('💾 Forcing immediate save to MongoDB...');
        try {
          // Calculate total cost
          const positions = get().positions;
          const totalCost = positions.reduce((sum, position) => {
            const positionTotal = position.total_amount || 0;
            return sum + positionTotal;
          }, 0);

          await proposalsApi.update(state.proposalId, {
            total_cost: totalCost,
            spreadsheet_data: {
              positions: get().positions,
              subcontractors: get().subcontractors,
              travel: get().travel,
              odcs: get().odcs,
              extensions: get().extensions,
              rates: get().rates,
              escalation_rates: get().escalationRates,
              months_per_year: get().monthsPerYear,
              subcontractor_configured: get().subcontractorConfigured,
              advanced_mode: get().advancedMode,
            },
          });
          console.log('✅ Proposal saved successfully');

          // 9. Invalidate cache BEFORE refetching (critical!)
          proposalCache.delete(state.proposalId);
          console.log('🗑️  Cache cleared before reload');

          // 10. Refetch proposal and reload pricing data (no page reload!)
          console.log('🔄 Refetching proposal data...');
          const freshProposal = await proposalsApi.get(state.proposalId);

          // Reload pricing data with fresh proposal
          await get().loadProposal(state.proposalId, freshProposal);

          // 11. Always retransform the positions (used by both initial and advanced mode)
          console.log('🔄 Retransforming positions...');
          performTransformToAdvanced();

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
      });

      console.log('[STORE] Rates updated in store');

      // ALWAYS transform when rates change (used by both initial and advanced mode)
      console.log('[STORE] Calling performTransformToAdvanced (needed for table display)');
      performTransformToAdvanced();
      console.log('[STORE] Transform completed');

      // Still trigger API recalculation in background
      console.log('[STORE] Calling debouncedRecalculate');
      debouncedRecalculate();
    },

    updateEscalationRates: (rates) => {
      const state = get();

      // Update escalation rates
      set({
        escalationRates: { ...state.escalationRates, ...rates },
      });

      // ALWAYS transform when escalation rates change (used by both initial and advanced mode)
      console.log('[RATES] Calling performTransformToAdvanced (needed for table display)');
      performTransformToAdvanced();
      console.log('[RATES] Transform completed');

      // Still trigger API recalculation in background
      debouncedRecalculate();
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

    exportToExcel: async (overrides) => {
      const state = get();
      if (!state.proposalId) return;

      // Use override if provided, otherwise use store value
      const primeContractorName = overrides?.primeContractorName || state.primeContractorName || 'TBD';

      try {
        console.log('Generating Excel file...');
        console.log('[EXPORT] Using prime contractor name:', primeContractorName);

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
                const gsaRate = getGSARateForYear(p, year);

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

        // Advanced mode: Export full cost proposal (existing logic)
        console.log('Exporting advanced cost proposal...');

        // Split rates object into backend-expected structure
        const payload = {
          jobs: state.positions.map((p) => {
            const effectiveSalary = getEffectiveSalary(p);
            console.log(`[EXPORT] Position "${p.labor_category}": selected_wage=${effectiveSalary}, percentile=${p.percentile}, wage_${p.percentile}=${p[`wage_${p.percentile}` as keyof typeof p]}, selected_salaries=${p.selected_salaries?.join(',') || 'none'}`);
            return {
              labor_category: p.labor_category,
              soc_code: p.soc_code,
              soc_title: p.soc_title,  // Add BLS Category name for Excel export
              hours_per_year: p.hours_per_year,
              selected_wage: effectiveSalary,
              percentile: p.percentile,
              wage_10th: p.wage_10th,
              wage_25th: p.wage_25th,
              wage_50th: p.wage_50th,
              wage_75th: p.wage_75th,
              wage_90th: p.wage_90th,
              standard_fte_hours: p.standard_fte_hours!,
              location_type: p.location_type || 'On-Site',  // Add location_type for OH rate selection
            };
          }),
          project_config: {
            solicitation_number: state.solicitationNumber || '',
            prime_contractor_name: primeContractorName,
            subcontractor_names: state.subcontractors.map(s => s.name),
            dcaa_contact: state.dcaaContact || '',
            total_years: state.totalYears,
            base_years: state.baseYears,
            escalation_rates: state.escalationRates,
            indirect_rates: {
              fringe: state.rates.fringe,
              oh_onsite: state.rates.oh_onsite,
              oh_offsite: state.rates.oh_offsite,
              ga: state.rates.ga,
            },
            passthrough_rates: {
              smh: state.rates.smh || 0,
              ga: state.rates.ga_passthrough || 0,
            },
            fee_rates: {
              prime_labor: state.rates.fee,
              sub_labor: state.rates.sub_fee || 0,
            },
            ga_adder_rate: state.rates.ga_adder || 0,
            subcontractors: state.subcontractors.map(sub => ({
              name: sub.name,
              labor_categories: sub.positions.map(pos => {
                const laborCat: any = {
                  labor_category: pos.labor_category,
                  ecraft_code: '',
                };

                // Convert hours_per_year dict to year_N_rate and year_N_hours format
                Object.entries(pos.hours_per_year).forEach(([year, hours]) => {
                  const yearNum = parseInt(year);
                  laborCat[`year_${yearNum}_rate`] = pos.rate;
                  laborCat[`year_${yearNum}_hours`] = hours;
                });

                return laborCat;
              })
            })),
            travel: state.travel,
            odcs: state.odcs,
            extensions: state.extensions,
            include_rate_table: true,
          },
        };

        console.log('[EXPORT] Rates being sent:', {
          indirect_rates: payload.project_config.indirect_rates,
          fee_rates: payload.project_config.fee_rates,
          escalation_rates: payload.project_config.escalation_rates,
        });
        console.log('[EXPORT] Travel items:', payload.project_config.travel);
        console.log('[EXPORT] ODC items:', payload.project_config.odcs);

        const blob = await pricingApi.exportToExcel(payload as any);

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
            percentile: p.percentile,
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
        // Store workshare percent as metadata (optional, for future use)
        worksharePercent: sub.worksharePercent,
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
          const totalCost = updatedPositions.reduce((sum, position) => {
            const positionTotal = position.total_amount || 0;
            return sum + positionTotal;
          }, 0);

          await proposalsApi.update(state.proposalId, {
            total_cost: totalCost,
            spreadsheet_data: {
              positions: updatedPositions,
              subcontractors: updatedSubcontractors,
              travel: state.travel,
              odcs: state.odcs,
              extensions: state.extensions,
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
          byYear: {},
        },
        ratesReferenceExpanded: false,
        advancedModeVersion: 0,
        activeTab: 'overview',
      });
    },
  };
});

// Expose store to window for debugging (dev only)
if (typeof window !== 'undefined') {
  (window as any).pricingStore = usePricingStore;
}
