/**
 * Serialize the full pricing-workspace Zustand state into a compact JSON
 * blob that the Pricing Chat Agent reads as its per-turn context.
 *
 * Readable-state pattern: the agent answers user questions by reading this
 * blob directly, no tool calls. See PRICING_FORMULAS.md and
 * backend/agent/pricing_agent.py for the agent contract.
 *
 * IMPORTANT: this is pure — it only takes the state snapshot as input.
 * It does NOT touch the store directly; callers grab the snapshot first.
 */

import type {
  SpreadsheetPosition,
  AdvancedPosition,
  Subcontractor,
  SubcontractorPosition,
  TravelItem,
  ODCItem,
  Extension,
  SurgeOption,
  IndirectRates,
  EscalationRates,
  Aggregates,
  DocumentInfo,
} from '@/types';
import {
  isGSAPosition,
  getGSARateForYear,
  getEffectiveSalary,
} from '@/lib/utils/salaryHelpers';

// ─── Input shape ─────────────────────────────────────────────────────

export interface ProposalContextInput {
  // Proposal metadata
  proposalId: string | null;
  proposalName: string;
  solicitationNumber?: string;
  primeContractorName: string;
  dcaaContact?: string;
  status?: string;
  businessStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  visibility?: string;
  sharedWith?: string[];
  documents?: DocumentInfo[];
  totalCost?: number;

  // Contract shape
  totalYears: number;
  baseYears: number;
  optionYears: number;
  monthsPerYear: Record<string, number>;
  extensions: Extension[];
  surge: SurgeOption | null;

  // Raw inputs (user edits these)
  positions: SpreadsheetPosition[];
  subcontractors: Subcontractor[];
  travel: TravelItem[];
  odcs: ODCItem[];
  rates: IndirectRates;
  escalationRates: EscalationRates;

  // Computed state (from performTransformToAdvanced)
  positionsAdvanced: AdvancedPosition[];
  aggregates: Aggregates;
  advancedMode: boolean;
  subcontractorConfigured: boolean;
  activeTab?: string;
}

// ─── Output shape (documented schema for the agent) ─────────────────

export interface ProposalContext {
  proposal: Record<string, unknown>;
  rates: IndirectRates;
  escalation_rates: EscalationRates;
  months_per_year: Record<string, number>;
  totals: Record<string, number>;
  by_year: Record<string, Record<string, number>>;
  labor_subtotals: Record<string, Record<string, number>>;
  breakdowns: {
    by_location_type: Record<string, BreakdownSlice>;
    by_wage_source: Record<string, BreakdownSlice>;
    by_work_type: Record<string, BreakdownSlice>;
    by_subcontractor: Record<string, BreakdownSlice & { id: string }>;
    by_year: Record<string, Record<string, number>>;
    by_category: Record<string, BreakdownSlice>;
    by_percentile: Record<string, BreakdownSlice>;
  };
  positions: SerializedPosition[];
  subcontractors: SerializedSubcontractor[];
  travel: SerializedTravel[];
  odcs: SerializedODC[];
  extensions: Extension[];
  surge: SurgeOption | null;
  source_documents: Array<{
    filename: string;
    uploaded_at?: string;
    file_type?: string;
    size_bytes?: number;
  }>;
}

interface BreakdownSlice {
  position_count: number;
  total_hours: number;
  total_cost: number;
}

interface SerializedPosition {
  id: string;
  labor_category: string;
  description?: string;
  contractor: string; // "Prime" or sub name
  location?: string;
  location_type?: string;
  is_key_position: boolean;
  is_surge: boolean;
  wage_source: 'bls' | 'gsa';
  experience?: number;
  // Assignment
  assigned_to_sub: { id: string; name: string } | null;
  // BLS wage data (from Wage Data tab)
  soc_code?: string;
  soc_title?: string;
  bls_occupation_description?: string;
  area?: string;
  wage_percentiles?: {
    '10th'?: number;
    '25th'?: number;
    '50th'?: number;
    '75th'?: number;
    '90th'?: number;
  };
  selected_percentile?: string;
  percentile?: string;
  selected_wage?: number;
  selected_salaries?: number[];
  custom_salary?: number;
  // GSA data
  gsa_rates_by_year?: Record<string, number>;
  gsa_current_year?: number;
  gsa_custom_rate?: number | null;
  gsa_discount_rate?: number;
  suggested_discount_rate?: number;
  discount_rationale?: string;
  bls_comparison_wage?: number;
  bls_comparison_fblr?: number;
  bls_comparison_percentile?: string;
  // Hours / FTE
  standard_fte_hours?: number;
  hours_per_year: Record<string, number>;
  ot_hours_per_year?: Record<string, number>;
  total_hours: number;
  // Computed per-year breakdown (fee-inclusive FBLR per canonical rule)
  by_year: Record<
    string,
    {
      wage: number;
      dl_rate: number;
      fringe: number;
      oh: number;
      ga: number;
      fee: number;
      fblr: number;
      hours: number;
      amount: number;
    }
  >;
  total_amount: number;
}

interface SerializedSubcontractor {
  id: string;
  name: string;
  position_count: number;
  total_cost: number;
  positions: Array<{
    labor_category: string;
    original_position_id?: string;
    location_type?: string;
    base_rate: number;
    billable_rate_year_1: number; // base × (1 + smh + ga_passthrough + sub_fee)
    rates_by_year?: Record<string, number>;
    hours_per_year: Record<string, number>;
    ot_hours_per_year?: Record<string, number>;
    cost_by_year: Record<string, number>;
    total_cost: number;
  }>;
}

interface SerializedTravel {
  id: string;
  description?: string;
  escalate: boolean;
  amount_per_year: Record<string, number>;
  with_ga_by_year: Record<string, number>;
  total_with_ga: number;
}

interface SerializedODC {
  id: string;
  category: string;
  description?: string;
  escalate: boolean;
  amount_per_year: Record<string, number>;
  with_smh_by_year: Record<string, number>;
  total_with_smh: number;
}

// ─── Main builder ────────────────────────────────────────────────────

export function buildProposalContext(s: ProposalContextInput): ProposalContext {
  const totalYears = s.totalYears || 1;
  const subNamesById = new Map(s.subcontractors.map((sub) => [sub.id, sub.name]));

  // ─── Positions ────────────────────────────────────────────────────
  // Use positionsAdvanced when available (has per-year breakdowns). Fall back
  // to raw positions if advanced mode wasn't transformed yet (basic mode).
  const advById = new Map(s.positionsAdvanced.map((p) => [p.id, p]));
  const positions: SerializedPosition[] = s.positions.map((p) =>
    serializePosition(p, advById.get(p.id), subNamesById),
  );

  // ─── Subcontractors ───────────────────────────────────────────────
  const subcontractors: SerializedSubcontractor[] = s.subcontractors.map((sub) =>
    serializeSubcontractor(sub, s, totalYears),
  );

  // ─── Travel / ODC (pre-compute with markup per PRICING_FORMULAS § 10-11) ──
  const travel: SerializedTravel[] = s.travel.map((item) =>
    serializeTravel(item, s.rates.ga || 0, s.escalationRates, totalYears),
  );
  const odcs: SerializedODC[] = s.odcs.map((item) =>
    serializeODC(item, s.rates.smh || 0, s.escalationRates, totalYears),
  );

  // ─── Totals (mirrors calculateGrandTotal in pricingStore.ts) ─────
  const totals = computeTotals(s, subcontractors, travel, odcs);

  // ─── Per-year roll-up ────────────────────────────────────────────
  const byYear = computeByYear(s, subcontractors, travel, odcs, totalYears);

  // ─── Labor subtotals (the bottom panel) ──────────────────────────
  const laborSubtotals = computeLaborSubtotals(s, totalYears);

  // ─── Breakdown slices ────────────────────────────────────────────
  const breakdowns = computeBreakdowns(positions, subcontractors, byYear);

  return {
    proposal: {
      id: s.proposalId,
      name: s.proposalName,
      solicitation_number: s.solicitationNumber || null,
      prime_contractor: s.primeContractorName,
      dcaa_contact: s.dcaaContact || null,
      status: s.status || null,
      business_status: s.businessStatus || null,
      visibility: s.visibility || null,
      shared_with: s.sharedWith || [],
      created_at: s.createdAt || null,
      updated_at: s.updatedAt || null,
      mode: s.advancedMode ? 'advanced' : 'basic',
      subcontractor_configured: s.subcontractorConfigured,
      active_tab: s.activeTab || null,
      total_years: totalYears,
      base_years: s.baseYears,
      option_years: s.optionYears,
      stored_total_cost: s.totalCost ?? null,
    },
    rates: s.rates,
    escalation_rates: s.escalationRates,
    months_per_year: s.monthsPerYear || {},
    totals,
    by_year: byYear,
    labor_subtotals: laborSubtotals,
    breakdowns,
    positions,
    subcontractors,
    travel,
    odcs,
    extensions: s.extensions,
    surge: s.surge,
    source_documents: (s.documents || []).map((d) => ({
      filename: (d as { filename?: string; name?: string }).filename ||
        (d as { filename?: string; name?: string }).name || 'unknown',
      uploaded_at: (d as { uploaded_at?: string }).uploaded_at,
      file_type: (d as { file_type?: string; type?: string }).file_type ||
        (d as { file_type?: string; type?: string }).type,
      size_bytes: (d as { size_bytes?: number; size?: number }).size_bytes ||
        (d as { size_bytes?: number; size?: number }).size,
    })),
  };
}

/**
 * Serialize to a JSON string for the /api/pricing-chat/ask payload.
 */
export function serializeProposalContext(s: ProposalContextInput): string {
  return JSON.stringify(buildProposalContext(s));
}

// ─── Helpers ─────────────────────────────────────────────────────────

function serializePosition(
  raw: SpreadsheetPosition,
  adv: AdvancedPosition | undefined,
  subNamesById: Map<string, string>,
): SerializedPosition {
  const assignedSubId = raw.assigned_subcontractor_id;
  const assignedToSub = assignedSubId
    ? { id: assignedSubId, name: subNamesById.get(assignedSubId) || 'Unknown' }
    : null;
  const contractor = assignedToSub ? assignedToSub.name : 'Prime';

  const wagePercentiles = {
    '10th': raw.wage_10th,
    '25th': raw.wage_25th,
    '50th': raw.wage_50th,
    '75th': raw.wage_75th,
    '90th': raw.wage_90th,
  };

  // Per-year breakdown from advanced transform if available
  const byYear: SerializedPosition['by_year'] = {};
  if (adv?.breakdown) {
    for (const [year, b] of Object.entries(adv.breakdown)) {
      byYear[year] = {
        wage: round(b.wage),
        dl_rate: round(b.dlRate, 4),
        fringe: round(b.fringe, 4),
        oh: round(b.oh, 4),
        ga: round(b.ga, 4),
        fee: round(b.fee, 4),
        fblr: round(b.fblr, 4),
        hours: b.hours,
        amount: round(b.totalAmount),
      };
    }
  }

  return {
    id: raw.id,
    labor_category: raw.labor_category,
    description: raw.description,
    contractor,
    location: raw.location,
    location_type: raw.location_type,
    is_key_position: !!raw.is_key_position,
    is_surge: !!raw.is_surge,
    wage_source: raw.wage_source === 'gsa' ? 'gsa' : 'bls',
    experience: raw.experience,
    assigned_to_sub: assignedToSub,
    // BLS wage data
    soc_code: raw.soc_code,
    soc_title: raw.soc_title,
    area: (raw as { area?: string }).area,
    wage_percentiles: wagePercentiles,
    selected_percentile: raw.selected_percentile,
    percentile: raw.percentile,
    selected_wage: raw.selected_wage,
    selected_salaries: raw.selected_salaries,
    custom_salary: raw.custom_salary,
    // GSA data
    gsa_rates_by_year: raw.gsa_rates_by_year,
    gsa_current_year: raw.gsa_current_year,
    gsa_custom_rate: raw.gsa_custom_rate,
    gsa_discount_rate: raw.gsa_discount_rate,
    suggested_discount_rate: raw.suggested_discount_rate,
    discount_rationale: raw.discount_rationale,
    bls_comparison_wage: raw.bls_comparison_wage,
    bls_comparison_fblr: raw.bls_comparison_fblr,
    bls_comparison_percentile: raw.bls_comparison_percentile,
    // Hours / FTE
    standard_fte_hours: raw.standard_fte_hours,
    hours_per_year: raw.hours_per_year || {},
    ot_hours_per_year: raw.ot_hours_per_year,
    total_hours: adv?.total_hours ??
      Object.values(raw.hours_per_year || {}).reduce((s, h) => s + h, 0),
    by_year: byYear,
    total_amount: adv?.total_amount ?? 0,
  };
}

function serializeSubcontractor(
  sub: Subcontractor,
  s: ProposalContextInput,
  totalYears: number,
): SerializedSubcontractor {
  const markupFactor =
    1 + (s.rates.smh || 0) + (s.rates.ga_passthrough || 0) + (s.rates.sub_fee || 0);
  const otMult = s.rates.ot_multiplier || 1.5;

  const positions = sub.positions.map((pos) => {
    const rateByYear = effectiveSubRateByYear(pos, s, totalYears);
    const costByYear: Record<string, number> = {};
    let totalCost = 0;

    for (let y = 1; y <= totalYears; y++) {
      const yStr = String(y);
      const rate = rateByYear[yStr] ?? 0;
      const hours = pos.hours_per_year?.[yStr] ?? 0;
      const otHours = pos.ot_hours_per_year?.[yStr] ?? 0;
      const regular = rate * hours;
      const ot = rate * otMult * otHours;
      const markedUp = (regular + ot) * markupFactor;
      costByYear[yStr] = round(markedUp);
      totalCost += markedUp;
    }

    return {
      labor_category: pos.labor_category,
      original_position_id: pos.original_position_id,
      location_type: pos.location_type,
      base_rate: round(pos.rate || 0, 4),
      billable_rate_year_1: round((rateByYear['1'] ?? 0) * markupFactor, 4),
      rates_by_year: mapRound(rateByYear, 4),
      hours_per_year: pos.hours_per_year || {},
      ot_hours_per_year: pos.ot_hours_per_year,
      cost_by_year: costByYear,
      total_cost: round(totalCost),
    };
  });

  const totalCost = positions.reduce((s, p) => s + p.total_cost, 0);
  return {
    id: sub.id,
    name: sub.name,
    position_count: positions.length,
    total_cost: round(totalCost),
    positions,
  };
}

function effectiveSubRateByYear(
  subPos: SubcontractorPosition,
  s: ProposalContextInput,
  totalYears: number,
): Record<string, number> {
  // Mirrors § 9.1 effective sub rate. For GSA subs, live-derive from prime's
  // gsa_rates_by_year × (1 - discount) / markupDivisor. Non-GSA or no link:
  // use rates_per_year if present, else escalate frozen base rate.
  const markupDivisor =
    1 + (s.rates.smh || 0) + (s.rates.ga_passthrough || 0) + (s.rates.sub_fee || 0);
  const result: Record<string, number> = {};

  const origPrimePos = subPos.original_position_id
    ? s.positions.find((p) => p.id === subPos.original_position_id)
    : null;
  const isGSASub = origPrimePos ? isGSAPosition(origPrimePos) : false;

  for (let y = 1; y <= totalYears; y++) {
    const yStr = String(y);
    if (isGSASub && origPrimePos) {
      const gsaRate = getGSARateForYear(origPrimePos, y, s.escalationRates);
      const discount = origPrimePos.gsa_discount_rate || 0;
      result[yStr] = (gsaRate * (1 - discount)) / markupDivisor;
    } else if (subPos.rates_per_year?.[yStr] !== undefined) {
      result[yStr] = subPos.rates_per_year[yStr];
    } else {
      // Compound escalation from frozen base
      let rate = subPos.rate || 0;
      for (let yy = 1; yy < y; yy++) {
        const escKey = `${yy}_to_${yy + 1}`;
        const escRate =
          s.escalationRates[escKey as keyof typeof s.escalationRates] || 0;
        rate *= 1 + escRate;
      }
      result[yStr] = rate;
    }
  }
  return result;
}

function serializeTravel(
  item: TravelItem,
  gaRate: number,
  escalation: EscalationRates,
  totalYears: number,
): SerializedTravel {
  const withGAByYear: Record<string, number> = {};
  let total = 0;
  for (let y = 1; y <= totalYears; y++) {
    const yStr = String(y);
    let amount = item.amount_per_year?.[yStr] || 0;
    if (item.escalate) {
      for (let yy = 1; yy < y; yy++) {
        const escKey = `${yy}_to_${yy + 1}`;
        amount *= 1 + (escalation[escKey as keyof typeof escalation] || 0);
      }
    }
    const withGA = amount * (1 + gaRate);
    withGAByYear[yStr] = round(withGA);
    total += withGA;
  }
  return {
    id: item.id,
    description: item.description,
    escalate: item.escalate,
    amount_per_year: item.amount_per_year || {},
    with_ga_by_year: withGAByYear,
    total_with_ga: round(total),
  };
}

function serializeODC(
  item: ODCItem,
  smhRate: number,
  escalation: EscalationRates,
  totalYears: number,
): SerializedODC {
  const withSMHByYear: Record<string, number> = {};
  let total = 0;
  for (let y = 1; y <= totalYears; y++) {
    const yStr = String(y);
    let amount = item.amount_per_year?.[yStr] || 0;
    if (item.escalate) {
      for (let yy = 1; yy < y; yy++) {
        const escKey = `${yy}_to_${yy + 1}`;
        amount *= 1 + (escalation[escKey as keyof typeof escalation] || 0);
      }
    }
    const withSMH = amount * (1 + smhRate);
    withSMHByYear[yStr] = round(withSMH);
    total += withSMH;
  }
  return {
    id: item.id,
    category: item.category,
    description: item.description,
    escalate: item.escalate,
    amount_per_year: item.amount_per_year || {},
    with_smh_by_year: withSMHByYear,
    total_with_smh: round(total),
  };
}

function computeTotals(
  s: ProposalContextInput,
  subs: SerializedSubcontractor[],
  travel: SerializedTravel[],
  odcs: SerializedODC[],
): Record<string, number> {
  // Prime labor ex-fee (matches calculateGrandTotal — skip assigned_to_sub)
  let primeLaborExFee = 0;
  let otTotal = 0;
  for (const yearData of Object.values(s.aggregates.byYear || {})) {
    primeLaborExFee +=
      (yearData.dl || 0) +
      (yearData.fringe || 0) +
      (yearData.oh || 0) +
      (yearData.ga || 0);
    otTotal += yearData.ot || 0;
  }
  const primeFee = primeLaborExFee * (s.rates.fee || 0);
  const primeLaborWithFee = primeLaborExFee + primeFee;

  // Sub total (already includes markup per our serializer)
  const subMarkupFactor =
    1 + (s.rates.smh || 0) + (s.rates.ga_passthrough || 0) + (s.rates.sub_fee || 0);
  const subsWithMarkup = subs.reduce((sum, sb) => sum + sb.total_cost, 0);
  // Reverse out the markup to get the "base" for passthrough / sub_fee breakdown
  const subBase = subMarkupFactor > 0 ? subsWithMarkup / subMarkupFactor : 0;
  const passthroughTotal =
    subBase * ((s.rates.smh || 0) + (s.rates.ga_passthrough || 0));
  const subFeeTotal = subBase * (s.rates.sub_fee || 0);

  const travelTotal = travel.reduce((sum, t) => sum + t.total_with_ga, 0);
  const odcTotal = odcs.reduce((sum, o) => sum + o.total_with_smh, 0);

  // Surge: base is fee-inclusive prime labor (§15, D9 fix)
  let surgeTotal = 0;
  if (s.surge && s.surge.percentage !== null && s.surge.percentage !== undefined) {
    const surgeMult = s.rates.surge_multiplier || 1.15;
    surgeTotal = primeLaborWithFee * (s.surge.percentage || 0) * surgeMult;
  }

  const grandTotal =
    primeLaborExFee +
    primeFee +
    subBase +
    passthroughTotal +
    subFeeTotal +
    travelTotal +
    odcTotal +
    otTotal +
    surgeTotal;

  return {
    grand_total: round(grandTotal),
    prime_labor_with_fee: round(primeLaborWithFee),
    prime_labor_ex_fee: round(primeLaborExFee),
    prime_fee_total: round(primeFee),
    subcontractor_total: round(subBase),
    passthrough_total: round(passthroughTotal),
    sub_fee_total: round(subFeeTotal),
    ot_total: round(otTotal),
    travel_total: round(travelTotal),
    odc_total: round(odcTotal),
    surge_total: round(surgeTotal),
  };
}

function computeByYear(
  s: ProposalContextInput,
  subs: SerializedSubcontractor[],
  travel: SerializedTravel[],
  odcs: SerializedODC[],
  totalYears: number,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (let y = 1; y <= totalYears; y++) {
    const yStr = String(y);
    const agg = s.aggregates.byYear?.[yStr];
    const primeLaborExFee = agg
      ? (agg.dl || 0) + (agg.fringe || 0) + (agg.oh || 0) + (agg.ga || 0)
      : 0;
    const ot = agg?.ot || 0;
    const primeFee = primeLaborExFee * (s.rates.fee || 0);
    const primeLaborWithFee = primeLaborExFee + primeFee;

    // Sub contribution for this year (un-markup from serialized cost)
    const subMarkupFactor =
      1 +
      (s.rates.smh || 0) +
      (s.rates.ga_passthrough || 0) +
      (s.rates.sub_fee || 0);
    const subsYearMarkedUp = subs.reduce(
      (sum, sb) =>
        sum + sb.positions.reduce((ps, p) => ps + (p.cost_by_year[yStr] || 0), 0),
      0,
    );
    const subBase = subMarkupFactor > 0 ? subsYearMarkedUp / subMarkupFactor : 0;
    const passthrough =
      subBase * ((s.rates.smh || 0) + (s.rates.ga_passthrough || 0));
    const subFee = subBase * (s.rates.sub_fee || 0);

    const travelYear = travel.reduce(
      (sum, t) => sum + (t.with_ga_by_year[yStr] || 0),
      0,
    );
    const odcYear = odcs.reduce(
      (sum, o) => sum + (o.with_smh_by_year[yStr] || 0),
      0,
    );

    let surgeYear = 0;
    if (s.surge && s.surge.percentage !== null && s.surge.percentage !== undefined) {
      const surgeMult = s.rates.surge_multiplier || 1.15;
      surgeYear = primeLaborWithFee * (s.surge.percentage || 0) * surgeMult;
    }

    const yearTotal =
      primeLaborExFee +
      primeFee +
      subBase +
      passthrough +
      subFee +
      travelYear +
      odcYear +
      ot +
      surgeYear;

    result[yStr] = {
      prime_labor_ex_fee: round(primeLaborExFee),
      prime_fee: round(primeFee),
      ot: round(ot),
      sub: round(subBase),
      passthrough: round(passthrough),
      sub_fee: round(subFee),
      travel: round(travelYear),
      odc: round(odcYear),
      surge: round(surgeYear),
      year_total: round(yearTotal),
    };
  }
  return result;
}

function computeLaborSubtotals(
  s: ProposalContextInput,
  totalYears: number,
): Record<string, Record<string, number>> {
  // Mirrors the "Labor Subtotals" bottom panel: DL, Fringe, OH, GA totals
  // per year (prime labor only, sub positions are NOT here — they live under
  // the subcontractor rollup).
  const rows = ['dl', 'fringe', 'oh', 'ga', 'fee'] as const;
  const labels: Record<string, string> = {
    dl: 'total_direct_labor_prime',
    fringe: 'total_fringe_prime',
    oh: 'total_overhead_prime',
    ga: 'total_ga_prime',
    fee: 'total_fee_prime',
  };

  const result: Record<string, Record<string, number>> = {};
  for (const key of rows) {
    const row: Record<string, number> = {};
    let grand = 0;
    for (let y = 1; y <= totalYears; y++) {
      const yStr = String(y);
      const v = s.aggregates.byYear?.[yStr]?.[key] || 0;
      row[yStr] = round(v);
      grand += v;
    }
    row.total = round(grand);
    result[labels[key]] = row;
  }
  return result;
}

function computeBreakdowns(
  positions: SerializedPosition[],
  subcontractors: SerializedSubcontractor[],
  byYear: Record<string, Record<string, number>>,
): ProposalContext['breakdowns'] {
  // Build slices by iterating SerializedPosition[] (already skips nothing —
  // positions assigned to subs still appear, but their $ rolls up under the sub).
  const primeOnly = positions.filter((p) => !p.assigned_to_sub);
  const assignedToSub = positions.filter((p) => p.assigned_to_sub);

  const sliceOf = (items: SerializedPosition[]): BreakdownSlice => ({
    position_count: items.length,
    total_hours: items.reduce((s, p) => s + p.total_hours, 0),
    total_cost: round(items.reduce((s, p) => s + p.total_amount, 0)),
  });

  const groupBy = <K extends string>(
    getKey: (p: SerializedPosition) => K | undefined,
  ): Record<string, BreakdownSlice> => {
    const groups = new Map<string, SerializedPosition[]>();
    for (const p of primeOnly) {
      const k = getKey(p);
      if (!k) continue;
      const arr = groups.get(k) || [];
      arr.push(p);
      groups.set(k, arr);
    }
    const out: Record<string, BreakdownSlice> = {};
    for (const [k, arr] of groups.entries()) out[k] = sliceOf(arr);
    return out;
  };

  return {
    by_location_type: groupBy((p) => p.location_type),
    by_wage_source: groupBy((p) => p.wage_source),
    by_work_type: {
      prime: sliceOf(primeOnly),
      subcontractor: {
        position_count: subcontractors.reduce((s, sb) => s + sb.position_count, 0),
        total_hours: subcontractors.reduce(
          (s, sb) =>
            s +
            sb.positions.reduce(
              (ps, p) => ps + Object.values(p.hours_per_year).reduce((a, b) => a + b, 0),
              0,
            ),
          0,
        ),
        total_cost: round(subcontractors.reduce((s, sb) => s + sb.total_cost, 0)),
      },
    },
    by_subcontractor: Object.fromEntries(
      subcontractors.map((sb) => [
        sb.name,
        {
          id: sb.id,
          position_count: sb.position_count,
          total_hours: sb.positions.reduce(
            (ps, p) =>
              ps + Object.values(p.hours_per_year).reduce((a, b) => a + b, 0),
            0,
          ),
          total_cost: sb.total_cost,
        },
      ]),
    ),
    by_year: byYear,
    by_category: groupBy((p) => p.labor_category),
    by_percentile: groupBy((p) =>
      (p.selected_percentile || p.percentile || '').replace(' (default)', ''),
    ),
  };
}

// ─── Utilities ───────────────────────────────────────────────────────

function round(n: number, decimals = 2): number {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function mapRound(
  m: Record<string, number>,
  decimals = 2,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) out[k] = round(v, decimals);
  return out;
}

// Keep imports used (tsc will tree-shake)
void getEffectiveSalary;
