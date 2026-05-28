"""
Build the proposal-context JSON the Pricing Agent reads on every chat turn.

Single source of truth — same calc engine the Excel export uses
(`client/calculation_service.Calculator`). Replaces the frontend's
`frontend/lib/chat/proposalContext.ts` for chat purposes so the agent always
sees what MongoDB has, not a frontend snapshot.

Output shape mirrors the previous frontend serializer (so the agent prompt and
instructions don't have to change):

    {
      "proposal":        {...identity, status, contract shape...},
      "rates":           {...indirect rates...},
      "escalation_rates":{...},
      "months_per_year": {...},
      "totals":          {grand_total, prime_labor_with_fee, ...},
      "by_year":         {"1": {prime_labor_ex_fee, prime_fee, sub, ...}, ...},
      "labor_subtotals": {total_direct_labor_prime: {1: ..., total: ...}, ...},
      "breakdowns": {
        "by_location_type":  {On-Site: {count, hours, cost}, ...},
        "by_wage_source":    {bls: {...}, gsa: {...}},
        "by_work_type":      {prime: {...}, subcontractor: {...}},
        "by_subcontractor":  {<sub_name>: {id, count, hours, cost}},
        "by_year":           # same as by_year above
        "by_category":       {<labor_cat>: {...}},
        "by_percentile":     {25th: {...}, 50th: {...}, ...},
      },
      "positions":         [...],
      "subcontractors":    [...],
      "travel":            [...],
      "odcs":              [...],
      "extensions":        [...],
      "surge":             {...} | None,
      "source_documents":  [...],
    }

The computed values are NOT persisted back to MongoDB — they're rebuilt every
call. MongoDB stores only the raw inputs (the same fields the spreadsheet UI
auto-saves), keeping the data model clean.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from client.calculation_service import Calculator

logger = logging.getLogger(__name__)


# ─── Tiny helpers ──────────────────────────────────────────────────────

def _round(n: Any, decimals: int = 2) -> float:
    """Safe round — handles None / NaN / non-finite without raising."""
    try:
        f = float(n)
    except (TypeError, ValueError):
        return 0.0
    if f != f or f in (float("inf"), float("-inf")):  # NaN / inf
        return 0.0
    return round(f, decimals)


def _map_round(d: Optional[Dict[str, Any]], decimals: int = 2) -> Dict[str, float]:
    if not d:
        return {}
    return {str(k): _round(v, decimals) for k, v in d.items()}


def _is_gsa_position(pos: Dict[str, Any]) -> bool:
    """Mirror frontend isGSAPosition()."""
    if pos.get("wage_source") == "gsa":
        return True
    rates = pos.get("gsa_rates_by_year") or {}
    if rates and pos.get("gsa_current_year"):
        return True
    return False


def _get_effective_salary(pos: Dict[str, Any]) -> float:
    """
    Mirror frontend/lib/utils/salaryHelpers.ts:getEffectiveSalary for BLS
    positions. (GSA is handled separately via getGSARateForYear.)

    Priority (BLS):
      1. selected_salaries[] averaged
      2. custom_salary (legacy)
      3. wage at percentile
      4. selected_wage
      5. 0
    """
    selected = pos.get("selected_salaries")
    if isinstance(selected, list) and selected:
        try:
            nums = [float(x) for x in selected if x is not None]
            if nums:
                return sum(nums) / len(nums)
        except (TypeError, ValueError):
            pass

    custom = pos.get("custom_salary")
    if custom:
        try:
            return float(custom)
        except (TypeError, ValueError):
            pass

    percentile_raw = (pos.get("percentile") or "").replace(" (default)", "")
    if percentile_raw:
        wage = pos.get(f"wage_{percentile_raw}")
        if wage:
            try:
                f = float(wage)
                if f > 0:
                    return f
            except (TypeError, ValueError):
                pass

    selected_wage = pos.get("selected_wage")
    if selected_wage:
        try:
            return float(selected_wage)
        except (TypeError, ValueError):
            pass

    return 0.0


def _reverse_engineer_gsa_rate(
    gsa_rate: float,
    rates: Dict[str, Any],
    location_type: Optional[str] = None,
) -> Dict[str, float]:
    """
    Mirror frontend reverseEngineerGSARate — purely for display breakdown so
    GSA positions show DL/Fringe/OH/G&A/Fee components like BLS does.

    The actual cost is still `gsa_rate × hours` (GSA rates are already
    fully-burdened). The cascade here is for UI consistency only.
    """
    fringe_rate = float(rates.get("fringe") or 0)
    ga_rate = float(rates.get("ga") or 0)
    fee_rate = float(rates.get("fee") or 0)

    oh_onsite = rates.get("oh_onsite")
    oh_offsite = rates.get("oh_offsite")
    legacy_oh = rates.get("oh")
    oh_onsite_val = float(
        oh_onsite if oh_onsite is not None
        else (oh_offsite if oh_offsite is not None else (legacy_oh if legacy_oh is not None else 0.0711))
    )
    oh_offsite_val = float(
        oh_offsite if oh_offsite is not None
        else (oh_onsite if oh_onsite is not None else (legacy_oh if legacy_oh is not None else 0.0711))
    )
    loc = location_type or "On-Site"
    oh_rate = oh_onsite_val if loc == "On-Site" else oh_offsite_val

    multiplier = (1 + fringe_rate) * (1 + oh_rate) * (1 + ga_rate) * (1 + fee_rate)
    if multiplier <= 0:
        return {"dl_rate": 0, "fringe": 0, "oh": 0, "ga": 0, "fee": 0, "fblr": 0}

    dl_rate = gsa_rate / multiplier
    fringe = dl_rate * fringe_rate
    oh = (dl_rate + fringe) * oh_rate
    ga = (dl_rate + fringe + oh) * ga_rate
    fee = (dl_rate + fringe + oh + ga) * fee_rate
    fblr = dl_rate + fringe + oh + ga + fee

    return {
        "dl_rate": dl_rate,
        "fringe": fringe,
        "oh": oh,
        "ga": ga,
        "fee": fee,
        "fblr": fblr,
    }


def _get_oh_rate_for_location(rates: Dict[str, Any], location_type: Optional[str]) -> float:
    """Pick oh_onsite vs oh_offsite (with fallback chain to legacy 'oh' field)."""
    oh_onsite = rates.get("oh_onsite")
    oh_offsite = rates.get("oh_offsite")
    legacy_oh = rates.get("oh")
    oh_onsite_val = float(
        oh_onsite if oh_onsite is not None
        else (legacy_oh if legacy_oh is not None else 0.0711)
    )
    oh_offsite_val = float(
        oh_offsite if oh_offsite is not None
        else (legacy_oh if legacy_oh is not None else 0.0711)
    )
    return oh_onsite_val if (location_type or "On-Site") == "On-Site" else oh_offsite_val


# ─── Per-position breakdown (mirrors performTransformToAdvanced) ──────

def _compute_position_breakdown(
    pos: Dict[str, Any],
    rates: Dict[str, Any],
    escalation_rates: Dict[str, Any],
) -> Dict[str, Dict[str, float]]:
    """
    Build per-year breakdown {year_str: {wage, dl_rate, fringe, oh, ga, fee,
    fblr, hours, amount}} for a single position.

    GSA positions: rate from gsa_rates_by_year × (1 - discount), reverse-
    engineered into cascade for display. Cost = gsaRate × hours (NOT FBLR ×
    hours — they should be equal but we use rate directly to be safe).

    BLS positions: standard cascade with compound escalation.
    """
    breakdown: Dict[str, Dict[str, float]] = {}
    hours_by_year: Dict[str, Any] = pos.get("hours_per_year") or {}
    is_gsa = _is_gsa_position(pos)

    for year_str, hours_raw in hours_by_year.items():
        try:
            year_num = int(year_str)
        except (TypeError, ValueError):
            continue
        try:
            hours = float(hours_raw or 0)
        except (TypeError, ValueError):
            hours = 0.0

        if is_gsa:
            original_gsa_rate = Calculator.get_gsa_rate_for_year(
                gsa_rates_by_year=pos.get("gsa_rates_by_year") or {},
                gsa_current_year=pos.get("gsa_current_year"),
                proposal_year=year_num,
                escalation_rates=escalation_rates,
                gsa_custom_rate=pos.get("gsa_custom_rate"),
            )
            discount = float(pos.get("gsa_discount_rate") or 0)
            gsa_rate = original_gsa_rate * (1 - discount)
            cascade = _reverse_engineer_gsa_rate(gsa_rate, rates, pos.get("location_type"))
            total_amount = gsa_rate * hours

            breakdown[year_str] = {
                "hours": hours,
                "wage": gsa_rate,
                "dl_rate": cascade["dl_rate"],
                "fringe": cascade["fringe"],
                "oh": cascade["oh"],
                "ga": cascade["ga"],
                "fee": cascade["fee"],
                "fblr": gsa_rate,  # GSA rate IS the FBLR (not the reverse-eng)
                "amount": total_amount,
                # Per-component amounts for aggregate slicing
                "dl_amount": cascade["dl_rate"] * hours,
                "fringe_amount": cascade["fringe"] * hours,
                "oh_amount": cascade["oh"] * hours,
                "ga_amount": cascade["ga"] * hours,
                "fee_amount": cascade["fee"] * hours,
            }
            continue

        # BLS path
        base_wage = _get_effective_salary(pos)
        standard_fte_hours = pos.get("standard_fte_hours") or 0
        if not base_wage or not standard_fte_hours:
            breakdown[year_str] = {
                "hours": hours, "wage": 0, "dl_rate": 0, "fringe": 0,
                "oh": 0, "ga": 0, "fee": 0, "fblr": 0, "amount": 0,
                "dl_amount": 0, "fringe_amount": 0, "oh_amount": 0,
                "ga_amount": 0, "fee_amount": 0,
            }
            continue

        # Compound escalation for years 2..year_num
        wage = float(base_wage)
        for y in range(1, year_num):
            esc = float(escalation_rates.get(f"{y}_to_{y + 1}") or 0)
            wage *= 1 + esc

        dl_rate = wage / float(standard_fte_hours)
        fringe_rate = float(rates.get("fringe") or 0)
        ga_rate = float(rates.get("ga") or 0)
        fee_rate = float(rates.get("fee") or 0)
        oh_rate = _get_oh_rate_for_location(rates, pos.get("location_type"))

        fringe = dl_rate * fringe_rate
        oh = (dl_rate + fringe) * oh_rate
        ga = (dl_rate + fringe + oh) * ga_rate
        fee = (dl_rate + fringe + oh + ga) * fee_rate
        fblr = dl_rate + fringe + oh + ga + fee
        total_amount = fblr * hours

        breakdown[year_str] = {
            "hours": hours,
            "wage": wage,
            "dl_rate": dl_rate,
            "fringe": fringe,
            "oh": oh,
            "ga": ga,
            "fee": fee,
            "fblr": fblr,
            "amount": total_amount,
            "dl_amount": dl_rate * hours,
            "fringe_amount": fringe * hours,
            "oh_amount": oh * hours,
            "ga_amount": ga * hours,
            "fee_amount": fee * hours,
        }

    return breakdown


# ─── Sub-position effective rate (mirrors calculateGrandTotal sub branch) ──

def _compute_sub_position_rate_by_year(
    sub_pos: Dict[str, Any],
    prime_positions_by_id: Dict[str, Dict[str, Any]],
    rates: Dict[str, Any],
    escalation_rates: Dict[str, Any],
    total_years: int,
) -> Dict[str, float]:
    """
    Per-year effective base rate for a sub position (PRE-markup, since the
    markup is added downstream as smh + ga_passthrough + sub_fee).

    Three cases:
      1. GSA-linked sub: gsaYearRate × (1 - discount) / markup_divisor
      2. rates_per_year provided: take literal value
      3. Otherwise: pos.rate × compound escalation
    """
    smh = float(rates.get("smh") or 0)
    ga_passthrough = float(rates.get("ga_passthrough") or 0)
    sub_fee = float(rates.get("sub_fee") or 0)
    markup_divisor = 1 + smh + ga_passthrough + sub_fee

    result: Dict[str, float] = {}
    orig_id = sub_pos.get("original_position_id")
    prime = prime_positions_by_id.get(orig_id) if orig_id else None
    is_gsa_sub = bool(prime and _is_gsa_position(prime))
    rates_per_year = sub_pos.get("rates_per_year") or {}
    base_rate = float(sub_pos.get("rate") or 0)

    for y in range(1, total_years + 1):
        ys = str(y)
        if is_gsa_sub and prime:
            gsa_year_rate = Calculator.get_gsa_rate_for_year(
                gsa_rates_by_year=prime.get("gsa_rates_by_year") or {},
                gsa_current_year=prime.get("gsa_current_year"),
                proposal_year=y,
                escalation_rates=escalation_rates,
                gsa_custom_rate=prime.get("gsa_custom_rate"),
            )
            discount = float(prime.get("gsa_discount_rate") or 0)
            result[ys] = (gsa_year_rate * (1 - discount)) / markup_divisor if markup_divisor else 0.0
        elif ys in rates_per_year and rates_per_year[ys] is not None:
            try:
                result[ys] = float(rates_per_year[ys])
            except (TypeError, ValueError):
                result[ys] = 0.0
        else:
            rate = base_rate
            for yy in range(1, y):
                esc = float(escalation_rates.get(f"{yy}_to_{yy + 1}") or 0)
                rate *= 1 + esc
            result[ys] = rate

    return result


# ─── Top-level builder ────────────────────────────────────────────────

def build_proposal_context(proposal: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a MongoDB proposal document into the agent's per-turn context JSON.

    Args:
        proposal: The proposal document as returned by ProposalCRUD.get_proposal
                  (already serialized — _id → id as string).

    Returns:
        Dict matching the schema documented in this module's docstring. Safe to
        json.dumps() and inject into the agent instructions.
    """
    sd: Dict[str, Any] = proposal.get("spreadsheet_data") or {}
    rates: Dict[str, Any] = sd.get("rates") or proposal.get("rates") or {}
    escalation_rates: Dict[str, Any] = (
        sd.get("escalation_rates") or proposal.get("escalation_rates") or {}
    )
    months_per_year: Dict[str, Any] = sd.get("months_per_year") or {}
    metadata: Dict[str, Any] = proposal.get("metadata") or {}

    total_years = int(
        metadata.get("total_years")
        or (int(metadata.get("base_years") or 0) + int(metadata.get("option_years") or 0))
        or 1
    )
    base_years = int(metadata.get("base_years") or 0)
    option_years = int(metadata.get("option_years") or 0)

    raw_positions: List[Dict[str, Any]] = sd.get("positions") or []
    raw_subs: List[Dict[str, Any]] = sd.get("subcontractors") or []
    raw_travel: List[Dict[str, Any]] = sd.get("travel") or []
    raw_odcs: List[Dict[str, Any]] = sd.get("odcs") or []
    extensions: List[Dict[str, Any]] = sd.get("extensions") or []
    surge: Optional[Dict[str, Any]] = sd.get("surge")

    # Apply the same load-time defaults the frontend store applies in
    # `loadProposal`: location_type → 'On-Site', standard_fte_hours →
    # metadata.fte_hours_threshold. Without these, older proposals (where
    # these fields were never persisted) compute as $0 even though the UI
    # shows real numbers. Mutate in place so all downstream serializers /
    # breakdown slices see consistent values.
    fte_threshold = metadata.get("fte_hours_threshold")
    for pos in raw_positions:
        if not pos.get("location_type"):
            pos["location_type"] = "On-Site"
        if not pos.get("standard_fte_hours") and fte_threshold:
            pos["standard_fte_hours"] = fte_threshold

    prime_positions_by_id = {p.get("id"): p for p in raw_positions if p.get("id")}
    sub_names_by_id = {s.get("id"): s.get("name") for s in raw_subs if s.get("id")}

    # ─── Per-position breakdowns ──────────────────────────────────────
    position_breakdowns: Dict[str, Dict[str, Dict[str, float]]] = {}
    for pos in raw_positions:
        pid = pos.get("id")
        if not pid:
            continue
        position_breakdowns[pid] = _compute_position_breakdown(pos, rates, escalation_rates)

    # ─── Aggregates by year (prime only — skip assigned-to-sub) ──────
    by_year_prime: Dict[str, Dict[str, float]] = {}
    ot_multiplier = float(rates.get("ot_multiplier") or 1.5)
    for pos in raw_positions:
        if pos.get("assigned_subcontractor_id"):
            continue
        pid = pos.get("id")
        if not pid or pid not in position_breakdowns:
            continue
        ot_hours_by_year = pos.get("ot_hours_per_year") or {}
        for ys, b in position_breakdowns[pid].items():
            slot = by_year_prime.setdefault(ys, {
                "dl": 0.0, "fringe": 0.0, "oh": 0.0, "ga": 0.0, "fee": 0.0,
                "ot": 0.0, "total_amount": 0.0,
            })
            slot["dl"] += b["dl_amount"]
            slot["fringe"] += b["fringe_amount"]
            slot["oh"] += b["oh_amount"]
            slot["ga"] += b["ga_amount"]
            slot["fee"] += b["fee_amount"]
            slot["total_amount"] += b["amount"]
            ot_h = 0.0
            try:
                ot_h = float(ot_hours_by_year.get(ys) or 0)
            except (TypeError, ValueError):
                pass
            if ot_h > 0:
                slot["ot"] += ot_h * b["fblr"] * ot_multiplier

    # ─── Subcontractor totals ─────────────────────────────────────────
    smh = float(rates.get("smh") or 0)
    ga_passthrough = float(rates.get("ga_passthrough") or 0)
    sub_fee_rate = float(rates.get("sub_fee") or 0)
    markup_factor = 1 + smh + ga_passthrough + sub_fee_rate

    serialized_subs: List[Dict[str, Any]] = []
    sub_year_totals: Dict[str, float] = {}  # per-year sub_base totals (pre-markup)

    for sub in raw_subs:
        sub_positions_out: List[Dict[str, Any]] = []
        sub_total_cost = 0.0
        for sub_pos in sub.get("positions") or []:
            rate_by_year = _compute_sub_position_rate_by_year(
                sub_pos, prime_positions_by_id, rates, escalation_rates, total_years
            )
            hours_per_year = sub_pos.get("hours_per_year") or {}
            ot_hours_per_year = sub_pos.get("ot_hours_per_year") or {}
            cost_by_year: Dict[str, float] = {}
            total_cost = 0.0
            for y in range(1, total_years + 1):
                ys = str(y)
                rate = rate_by_year.get(ys, 0.0)
                try:
                    h = float(hours_per_year.get(ys) or 0)
                except (TypeError, ValueError):
                    h = 0.0
                try:
                    oth = float(ot_hours_per_year.get(ys) or 0)
                except (TypeError, ValueError):
                    oth = 0.0
                regular = rate * h
                ot = rate * ot_multiplier * oth
                base = regular + ot
                marked_up = base * markup_factor
                cost_by_year[ys] = _round(marked_up)
                total_cost += marked_up
                sub_year_totals[ys] = sub_year_totals.get(ys, 0.0) + base
            sub_positions_out.append({
                "labor_category": sub_pos.get("labor_category"),
                "original_position_id": sub_pos.get("original_position_id"),
                "location_type": sub_pos.get("location_type"),
                "base_rate": _round(sub_pos.get("rate") or 0, 4),
                "billable_rate_year_1": _round((rate_by_year.get("1") or 0) * markup_factor, 4),
                "rates_by_year": _map_round(rate_by_year, 4),
                "hours_per_year": hours_per_year,
                "ot_hours_per_year": ot_hours_per_year or None,
                "cost_by_year": cost_by_year,
                "total_cost": _round(total_cost),
            })
            sub_total_cost += total_cost
        serialized_subs.append({
            "id": sub.get("id"),
            "name": sub.get("name"),
            "position_count": len(sub_positions_out),
            "total_cost": _round(sub_total_cost),
            "positions": sub_positions_out,
        })

    # ─── Travel / ODC per-year ────────────────────────────────────────
    serialized_travel: List[Dict[str, Any]] = []
    travel_year_totals: Dict[str, float] = {}
    ga_rate = float(rates.get("ga") or 0)
    for item in raw_travel:
        with_ga_by_year: Dict[str, float] = {}
        total_with_ga = 0.0
        amount_per_year = item.get("amount_per_year") or {}
        escalate = bool(item.get("escalate"))
        for y in range(1, total_years + 1):
            ys = str(y)
            try:
                amt = float(amount_per_year.get(ys) or 0)
            except (TypeError, ValueError):
                amt = 0.0
            if escalate:
                for yy in range(1, y):
                    esc = float(escalation_rates.get(f"{yy}_to_{yy + 1}") or 0)
                    amt *= 1 + esc
            with_ga = amt * (1 + ga_rate)
            with_ga_by_year[ys] = _round(with_ga)
            total_with_ga += with_ga
            travel_year_totals[ys] = travel_year_totals.get(ys, 0.0) + with_ga
        serialized_travel.append({
            "id": item.get("id"),
            "description": item.get("description"),
            "escalate": escalate,
            "amount_per_year": amount_per_year,
            "with_ga_by_year": with_ga_by_year,
            "total_with_ga": _round(total_with_ga),
        })

    serialized_odcs: List[Dict[str, Any]] = []
    odc_year_totals: Dict[str, float] = {}
    smh_rate = float(rates.get("smh") or 0)
    for item in raw_odcs:
        with_smh_by_year: Dict[str, float] = {}
        total_with_smh = 0.0
        amount_per_year = item.get("amount_per_year") or {}
        escalate = bool(item.get("escalate"))
        for y in range(1, total_years + 1):
            ys = str(y)
            try:
                amt = float(amount_per_year.get(ys) or 0)
            except (TypeError, ValueError):
                amt = 0.0
            if escalate:
                for yy in range(1, y):
                    esc = float(escalation_rates.get(f"{yy}_to_{yy + 1}") or 0)
                    amt *= 1 + esc
            with_smh = amt * (1 + smh_rate)
            with_smh_by_year[ys] = _round(with_smh)
            total_with_smh += with_smh
            odc_year_totals[ys] = odc_year_totals.get(ys, 0.0) + with_smh
        serialized_odcs.append({
            "id": item.get("id"),
            "category": item.get("category"),
            "description": item.get("description"),
            "escalate": escalate,
            "amount_per_year": amount_per_year,
            "with_smh_by_year": with_smh_by_year,
            "total_with_smh": _round(total_with_smh),
        })

    # ─── Totals (mirrors calculateGrandTotal) ────────────────────────
    prime_labor_ex_fee = sum(s["dl"] + s["fringe"] + s["oh"] + s["ga"] for s in by_year_prime.values())
    prime_fee_total = prime_labor_ex_fee * (float(rates.get("fee") or 0))
    prime_labor_with_fee = prime_labor_ex_fee + prime_fee_total
    ot_total = sum(s["ot"] for s in by_year_prime.values())

    sub_base_total = sum(sub_year_totals.values())
    passthrough_total = sub_base_total * (smh + ga_passthrough)
    sub_fee_total = sub_base_total * sub_fee_rate

    travel_total = sum(travel_year_totals.values())
    odc_total = sum(odc_year_totals.values())

    surge_total = 0.0
    surge_pct = None
    if surge and surge.get("percentage") is not None:
        try:
            surge_pct = float(surge.get("percentage") or 0)
        except (TypeError, ValueError):
            surge_pct = 0
        surge_mult = float(rates.get("surge_multiplier") or 1.15)
        surge_total = prime_labor_with_fee * surge_pct * surge_mult

    grand_total = (
        prime_labor_ex_fee + prime_fee_total + ot_total
        + sub_base_total + passthrough_total + sub_fee_total
        + travel_total + odc_total + surge_total
    )

    totals = {
        "grand_total": _round(grand_total),
        "prime_labor_with_fee": _round(prime_labor_with_fee),
        "prime_labor_ex_fee": _round(prime_labor_ex_fee),
        "prime_fee_total": _round(prime_fee_total),
        "subcontractor_total": _round(sub_base_total),
        "passthrough_total": _round(passthrough_total),
        "sub_fee_total": _round(sub_fee_total),
        "ot_total": _round(ot_total),
        "travel_total": _round(travel_total),
        "odc_total": _round(odc_total),
        "surge_total": _round(surge_total),
    }

    # ─── Per-year roll-up (grand total components) ───────────────────
    by_year: Dict[str, Dict[str, float]] = {}
    for y in range(1, total_years + 1):
        ys = str(y)
        prime_slot = by_year_prime.get(ys, {})
        prime_ex_fee_y = (
            prime_slot.get("dl", 0) + prime_slot.get("fringe", 0)
            + prime_slot.get("oh", 0) + prime_slot.get("ga", 0)
        )
        prime_fee_y = prime_ex_fee_y * float(rates.get("fee") or 0)
        ot_y = prime_slot.get("ot", 0)
        sub_base_y = sub_year_totals.get(ys, 0.0)
        passthrough_y = sub_base_y * (smh + ga_passthrough)
        sub_fee_y = sub_base_y * sub_fee_rate
        travel_y = travel_year_totals.get(ys, 0.0)
        odc_y = odc_year_totals.get(ys, 0.0)
        surge_y = 0.0
        if surge_pct is not None:
            surge_mult = float(rates.get("surge_multiplier") or 1.15)
            surge_y = (prime_ex_fee_y + prime_fee_y) * surge_pct * surge_mult
        year_total = (
            prime_ex_fee_y + prime_fee_y + ot_y
            + sub_base_y + passthrough_y + sub_fee_y
            + travel_y + odc_y + surge_y
        )
        by_year[ys] = {
            "prime_labor_ex_fee": _round(prime_ex_fee_y),
            "prime_fee": _round(prime_fee_y),
            "ot": _round(ot_y),
            "sub": _round(sub_base_y),
            "passthrough": _round(passthrough_y),
            "sub_fee": _round(sub_fee_y),
            "travel": _round(travel_y),
            "odc": _round(odc_y),
            "surge": _round(surge_y),
            "year_total": _round(year_total),
        }

    # ─── Labor subtotals (matches the bottom panel) ──────────────────
    labor_subtotals: Dict[str, Dict[str, float]] = {}
    label_map = {
        "dl": "total_direct_labor_prime",
        "fringe": "total_fringe_prime",
        "oh": "total_overhead_prime",
        "ga": "total_ga_prime",
        "fee": "total_fee_prime",
    }
    for key, label in label_map.items():
        row: Dict[str, float] = {}
        grand = 0.0
        for y in range(1, total_years + 1):
            ys = str(y)
            v = by_year_prime.get(ys, {}).get(key, 0.0)
            if key == "fee":
                # Prime fee isn't tracked per-position in our agg; recompute here
                # from prime_ex_fee_year × fee_rate to match the UI bottom panel.
                ex_fee_y = (
                    by_year_prime.get(ys, {}).get("dl", 0)
                    + by_year_prime.get(ys, {}).get("fringe", 0)
                    + by_year_prime.get(ys, {}).get("oh", 0)
                    + by_year_prime.get(ys, {}).get("ga", 0)
                )
                v = ex_fee_y * float(rates.get("fee") or 0)
            row[ys] = _round(v)
            grand += v
        row["total"] = _round(grand)
        labor_subtotals[label] = row

    # ─── Serialize positions for the agent ───────────────────────────
    positions_out: List[Dict[str, Any]] = []
    for pos in raw_positions:
        pid = pos.get("id")
        bd = position_breakdowns.get(pid, {})
        assigned_sub_id = pos.get("assigned_subcontractor_id")
        assigned_to_sub = (
            {"id": assigned_sub_id, "name": sub_names_by_id.get(assigned_sub_id, "Unknown")}
            if assigned_sub_id else None
        )
        contractor = assigned_to_sub["name"] if assigned_to_sub else "Prime"

        wage_percentiles = {
            p: pos.get(f"wage_{p}") for p in ("10th", "25th", "50th", "75th", "90th")
        }

        by_year_pos: Dict[str, Dict[str, float]] = {}
        for ys, b in bd.items():
            by_year_pos[ys] = {
                "wage": _round(b["wage"]),
                "dl_rate": _round(b["dl_rate"], 4),
                "fringe": _round(b["fringe"], 4),
                "oh": _round(b["oh"], 4),
                "ga": _round(b["ga"], 4),
                "fee": _round(b["fee"], 4),
                "fblr": _round(b["fblr"], 4),
                "hours": b["hours"],
                "amount": _round(b["amount"]),
            }

        total_hours = sum(
            float(v or 0) for v in (pos.get("hours_per_year") or {}).values()
        )
        total_amount = sum(b["amount"] for b in bd.values())

        positions_out.append({
            "id": pid,
            "labor_category": pos.get("labor_category"),
            "description": pos.get("description"),
            "contractor": contractor,
            "location": pos.get("location"),
            "location_type": pos.get("location_type"),
            "is_key_position": bool(pos.get("is_key_position")),
            "is_surge": bool(pos.get("is_surge")),
            "wage_source": "gsa" if _is_gsa_position(pos) else "bls",
            "experience": pos.get("experience"),
            "assigned_to_sub": assigned_to_sub,
            "soc_code": pos.get("soc_code"),
            "soc_title": pos.get("soc_title"),
            "area": pos.get("area"),
            "wage_percentiles": wage_percentiles,
            "selected_percentile": pos.get("selected_percentile"),
            "percentile": pos.get("percentile"),
            "selected_wage": pos.get("selected_wage"),
            "selected_salaries": pos.get("selected_salaries"),
            "custom_salary": pos.get("custom_salary"),
            "gsa_lcat_id": pos.get("gsa_lcat_id"),
            "gsa_title": pos.get("gsa_title"),
            "gsa_rates_by_year": pos.get("gsa_rates_by_year"),
            "gsa_current_year": pos.get("gsa_current_year"),
            "gsa_custom_rate": pos.get("gsa_custom_rate"),
            "gsa_discount_rate": pos.get("gsa_discount_rate"),
            "suggested_discount_rate": pos.get("suggested_discount_rate"),
            "discount_rationale": pos.get("discount_rationale"),
            "bls_comparison_wage": pos.get("bls_comparison_wage"),
            "bls_comparison_fblr": pos.get("bls_comparison_fblr"),
            "bls_comparison_percentile": pos.get("bls_comparison_percentile"),
            "standard_fte_hours": pos.get("standard_fte_hours"),
            "hours_per_year": pos.get("hours_per_year") or {},
            "ot_hours_per_year": pos.get("ot_hours_per_year"),
            "total_hours": total_hours,
            "by_year": by_year_pos,
            "total_amount": _round(total_amount),
        })

    # ─── Breakdown slices ────────────────────────────────────────────
    def slice_of(items: List[Dict[str, Any]]) -> Dict[str, float]:
        return {
            "position_count": len(items),
            "total_hours": sum(p["total_hours"] for p in items),
            "total_cost": _round(sum(p["total_amount"] for p in items)),
        }

    prime_only = [p for p in positions_out if not p["assigned_to_sub"]]

    def group_by(key_fn) -> Dict[str, Dict[str, float]]:
        groups: Dict[str, List[Dict[str, Any]]] = {}
        for p in prime_only:
            k = key_fn(p)
            if not k:
                continue
            groups.setdefault(k, []).append(p)
        return {k: slice_of(v) for k, v in groups.items()}

    by_subcontractor: Dict[str, Dict[str, Any]] = {}
    for sub in serialized_subs:
        sub_total_hours = 0.0
        for sp in sub["positions"]:
            sub_total_hours += sum(
                float(v or 0) for v in (sp.get("hours_per_year") or {}).values()
            )
        by_subcontractor[sub["name"] or sub["id"]] = {
            "id": sub["id"],
            "position_count": sub["position_count"],
            "total_hours": sub_total_hours,
            "total_cost": sub["total_cost"],
        }

    breakdowns = {
        "by_location_type": group_by(lambda p: p.get("location_type")),
        "by_wage_source": group_by(lambda p: p.get("wage_source")),
        "by_work_type": {
            "prime": slice_of(prime_only),
            "subcontractor": {
                "position_count": sum(s["position_count"] for s in serialized_subs),
                "total_hours": sum(v["total_hours"] for v in by_subcontractor.values()),
                "total_cost": _round(sum(s["total_cost"] for s in serialized_subs)),
            },
        },
        "by_subcontractor": by_subcontractor,
        "by_year": by_year,
        "by_category": group_by(lambda p: p.get("labor_category")),
        "by_percentile": group_by(
            lambda p: (p.get("selected_percentile") or p.get("percentile") or "").replace(" (default)", "")
        ),
    }

    # ─── Documents → source_documents ────────────────────────────────
    source_documents: List[Dict[str, Any]] = []
    for d in proposal.get("documents") or []:
        if not isinstance(d, dict):
            continue
        source_documents.append({
            "filename": d.get("filename") or d.get("name") or "unknown",
            "uploaded_at": d.get("uploadDate") or d.get("uploaded_at"),
            "file_type": d.get("file_type") or d.get("type"),
            "size_bytes": d.get("file_size") or d.get("size_bytes") or d.get("size"),
        })

    wage_source = proposal.get("wage_source") or {}

    return {
        "proposal": {
            "id": str(proposal.get("id") or proposal.get("_id") or ""),
            "name": proposal.get("name"),
            "solicitation_number": proposal.get("solicitation_number"),
            "prime_contractor": proposal.get("prime_contractor_name"),
            "dcaa_contact": proposal.get("dcaa_contact"),
            "status": proposal.get("status"),
            "business_status": proposal.get("business_status"),
            "visibility": proposal.get("visibility"),
            "shared_with": proposal.get("shared_with") or [],
            "created_at": _iso(proposal.get("created_at")),
            "updated_at": _iso(proposal.get("updated_at")),
            "wage_source_type": wage_source.get("type"),
            "wage_source_file_id": wage_source.get("file_id"),
            "total_years": total_years,
            "base_years": base_years,
            "option_years": option_years,
            "stored_total_cost": proposal.get("total_cost"),
        },
        "rates": rates,
        "escalation_rates": escalation_rates,
        "months_per_year": months_per_year,
        "totals": totals,
        "by_year": by_year,
        "labor_subtotals": labor_subtotals,
        "breakdowns": breakdowns,
        "positions": positions_out,
        "subcontractors": serialized_subs,
        "travel": serialized_travel,
        "odcs": serialized_odcs,
        "extensions": extensions,
        "surge": surge,
        "source_documents": source_documents,
    }


def _iso(value: Any) -> Optional[str]:
    """ISO-format a datetime or pass through strings/None."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:  # noqa: BLE001
            pass
    return str(value)
