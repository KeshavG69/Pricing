import { create } from 'zustand';
import { debounce } from 'lodash-es';
import {
  SpreadsheetPosition,
  Subcontractor,
  ODCItem,
  IndirectRates,
  EscalationRates,
  JobPosition,
  AdvancedPosition,
  Aggregates,
  ConversionData,
  SubcontractorPosition,
  Proposal,
} from '@/types';
import { pricingApi } from '../api/pricing';
import { proposalsApi } from '../api/proposals';

interface PricingState {
  // Data
  proposalId: string | null;
  proposalName: string;
  solicitationNumber?: string;
  primeContractorName: string;
  dcaaContact: string;
  positions: SpreadsheetPosition[];
  subcontractors: Subcontractor[];
  odcs: ODCItem[];
  rates: IndirectRates;
  escalationRates: EscalationRates;

  // Metadata
  totalYears: number;
  baseYears: number;
  optionYears: number;
  isDirty: boolean;
  isRecalculating: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  error: string | null;

  // Advanced mode state
  advancedMode: boolean;
  positionsAdvanced: AdvancedPosition[];
  expandedPositions: Set<string>;
  manualOverrides: Map<string, Set<string>>;
  aggregates: Aggregates;
  ratesReferenceExpanded: boolean;
  activeTab: 'overview' | 'main' | 'rate-table';

  // Actions
  loadProposal: (proposalId: string, existingProposal?: Proposal) => Promise<void>;
  updatePosition: (id: string, updates: Partial<SpreadsheetPosition>) => void;
  addPosition: (position: Omit<SpreadsheetPosition, 'id'>) => void;
  deletePosition: (id: string) => void;
  addSubcontractor: (subcontractor: Omit<Subcontractor, 'id'>) => void;
  deleteSubcontractor: (id: string) => void;
  convertToSubcontractor: (data: ConversionData) => Promise<void>;
  addODC: (odc: Omit<ODCItem, 'id'>) => void;
  updateODC: (id: string, updates: Partial<ODCItem>) => void;
  deleteODC: (id: string) => void;
  updateRates: (rates: Partial<IndirectRates>) => void;
  updateEscalationRates: (rates: Partial<EscalationRates>) => void;
  recalculate: () => Promise<void>;
  exportToExcel: () => Promise<void>;
  reset: () => void;

  // Advanced mode actions
  enableAdvancedMode: () => void;
  transformToAdvanced: () => void;
  updateAdvancedPosition: (id: string, updates: Partial<AdvancedPosition>) => void;
  togglePositionExpansion: (id: string) => void;
  addManualOverride: (positionId: string, field: string) => void;
  clearManualOverrides: (positionId?: string) => void;
  recalculateAdvanced: () => Promise<void>;
  toggleRatesReference: () => void;
  setActiveTab: (tab: 'overview' | 'main' | 'rate-table') => void;
}

// Helper to map JobPosition to SpreadsheetPosition
const mapJobToPosition = (job: JobPosition, index: number): SpreadsheetPosition => {
  // Find first available percentile with a valid wage
  let percentile = job.selected_percentile || '50th';

  // Validate that the percentile has a wage value
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
    selected_wage: job.selected_wage, // Use the wage selected by backend based on experience
    hours_per_year: job.hours_per_year || { '1': job.hours || 1880 },
    yearly_amounts: [],
    total_amount: 0,
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
    if (!state.proposalId || !state.isDirty) return;

    set({ isSaving: true });
    console.log('💾 Attempting auto-save to MongoDB...');

    try {
      await proposalsApi.update(state.proposalId, {
        spreadsheet_data: {
          positions: state.positions,
          subcontractors: state.subcontractors,
          odcs: state.odcs,
          rates: state.rates,
          escalation_rates: state.escalationRates,
        },
      });

      console.log('✅ Auto-save successful!');
      console.log('   - Positions saved:', state.positions.length);
      console.log('   - Subcontractors saved:', state.subcontractors.length);
      console.log('   - Subcontractor data:', state.subcontractors);

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
    odcs: [],
    rates: {
      fringe: 0.247,
      oh: 0.0711,
      ga: 0.2243,
      fee: 0.07,
      smh: 0.065,
      sub_fee: 0.05,
      ga_passthrough: 0.025,
      ga_adder: 0.0243,
    },
    escalationRates: {},
    totalYears: 1,
    baseYears: 1,
    optionYears: 0,
    isDirty: false,
    isRecalculating: false,
    isSaving: false,
    lastSaved: null,
    error: null,

    // Advanced mode initial state
    advancedMode: false,
    positionsAdvanced: [],
    expandedPositions: new Set<string>(),
    manualOverrides: new Map<string, Set<string>>(),
    aggregates: {
      totalDL: 0,
      totalFringe: 0,
      totalOH: 0,
      totalGA: 0,
      totalFBLR: 0,
      byYear: {},
    },
    ratesReferenceExpanded: false,
    activeTab: 'overview',

    loadProposal: async (proposalId, existingProposal) => {
      try {
        // Check cache first
        const cachedData = getCachedProposal(proposalId);
        if (cachedData) {
          set(cachedData);
          return;
        }

        // Use existing proposal data if provided, otherwise fetch
        const proposal = existingProposal || await proposalsApi.get(proposalId);

        // Extract positions from jobs or spreadsheet_data
        let positions: SpreadsheetPosition[] = [];

        if (proposal.spreadsheet_data?.positions) {
          positions = proposal.spreadsheet_data.positions;
        } else if (proposal.jobs && proposal.jobs.length > 0) {
          positions = proposal.jobs.map((job, index) => mapJobToPosition(job, index));
        }

        // Setup default escalation rates based on years
        const totalYears = proposal.metadata?.total_years || 1;
        const defaultEscalationRates: EscalationRates = {};
        for (let i = 1; i < totalYears; i++) {
          defaultEscalationRates[`${i}_to_${i + 1}`] = 0.0272; // Default 2.72%
        }

        set({
          proposalId,
          proposalName: proposal.name,
          solicitationNumber: proposal.solicitation_number,
          primeContractorName: proposal.prime_contractor_name || 'TBD',
          dcaaContact: proposal.dcaa_contact || '',
          positions,
          subcontractors: proposal.spreadsheet_data?.subcontractors || [],
          odcs: proposal.spreadsheet_data?.odcs || [],
          rates: proposal.rates || get().rates,
          escalationRates: proposal.escalation_rates || defaultEscalationRates,
          totalYears: proposal.metadata?.total_years || 1,
          baseYears: proposal.metadata?.base_years || 1,
          optionYears: proposal.metadata?.option_years || 0,
          isDirty: false,
          lastSaved: null,
          error: null,
        });

        // Cache the loaded state for faster future access
        setCachedProposal(proposalId, {
          proposalId,
          proposalName: proposal.name,
          solicitationNumber: proposal.solicitation_number,
          primeContractorName: proposal.prime_contractor_name || 'TBD',
          dcaaContact: proposal.dcaa_contact || '',
          positions,
          subcontractors: proposal.spreadsheet_data?.subcontractors || [],
          odcs: proposal.spreadsheet_data?.odcs || [],
          rates: proposal.rates || get().rates,
          escalationRates: proposal.escalation_rates || defaultEscalationRates,
          totalYears: proposal.metadata?.total_years || 1,
          baseYears: proposal.metadata?.base_years || 1,
          optionYears: proposal.metadata?.option_years || 0,
          isDirty: false,
          lastSaved: null,
          error: null,
        });

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
      set((state) => ({
        positions: state.positions.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      }));
      debouncedRecalculate();
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
      };

      // 3. Add position to subcontractor
      const updatedSubcontractor = {
        ...subcontractor,
        positions: [...subcontractor.positions, subPosition],
      };

      // 4. Calculate remaining hours for prime position
      const remainingHours: Record<string, number> = {};
      let hasRemainingHours = false;

      Object.entries(position.hours_per_year).forEach(([year, hours]) => {
        const allocated = data.hoursAllocation[year] || 0;
        const remaining = hours - allocated;
        remainingHours[year] = remaining;
        if (remaining > 0) hasRemainingHours = true;
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

        // Update or remove prime position
        if (hasRemainingHours) {
          // Partial conversion - update position with remaining hours
          newState.positions = state.positions.map((p) =>
            p.id === position.id ? { ...p, hours_per_year: remainingHours } : p
          );
        } else {
          // Full conversion - remove position
          newState.positions = state.positions.filter((p) => p.id !== position.id);
        }

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

      // 7. Trigger recalculation and auto-save
      debouncedRecalculate();
      debouncedAutoSave(); // Explicit auto-save to persist to MongoDB immediately
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
      set((state) => ({
        rates: { ...state.rates, ...rates },
      }));
      debouncedRecalculate();
    },

    updateEscalationRates: (rates) => {
      set((state) => ({
        escalationRates: { ...state.escalationRates, ...rates },
      }));
      debouncedRecalculate();
    },

    recalculate: async () => {
      // Force immediate recalculation (bypass debounce)
      debouncedRecalculate.cancel();
      await debouncedRecalculate();
    },

    exportToExcel: async () => {
      const state = get();
      if (!state.proposalId) return;

      try {
        console.log('Generating Excel file...');

        // Basic mode: Export simple Excel spreadsheet matching frontend grid
        if (!state.advancedMode) {
          console.log('Exporting basic mode spreadsheet...');

          // Import XLSX library dynamically
          const XLSX = await import('xlsx');

          // Helper to calculate averaged FBLR
          const calculateAveragedFBLR = (p: SpreadsheetPosition) => {
            const baseWage = p[`wage_${p.percentile}`] || p.selected_wage || 0;
            if (baseWage === 0 || state.totalYears === 0) {
              return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0 };
            }

            let totalSalary = 0;
            let totalHours = 0;
            let currentYearWage = baseWage;
            const fteHours = p.standard_fte_hours || 1880;

            for (let year = 1; year <= state.totalYears; year++) {
              const yearStr = year.toString();
              const hoursThisYear = p.hours_per_year[yearStr] || 0;

              if (hoursThisYear > 0) {
                const hourlyRateThisYear = currentYearWage / fteHours;
                const salaryEarnedThisYear = hourlyRateThisYear * hoursThisYear;
                totalSalary += salaryEarnedThisYear;
                totalHours += hoursThisYear;
              }

              // Apply escalation for next year
              if (year < state.totalYears) {
                const escalationKey = `${year}_to_${year + 1}`;
                const escalationRate = state.escalationRates[escalationKey] || 0;
                currentYearWage = currentYearWage * (1 + escalationRate);
              }
            }

            if (totalHours === 0) {
              return { dlRate: 0, fringe: 0, oh: 0, ga: 0, fee: 0, fblr: 0 };
            }

            const dlRate = totalSalary / totalHours;
            const fringe = dlRate * state.rates.fringe;
            const oh = (dlRate + fringe) * state.rates.oh;
            const ga = (dlRate + fringe + oh) * state.rates.ga;
            const fee = (dlRate + fringe + oh + ga) * state.rates.fee;
            const fblr = dlRate + fringe + oh + ga + fee;

            return { dlRate, fringe, oh, ga, fee, fblr };
          };

          // Prepare data for Excel
          const excelData = state.positions.map(p => {
            const averaged = calculateAveragedFBLR(p);

            const row: any = {
              'Labor Category': p.labor_category,
              'Experience (yrs)': p.experience ?? '-',
              'Location': p.location ?? '-',
              'BLS Code': p.soc_code ?? '-',
              'BLS Category': p.soc_title ?? '-',
              'Percentile': p.percentile,
              'Wage 10th': p.wage_10th ?? 0,
              'Wage 25th': p.wage_25th ?? 0,
              'Wage 50th': p.wage_50th ?? 0,
              'Wage 75th': p.wage_75th ?? 0,
              'Wage 90th': p.wage_90th ?? 0,
              'Selected Wage': p[`wage_${p.percentile}`] || p.selected_wage || 0,
            };

            // Add year columns dynamically
            for (let i = 1; i <= state.totalYears; i++) {
              const yearLabel = i === 1 ? 'Base Year Hours' : `Option Year ${i - 1} Hours`;
              row[yearLabel] = p.hours_per_year[i.toString()] ?? 0;
            }

            // Add averaged rate columns
            row['Averaged DL Rate ($/hr)'] = averaged.dlRate.toFixed(2);
            row['Averaged Fringe ($/hr)'] = averaged.fringe.toFixed(2);
            row['Averaged OH ($/hr)'] = averaged.oh.toFixed(2);
            row['Averaged G&A ($/hr)'] = averaged.ga.toFixed(2);
            row['Averaged Fee ($/hr)'] = averaged.fee.toFixed(2);
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
          jobs: state.positions.map((p) => ({
            labor_category: p.labor_category,
            soc_code: p.soc_code,
            hours_per_year: p.hours_per_year,
            selected_wage: p[`wage_${p.percentile}`] || p.selected_wage || 0,
            percentile: p.percentile,
            wage_10th: p.wage_10th,
            wage_25th: p.wage_25th,
            wage_50th: p.wage_50th,
            wage_75th: p.wage_75th,
            wage_90th: p.wage_90th,
            standard_fte_hours: p.standard_fte_hours || 1880,
          })),
          project_config: {
            solicitation_number: state.solicitationNumber || '',
            prime_contractor_name: state.primeContractorName || 'TBD',
            subcontractor_names: state.subcontractors.map(s => s.name),
            dcaa_contact: state.dcaaContact || '',
            total_years: state.totalYears,
            base_years: state.baseYears,
            escalation_rates: state.escalationRates,
            indirect_rates: {
              fringe: state.rates.fringe,
              oh: state.rates.oh,
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
            odcs: state.odcs,
            include_rate_table: true,
          },
        };

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
      } catch (error: any) {
        console.error('Excel export failed:', error);
        console.error('Error details:', error.response?.data);
      }
    },

    // Advanced mode actions
    enableAdvancedMode: () => {
      set({ advancedMode: true });
    },

    transformToAdvanced: () => {
      const state = get();

      // Convert each SpreadsheetPosition to AdvancedPosition
      const advanced = state.positions.map((pos) => {
        const breakdown: AdvancedPosition['breakdown'] = {};

        // For each year, create detailed breakdown
        Object.entries(pos.hours_per_year).forEach(([year, hours]) => {
          // Use percentile-based wage first, fallback to selected_wage
          const wage = pos[`wage_${pos.percentile}`] || pos.selected_wage || 0;
          const dlRate = hours > 0 ? wage / hours : 0;
          const dlAmount = dlRate * hours;

          const fringe = dlRate * state.rates.fringe;
          const fringeAmount = fringe * hours;

          const oh = (dlRate + fringe) * state.rates.oh;
          const ohAmount = oh * hours;

          const ga = (dlRate + fringe + oh) * state.rates.ga;
          const gaAmount = ga * hours;

          const fee = (dlRate + fringe + oh + ga) * state.rates.fee;
          const feeAmount = fee * hours;

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
              fblr: 0,
              totalAmount: 0,
            };
          }

          aggregates.byYear[year].dl += breakdown.dlAmount;
          aggregates.byYear[year].fringe += breakdown.fringeAmount;
          aggregates.byYear[year].oh += breakdown.ohAmount;
          aggregates.byYear[year].ga += breakdown.gaAmount;
          aggregates.byYear[year].fblr += breakdown.totalAmount;
          aggregates.byYear[year].totalAmount += breakdown.totalAmount;

          aggregates.totalDL += breakdown.dlAmount;
          aggregates.totalFringe += breakdown.fringeAmount;
          aggregates.totalOH += breakdown.ohAmount;
          aggregates.totalGA += breakdown.gaAmount;
          aggregates.totalFBLR += breakdown.totalAmount;
        });
      });

      set({ positionsAdvanced: advanced, aggregates });
    },

    updateAdvancedPosition: (id, updates) => {
      // Update the underlying positions array first
      set((state) => ({
        positions: state.positions.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      }));

      // Then retransform to advanced mode to recalculate breakdown
      get().transformToAdvanced();
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
        // Build request (exclude manual override fields)
        const positions = state.positionsAdvanced.map((pos) => {
          const overrides = state.manualOverrides.get(pos.id) || new Set();

          // Build breakdown with manual overrides preserved
          const breakdown = { ...pos.breakdown };

          // For each year, mark which fields to skip in recalculation
          Object.keys(breakdown).forEach((year) => {
            Object.keys(breakdown[year]).forEach((field) => {
              if (overrides.has(`${year}.${field}`)) {
                // Mark for backend to preserve
                (breakdown[year] as any)[`${field}_manual`] = true;
              }
            });
          });

          return {
            id: pos.id,
            percentile: pos.percentile,
            breakdown,
          };
        });

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
        get().transformToAdvanced();

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

    reset: () => {
      set({
        proposalId: null,
        proposalName: '',
        solicitationNumber: '',
        primeContractorName: 'TBD',
        dcaaContact: '',
        positions: [],
        subcontractors: [],
        odcs: [],
        rates: {
          fringe: 0.247,
          oh: 0.0711,
          ga: 0.2243,
          fee: 0.07,
          smh: 0.065,
          sub_fee: 0.05,
          ga_passthrough: 0.025,
          ga_adder: 0.0243,
        },
        escalationRates: {},
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
        positionsAdvanced: [],
        expandedPositions: new Set<string>(),
        manualOverrides: new Map<string, Set<string>>(),
        aggregates: {
          totalDL: 0,
          totalFringe: 0,
          totalOH: 0,
          totalGA: 0,
          totalFBLR: 0,
          byYear: {},
        },
        ratesReferenceExpanded: false,
        activeTab: 'overview',
      });
    },
  };
});
