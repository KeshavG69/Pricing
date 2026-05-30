"""
Bottom-up PTW calculator.

Computes a Price-to-Win estimate anchored to the proposal's actual scope: its
positions, hours, wages, and indirect rates — all pulled from MongoDB. No
hardcoded numeric defaults: if data is missing the calculator either falls back
to organization-level defaults (passed in by the caller) or surfaces a note
explaining what's missing.

Handles two pricing modes per position:

  - GSA: `selected_wage` is an hourly billable rate already fully burdened.
        Cost = rate × hours, applying gsa_discount_rate per position.
        Uses gsa_rates_by_year + gsa_current_year for accurate per-year rates
        when available; falls back to selected_wage (no escalation) otherwise.

  - BLS: `selected_wage` is an annual wage. Applies the FBLR cascade
        (fringe → OH → G&A → fee) using the proposal's own rates, with
        compound escalation across years.

Detection of GSA vs BLS uses the position's `wage_source` field
('gsa' or 'bls'), falling back to checking for `gsa_rates_by_year`.

Reuses Calculator from calculation_service.py for the FBLR cascade so the
math matches what users see in the workspace.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

from client.calculation_service import Calculator

logger = logging.getLogger(__name__)


# Last-resort FTE used only when neither the position nor the proposal metadata
# specifies one. Industry standard (40hr/wk × 48wks). Surfaces a note in the
# output when this fallback fires so the user knows it happened.
LAST_RESORT_FTE_HOURS = 1920


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class PositionContribution:
    """Per-position bottom-up breakdown."""

    labor_category: str
    wage_source: str  # 'gsa' | 'bls'
    annual_wage_or_hourly_rate: float  # what was used as the input
    year_1_fblr: float  # without fee (== hourly rate for GSA)
    year_1_billable_rate: float  # with fee (== same as fblr for GSA — already fully burdened)
    total_hours: int
    total_cost: float
    note: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "labor_category": self.labor_category,
            "wage_source": self.wage_source,
            "annual_wage_or_hourly_rate": self.annual_wage_or_hourly_rate,
            "year_1_fblr": round(self.year_1_fblr, 2),
            "year_1_billable_rate": round(self.year_1_billable_rate, 2),
            "total_hours": self.total_hours,
            "total_cost": round(self.total_cost, 2),
            "note": self.note,
        }


@dataclass
class BottomUpEstimate:
    """End-to-end bottom-up PTW calculation result."""

    total: float
    year_1: float
    total_years: int
    positions_priced: int
    positions_skipped: int
    rates_used: dict
    by_position: list[PositionContribution] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def is_usable(self) -> bool:
        return self.positions_priced > 0 and self.total > 0

    def to_dict(self) -> dict:
        return {
            "total": round(self.total, -3),  # nearest $1K
            "year_1": round(self.year_1, -3),
            "total_years": self.total_years,
            "positions_priced": self.positions_priced,
            "positions_skipped": self.positions_skipped,
            "rates_used": self.rates_used,
            "by_position": [p.to_dict() for p in self.by_position],
            "notes": self.notes,
        }


# ---------------------------------------------------------------------------
# Helpers — pure functions
# ---------------------------------------------------------------------------


def _is_gsa_position(pos: dict) -> bool:
    """True when this position prices via GSA hourly rate (vs BLS annual wage)."""
    if pos.get("wage_source") == "gsa":
        return True
    if pos.get("gsa_rates_by_year"):
        return True
    return False


def _get_gsa_rate_for_year(pos: dict, proposal_year: int) -> Optional[float]:
    """
    Resolve the GSA hourly rate for a given proposal year, with discount applied.

    Mapping: proposal year 1 → contract year `gsa_current_year`, then incrementing.
    Reads from `gsa_rates_by_year` (keys are stringified contract years). When
    the proposal extends past the rate table, hold the last available rate.
    Falls back to `selected_wage` if neither table nor offset is set.
    """
    discount = pos.get("gsa_discount_rate") or 0

    rates_by_year = pos.get("gsa_rates_by_year") or {}
    current_year = pos.get("gsa_current_year")

    if rates_by_year and current_year:
        contract_year = int(current_year) + (proposal_year - 1)
        # Try str then int key (MongoDB may store either).
        rate = rates_by_year.get(str(contract_year))
        if rate is None:
            rate = rates_by_year.get(contract_year)
        if rate is None:
            # Beyond rate table — hold last available year.
            max_year = max((int(k) for k in rates_by_year.keys()), default=None)
            if max_year is not None:
                rate = rates_by_year.get(str(max_year)) or rates_by_year.get(max_year)
        if rate is not None:
            return float(rate) * (1 - discount)

    # Final fallback: selected_wage as year-1 rate, no escalation.
    base = pos.get("selected_wage")
    if base and base > 0:
        return float(base) * (1 - discount)
    return None


def _resolve_bls_wage(pos: dict) -> Optional[float]:
    """Pick the best annual wage for a BLS position."""
    for key in ("selected_wage", "wage_50th", "wage_75th", "wage_25th"):
        w = pos.get(key)
        if isinstance(w, (int, float)) and w > 0:
            return float(w)
    return None


def _resolve_rates(proposal: dict, default_rates: Optional[dict]) -> Optional[dict]:
    """
    Pull indirect rates for BLS pricing.

    Priority: proposal.spreadsheet_data.rates → proposal.rates → default_rates (org).
    Returns None if nothing usable found — caller must skip BLS positions in that case.
    """
    rates = (proposal.get("spreadsheet_data") or {}).get("rates") or proposal.get("rates")
    if rates:
        return rates
    return default_rates


def _resolve_escalation(proposal: dict) -> dict[str, float]:
    """Pull escalation rates from proposal. Empty dict = no escalation."""
    return (
        (proposal.get("spreadsheet_data") or {}).get("escalation_rates")
        or proposal.get("escalation_rates")
        or {}
    )


def _resolve_fte(pos: dict, proposal: dict) -> tuple[int, bool]:
    """
    Resolve FTE hours for a position. Returns (hours, was_last_resort).

    Priority: position.standard_fte_hours → proposal.metadata.fte_hours_threshold
            → LAST_RESORT_FTE_HOURS (1920) with notice.
    """
    fte = pos.get("standard_fte_hours")
    if fte:
        return int(fte), False
    md = proposal.get("metadata") or {}
    fte = md.get("fte_hours_threshold")
    if fte:
        return int(fte), False
    return LAST_RESORT_FTE_HOURS, True


def _resolve_hours_for_year(pos: dict, year: int) -> int:
    """Hours for the given proposal year, with flat-hours fallback."""
    hours_map = pos.get("hours_per_year") or {}
    h = hours_map.get(str(year))
    if h is None:
        h = pos.get("hours")  # flat-hours legacy fallback
    try:
        return int(h or 0)
    except (TypeError, ValueError):
        return 0


# ---------------------------------------------------------------------------
# Per-position pricing
# ---------------------------------------------------------------------------


def _price_gsa_position(
    pos: dict, total_years: int
) -> Optional[dict]:
    """
    GSA position: rate (already fully burdened) × hours per year.
    Year-by-year rates pulled from gsa_rates_by_year when present.
    """
    year_1_rate = _get_gsa_rate_for_year(pos, 1)
    if year_1_rate is None or year_1_rate <= 0:
        return None

    total_cost = 0.0
    year_1_cost = 0.0
    total_hours = 0

    for year in range(1, total_years + 1):
        hours = _resolve_hours_for_year(pos, year)
        if hours <= 0:
            continue
        rate = _get_gsa_rate_for_year(pos, year) or year_1_rate
        cost = rate * hours
        total_cost += cost
        total_hours += hours
        if year == 1:
            year_1_cost = cost

    return {
        "wage_source": "gsa",
        "input_value": pos.get("selected_wage") or year_1_rate,
        "year_1_fblr": year_1_rate,
        "year_1_billable": year_1_rate,  # already fully burdened
        "total_hours": total_hours,
        "total_cost": total_cost,
        "year_1_cost": year_1_cost,
        "note": "GSA rate (already fully burdened)",
    }


def _price_bls_position(
    pos: dict,
    total_years: int,
    std_fte: int,
    rates: dict,
    escalation_rates: dict,
) -> Optional[dict]:
    """BLS position: annual wage → FBLR cascade → fee → escalation per year."""
    wage = _resolve_bls_wage(pos)
    if wage is None:
        return None
    if not rates:
        return None  # can't cascade without rates

    location_type = pos.get("location_type") or "On-Site"
    fee_rate = rates.get("fee") or 0
    fringe = rates.get("fringe") or 0
    oh_onsite = rates.get("oh_onsite") or rates.get("oh") or 0
    oh_offsite = rates.get("oh_offsite") or rates.get("oh") or 0
    ga = rates.get("ga") or 0

    try:
        fblr_breakdown = Calculator.calculate_fblr(
            annual_wage=wage,
            standard_fte_hours=std_fte,
            fringe_rate=fringe,
            oh_onsite_rate=oh_onsite,
            oh_offsite_rate=oh_offsite,
            ga_rate=ga,
            location_type=location_type,
        )
    except Exception as e:
        logger.warning(
            f"FBLR failed for {pos.get('labor_category')!r} (wage={wage}): {e}"
        )
        return None

    year_1_fblr = fblr_breakdown["fblr"]
    year_1_billable = year_1_fblr * (1 + fee_rate)

    total_cost = 0.0
    year_1_cost = 0.0
    total_hours = 0

    for year in range(1, total_years + 1):
        hours = _resolve_hours_for_year(pos, year)
        if hours <= 0:
            continue
        if year == 1:
            year_rate = year_1_billable
        else:
            escalated_fblr = Calculator.calculate_year_rate(
                base_rate=year_1_fblr,
                escalation_rates=escalation_rates,
                from_year=1,
                to_year=year,
            )
            year_rate = escalated_fblr * (1 + fee_rate)
        cost = year_rate * hours
        total_cost += cost
        total_hours += hours
        if year == 1:
            year_1_cost = cost

    return {
        "wage_source": "bls",
        "input_value": wage,
        "year_1_fblr": year_1_fblr,
        "year_1_billable": year_1_billable,
        "total_hours": total_hours,
        "total_cost": total_cost,
        "year_1_cost": year_1_cost,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_bottom_up_ptw(
    proposal: dict,
    total_years: Optional[int] = None,
    default_rates: Optional[dict] = None,
) -> BottomUpEstimate:
    """
    Bottom-up PTW from a proposal's positions.

    Args:
        proposal: The MongoDB proposal document (post-processing, with spreadsheet_data).
        total_years: Override for proposal.metadata.total_years. Optional.
        default_rates: Organization default rates dict, used only when the proposal
                       has no indirect rates of its own. Passed by the caller (PTW
                       router fetches from org settings). No hardcoded numeric
                       fallback beyond this.
    """
    positions = (proposal.get("spreadsheet_data") or {}).get("positions") or []
    metadata = proposal.get("metadata") or {}
    if total_years is None:
        total_years = metadata.get("total_years") or 5
    total_years = int(total_years)

    rates = _resolve_rates(proposal, default_rates)
    escalation_rates = _resolve_escalation(proposal)
    notes: list[str] = []

    if not positions:
        return BottomUpEstimate(
            total=0.0,
            year_1=0.0,
            total_years=total_years,
            positions_priced=0,
            positions_skipped=0,
            rates_used=rates or {},
            notes=["No positions on proposal — bottom-up unavailable."],
        )

    by_position: list[PositionContribution] = []
    total = 0.0
    year_1_total = 0.0
    priced = 0
    skipped = 0
    fte_fallback_used = False

    for pos in positions:
        labor_cat = pos.get("labor_category") or "Unknown"
        std_fte, fte_was_fallback = _resolve_fte(pos, proposal)
        if fte_was_fallback:
            fte_fallback_used = True

        if _is_gsa_position(pos):
            result = _price_gsa_position(pos, total_years)
        else:
            result = _price_bls_position(pos, total_years, std_fte, rates or {}, escalation_rates)

        if result is None:
            skipped += 1
            by_position.append(PositionContribution(
                labor_category=labor_cat,
                wage_source="gsa" if _is_gsa_position(pos) else "bls",
                annual_wage_or_hourly_rate=0.0,
                year_1_fblr=0.0,
                year_1_billable_rate=0.0,
                total_hours=0,
                total_cost=0.0,
                note="skipped: missing wage / rate data",
            ))
            continue

        priced += 1
        total += result["total_cost"]
        year_1_total += result["year_1_cost"]
        by_position.append(PositionContribution(
            labor_category=labor_cat,
            wage_source=result["wage_source"],
            annual_wage_or_hourly_rate=result["input_value"],
            year_1_fblr=result["year_1_fblr"],
            year_1_billable_rate=result["year_1_billable"],
            total_hours=result["total_hours"],
            total_cost=result["total_cost"],
            note=result.get("note"),
        ))

    if fte_fallback_used:
        notes.append(
            f"Some positions used industry-standard {LAST_RESORT_FTE_HOURS} FTE hours "
            "(no value on position or proposal metadata)."
        )
    if skipped:
        notes.append(f"{skipped} position(s) skipped due to missing data.")
    if priced == 0:
        notes.append(
            "No positions could be priced. Check that wages are populated and, "
            "for BLS positions, that indirect rates are configured."
        )

    # Surface what the BLS positions are using so the caller / UI knows.
    has_bls = any(p.wage_source == "bls" for p in by_position)
    if has_bls and not rates:
        notes.append(
            "BLS positions present but no indirect rates available — those were skipped."
        )

    return BottomUpEstimate(
        total=total,
        year_1=year_1_total,
        total_years=total_years,
        positions_priced=priced,
        positions_skipped=skipped,
        rates_used=rates or {},
        by_position=by_position,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Reconciliation between top-down (USASpending) and bottom-up (proposal)
# ---------------------------------------------------------------------------


@dataclass
class ReconciledPTW:
    """Headline PTW + reasoning, blending top-down and bottom-up."""

    suggested_ptw: float
    low: float
    high: float
    confidence: str  # "high" | "medium" | "low"
    method: str  # "reconciled" | "bottom_up_only" | "top_down_only"
    disagreement_pct: Optional[float]
    rationale: str

    def to_dict(self) -> dict:
        return {
            "suggested_ptw": round(self.suggested_ptw, -3),
            "low": round(self.low, -3),
            "high": round(self.high, -3),
            "confidence": self.confidence,
            "method": self.method,
            "disagreement_pct": (
                round(self.disagreement_pct * 100, 1)
                if self.disagreement_pct is not None
                else None
            ),
            "rationale": self.rationale,
        }


def reconcile(top_down: dict, bottom_up: BottomUpEstimate) -> ReconciledPTW:
    """
    Pick a headline PTW number from top-down + bottom-up.

    Rules:
      - If bottom-up is unusable → fall back to top-down alone.
      - If they agree within 15% → average them, "high" confidence.
      - If they disagree 15-40% → prefer bottom-up (proposal-anchored), "medium".
      - If they disagree >40% → use bottom-up, "low" confidence, surface the gap.
      - Low/high band: union of (top-down P25/P75) and (bottom-up ±10%).
    """
    td_value = top_down.get("suggested_ptw") or 0
    td_low = top_down.get("low") or 0
    td_high = top_down.get("high") or 0

    if not bottom_up.is_usable:
        return ReconciledPTW(
            suggested_ptw=td_value,
            low=td_low,
            high=td_high,
            confidence=top_down.get("confidence") or "medium",
            method="top_down_only",
            disagreement_pct=None,
            rationale=(
                "Using top-down comparables only — proposal has no priced positions "
                "yet for bottom-up reconciliation."
            ),
        )

    bu_value = bottom_up.total
    bu_low = bu_value * 0.9
    bu_high = bu_value * 1.1

    if td_value <= 0:
        return ReconciledPTW(
            suggested_ptw=bu_value,
            low=bu_low,
            high=bu_high,
            confidence="medium",
            method="bottom_up_only",
            disagreement_pct=None,
            rationale="Using bottom-up estimate only — no usable top-down comparables.",
        )

    larger = max(td_value, bu_value)
    smaller = min(td_value, bu_value)
    disagreement = (larger - smaller) / larger

    low = min(td_low, bu_low)
    high = max(td_high, bu_high)

    if disagreement <= 0.15:
        suggested = (td_value + bu_value) / 2
        confidence = "high"
        rationale = (
            f"Top-down (${td_value:,.0f}) and bottom-up (${bu_value:,.0f}) "
            f"agree within {disagreement * 100:.0f}%."
        )
    elif disagreement <= 0.40:
        suggested = bu_value
        confidence = "medium"
        rationale = (
            f"Top-down (${td_value:,.0f}) and bottom-up (${bu_value:,.0f}) "
            f"differ by {disagreement * 100:.0f}%. Anchored to bottom-up since "
            "it reflects your proposal's actual scope."
        )
    else:
        suggested = bu_value
        confidence = "low"
        rationale = (
            f"Top-down (${td_value:,.0f}) and bottom-up (${bu_value:,.0f}) "
            f"differ significantly ({disagreement * 100:.0f}%). The top-down "
            "median may include task orders much larger or smaller than your "
            "scope; bottom-up is the safer anchor but verify your wages and rates."
        )

    return ReconciledPTW(
        suggested_ptw=suggested,
        low=low,
        high=high,
        confidence=confidence,
        method="reconciled",
        disagreement_pct=disagreement,
        rationale=rationale,
    )
