"""
Bottom-up PTW calculator.

Computes a Price-to-Win estimate anchored to the proposal's actual scope: the
whole proposal price the app's Overview shows, every priced period included.

The money comes from `build_proposal_context` (utils/proposal_context_builder.py),
the same engine behind Q's chat context, which matches the Overview to the cent:

  - prime labor (BLS FBLR cascade with fee, or GSA rate × (1 - discount))
  - prime overtime and surge
  - subcontractor labor with S&MH, G&A passthrough and sub fee
  - travel with G&A, ODCs with S&MH
  - extension periods (e.g. a 6-month FAR 52.217-8 extension stored as year 6)

An earlier version re-implemented the prime-labor cascade here and looped over
`spreadsheet_data.positions` only, so subs, travel, ODCs, OT and surge never
reached the bottom-up total and the top-down gap verdict was skewed.

No hardcoded numeric defaults: when the proposal has no indirect rates of its
own, the caller's organization defaults are used; otherwise lines that can't
be priced are counted as skipped and explained in `notes`.
"""

import copy
import logging
from dataclasses import dataclass, field
from typing import Optional

from utils.proposal_context_builder import build_proposal_context

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class PositionContribution:
    """Per-line bottom-up breakdown (a prime position or a subcontractor position)."""

    labor_category: str
    wage_source: str  # 'gsa' | 'bls' | 'subcontractor'
    annual_wage_or_hourly_rate: float  # what was used as the input
    year_1_fblr: float  # without fee (== hourly rate for GSA; pre-markup rate for subs)
    year_1_billable_rate: float  # with fee (GSA: same as fblr; subs: with S&MH + passthrough + sub fee)
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
    """End-to-end bottom-up PTW calculation result.

    `total` and `year_1` are the full proposal price (Overview grand total and
    Base Period year total). `by_position` covers labor lines only, at regular
    hours; overtime, travel, ODCs and surge sit in `components`, so the
    by_position costs don't sum to `total` by design.
    """

    total: float
    year_1: float
    total_years: int
    positions_priced: int
    positions_skipped: int
    rates_used: dict
    year_1_months: float = 12.0
    components: dict = field(default_factory=dict)
    by_position: list[PositionContribution] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def is_usable(self) -> bool:
        return self.positions_priced > 0 and self.total > 0

    @property
    def annual_run_rate(self) -> float:
        """Base Period cost scaled to 12 months — comparable to an award's $/year."""
        months = self.year_1_months or 12.0
        return self.year_1 * 12.0 / months

    def to_dict(self) -> dict:
        return {
            "total": round(self.total, -3),  # nearest $1K
            "year_1": round(self.year_1, -3),
            "total_years": self.total_years,
            "positions_priced": self.positions_priced,
            "positions_skipped": self.positions_skipped,
            "rates_used": self.rates_used,
            "components": self.components,
            "by_position": [p.to_dict() for p in self.by_position],
            "notes": self.notes,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sum_hours(hours_per_year: Optional[dict]) -> int:
    total = 0.0
    for v in (hours_per_year or {}).values():
        try:
            total += float(v or 0)
        except (TypeError, ValueError):
            continue
    return int(total)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_bottom_up_ptw(
    proposal: dict,
    default_rates: Optional[dict] = None,
) -> BottomUpEstimate:
    """
    Bottom-up PTW: the proposal's full price, every priced period included.

    Args:
        proposal: The MongoDB proposal document (post-processing, with spreadsheet_data).
                  Not mutated.
        default_rates: Organization default rates dict, used only when the proposal
                       has no indirect rates of its own. Passed by the caller (PTW
                       router fetches from org settings). No hardcoded numeric
                       fallback beyond this.
    """
    # The context builder fills load-time defaults into positions in place.
    proposal = copy.deepcopy(proposal)
    sd = proposal.get("spreadsheet_data") or {}
    proposal["spreadsheet_data"] = sd
    notes: list[str] = []

    if not (sd.get("rates") or proposal.get("rates")) and default_rates:
        sd["rates"] = dict(default_rates)
        notes.append("Proposal has no indirect rates — used organization default rates.")

    ctx = build_proposal_context(proposal)
    totals = ctx["totals"]
    by_year = ctx["by_year"]
    periods = ctx["proposal"]["periods"]
    rates = ctx["rates"] or {}

    by_position: list[PositionContribution] = []
    priced = 0
    skipped = 0
    missing_bls: list[str] = []

    # Prime positions. Ones assigned to a subcontractor are priced on the sub side.
    for pos in ctx["positions"]:
        if pos["assigned_to_sub"]:
            continue
        labor_cat = pos.get("labor_category") or "Unknown"
        pos_by_year = pos.get("by_year") or {}
        y1 = pos_by_year.get("1") or next(iter(pos_by_year.values()), {})
        cost = pos.get("total_amount") or 0.0
        hours = int(pos.get("total_hours") or 0)
        is_gsa = pos.get("wage_source") == "gsa"
        fblr = y1.get("fblr") or 0.0
        if fblr <= 0:
            if hours > 0:
                skipped += 1
                if not is_gsa:
                    missing_bls.append(labor_cat)
            by_position.append(PositionContribution(
                labor_category=labor_cat,
                wage_source="gsa" if is_gsa else "bls",
                annual_wage_or_hourly_rate=0.0,
                year_1_fblr=0.0,
                year_1_billable_rate=0.0,
                total_hours=hours,
                total_cost=0.0,
                note="skipped: missing wage / rate data" if hours > 0 else "no hours",
            ))
            continue
        priced += 1
        by_position.append(PositionContribution(
            labor_category=labor_cat,
            wage_source="gsa" if is_gsa else "bls",
            annual_wage_or_hourly_rate=y1.get("wage") or 0.0,
            year_1_fblr=fblr if is_gsa else fblr - (y1.get("fee") or 0.0),
            year_1_billable_rate=fblr,
            total_hours=hours,
            total_cost=cost,
            note="GSA rate (already fully burdened)" if is_gsa else None,
        ))

    # Subcontractor positions, costs already marked up (S&MH + G&A passthrough + sub fee).
    for sub in ctx["subcontractors"]:
        sub_name = sub.get("name") or sub.get("id") or "Subcontractor"
        for sp in sub.get("positions") or []:
            labor_cat = sp.get("labor_category") or "Unknown"
            hours = _sum_hours(sp.get("hours_per_year"))
            cost = sp.get("total_cost") or 0.0
            base_y1 = (sp.get("rates_by_year") or {}).get("1") or 0.0
            if cost <= 0 and hours > 0:
                skipped += 1
                note = f"skipped: subcontractor {sub_name} has no rate"
            else:
                if cost > 0:
                    priced += 1
                note = f"subcontractor {sub_name} (incl. S&MH, G&A passthrough, sub fee)"
            by_position.append(PositionContribution(
                labor_category=labor_cat,
                wage_source="subcontractor",
                annual_wage_or_hourly_rate=sp.get("base_rate") or 0.0,
                year_1_fblr=base_y1,
                year_1_billable_rate=sp.get("billable_rate_year_1") or 0.0,
                total_hours=hours,
                total_cost=cost,
                note=note,
            ))

    if missing_bls:
        notes.append(
            f"{len(missing_bls)} BLS position(s) with hours priced at $0 — missing "
            f"wage or FTE hours ({', '.join(sorted(set(missing_bls)))})."
        )
    if skipped:
        notes.append(f"{skipped} labor line(s) skipped due to missing data.")
    if not rates:
        notes.append(
            "No indirect rates on the proposal or organization — BLS positions "
            "are priced with the app's built-in OH default only, as the app shows them."
        )
    if priced == 0:
        notes.append(
            "No labor could be priced. Check that wages are populated and, "
            "for BLS positions, that indirect rates are configured."
        )

    return BottomUpEstimate(
        total=totals["grand_total"],
        year_1=(by_year.get("1") or {}).get("year_total", 0.0),
        total_years=ctx["proposal"]["total_years"],
        positions_priced=priced,
        positions_skipped=skipped,
        rates_used=rates,
        year_1_months=float(periods[0].get("months") or 12) if periods else 12.0,
        components=totals,
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


def reconcile(top_down: dict, bottom_up: BottomUpEstimate,
              top_down_note: Optional[str] = None) -> ReconciledPTW:
    """
    Pick a headline PTW number from top-down + bottom-up.

    Rules:
      - If bottom-up is unusable → fall back to top-down alone.
      - If they agree within 15% → average them, "high" confidence.
      - If they disagree 15-40% → prefer bottom-up (proposal-anchored), "medium".
      - If they disagree >40% → use bottom-up, "low" confidence, surface the gap.
      - Low/high band: union of (top-down P25/P75) and (bottom-up ±10%) only when
        they agree; otherwise bottom-up ±10%. A union with a market check that
        disagrees produced bands like $189K–$1.45M around a $1.32M price.
      - No usable top-down (`top_down_note` says why) → bottom-up alone, "low".
    """
    td_value = top_down.get("suggested_ptw") or 0
    td_low = top_down.get("low") or 0
    td_high = top_down.get("high") or 0

    if not bottom_up.is_usable:
        # No scope to size-filter or cross-check against, so the comparables are
        # only as good as the keyword match (an acronym like "AFRC" can match an
        # unrelated programme). Name them so a mismatch is visible, and don't
        # claim more than "low" confidence on a thin pool.
        count = int(top_down.get("num_comparables") or 0)
        samples = [str(c.get("description") or "").strip().title()[:60]
                   for c in (top_down.get("top_comparables") or [])[:3]
                   if c.get("description")]
        confidence = top_down.get("confidence") or "medium"
        if count < 15:
            confidence = "low"
        return ReconciledPTW(
            suggested_ptw=td_value,
            low=td_low,
            high=td_high,
            confidence=confidence,
            method="top_down_only",
            disagreement_pct=None,
            rationale=(
                "Market estimate only — the proposal has no priced positions yet, so "
                f"it can't be checked against your own price. Based on {count} past "
                "awards" + (f", e.g. {'; '.join(samples)}" if samples else "")
                + ". Check they match your scope."
            ),
        )

    bu_value = bottom_up.total
    bu_low = bu_value * 0.9
    bu_high = bu_value * 1.1

    if td_value <= 0:
        why = f" {top_down_note}" if top_down_note else ""
        return ReconciledPTW(
            suggested_ptw=bu_value,
            low=bu_low,
            high=bu_high,
            confidence="low",
            method="bottom_up_only",
            disagreement_pct=None,
            rationale=(
                "No market check: no similar-size past awards were found, so this is "
                f"your own price (${bu_value:,.0f}), not a market-based target.{why}"
            ),
        )

    larger = max(td_value, bu_value)
    smaller = min(td_value, bu_value)
    disagreement = (larger - smaller) / larger

    low, high = bu_low, bu_high

    if disagreement <= 0.15:
        low, high = min(td_low, bu_low), max(td_high, bu_high)
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
