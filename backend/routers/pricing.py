"""
Pricing router for spreadsheet recalculation and PTW suggestions.

Note: Document upload and processing moved to /api/proposals/upload
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import math

from auth.dependencies import get_current_user
from client.ptw_calculator import compute_bottom_up_ptw, reconcile
from client.usaspending_client import get_usaspending_client, USASpendingError
from utils.proposals import get_proposal_crud

logger = logging.getLogger(__name__)

router = APIRouter()


def split_position_by_hours(position: Dict, max_hours: int = 1920) -> List[Dict]:
    """
    Split a position into multiple FTE rows if hours > max_hours.

    Args:
        position: Job position dict with 'hours' field
        max_hours: Max hours per person (default 1920)

    Returns:
        List of position dicts (1 or more)

    Example:
        Input: {"labor_category": "Engineer", "hours": 5760, "wage_75th": 150000}
        Output: [
            {"labor_category": "Engineer", "hours": 1920, "wage_75th": 150000},
            {"labor_category": "Engineer", "hours": 1920, "wage_75th": 150000},
            {"labor_category": "Engineer", "hours": 1920, "wage_75th": 150000}
        ]
    """
    hours = position.get('hours', 1920)

    if hours <= max_hours:
        return [position]  # No split needed

    # Calculate number of FTEs needed
    fte_count = math.ceil(hours / max_hours)

    # Split into multiple positions
    positions = []
    for i in range(fte_count):
        new_position = position.copy()
        # Keep labor_category unchanged - no FTE labeling

        # Distribute hours: first N-1 get max_hours, last one gets remainder
        if i < fte_count - 1:
            new_position['hours'] = max_hours
        else:
            new_position['hours'] = hours - (max_hours * (fte_count - 1))

        positions.append(new_position)

    return positions


def split_multi_year_position(
    position: Dict,
    max_hours: int = 1920,
    months_per_year: Optional[Dict[str, int]] = None
) -> List[Dict]:
    """
    Split a multi-year position into multiple FTE rows if any year has hours > max_hours.

    Finds the year with maximum hours and creates that many FTE positions.
    Each position gets up to max_hours per year, unused FTEs get 0 hours.

    NOW SUPPORTS VARIABLE MONTH DURATIONS:
    - If a year has 8 months, the FTE threshold is prorated: (8/12) × max_hours
    - Ensures splitting is consistent with partial-year contracts

    Args:
        position: Job position dict with 'hours_per_year' field
        max_hours: Max hours per person per FULL year (default 1920)
        months_per_year: Optional dict of months per year (e.g., {"1": 12, "2": 8})

    Returns:
        List of position dicts (1 or more)

    Example:
        Input: {
            "labor_category": "Engineer",
            "hours_per_year": {"1": 1920, "2": 5760, "3": 2560},
            "wage_75th": 150000
        }
        With months_per_year = {"1": 12, "2": 12, "3": 8}

        Year 3 threshold = (8/12) × 1920 = 1280
        Year 3 needs 2560/1280 = 2 FTEs

        Output: [
            {"labor_category": "Engineer", "hours_per_year": {"1": 1920, "2": 1920, "3": 1280}, ...},
            {"labor_category": "Engineer", "hours_per_year": {"1": 0, "2": 1920, "3": 1280}, ...},
            {"labor_category": "Engineer", "hours_per_year": {"1": 0, "2": 1920, "3": 0}, ...}
        ]
    """
    hours_per_year = position.get('hours_per_year', {})

    if not hours_per_year:
        return [position]  # No hours_per_year, can't split

    # Calculate year-specific FTE thresholds (respecting month durations)
    year_thresholds = {}
    max_ftes_needed = 0

    for year, total_hours in hours_per_year.items():
        # Get months for this year (default to 12)
        months = months_per_year.get(year, 12) if months_per_year else 12

        # Calculate prorated FTE threshold for this year
        year_threshold = (months / 12.0) * max_hours
        year_thresholds[year] = year_threshold

        # Calculate FTEs needed for this year
        if total_hours > year_threshold:
            ftes_needed = math.ceil(total_hours / year_threshold)
            max_ftes_needed = max(max_ftes_needed, ftes_needed)

    # If no year exceeds its threshold, no split needed
    if max_ftes_needed <= 1:
        return [position]

    # Calculate number of FTEs needed (based on max across all years)
    fte_count = max_ftes_needed

    # Create split positions
    split_positions = []
    for i in range(fte_count):
        new_position = position.copy()
        new_hours_per_year = {}

        # Distribute hours for each year independently (using year-specific thresholds)
        for year, total_hours in hours_per_year.items():
            # Get this year's threshold (respects month duration)
            year_threshold = year_thresholds.get(year, max_hours)

            # Calculate remaining hours for this FTE
            remaining_hours = total_hours - (i * year_threshold)

            if remaining_hours > 0:
                # This FTE gets work this year (up to year_threshold)
                new_hours_per_year[year] = min(remaining_hours, year_threshold)
            else:
                # This FTE is not needed this year
                new_hours_per_year[year] = 0

        new_position['hours_per_year'] = new_hours_per_year
        split_positions.append(new_position)

    return split_positions


# Removed old process_documents_task, /process, and /status endpoints
# Replaced by /api/proposals/upload and /api/proposals/{id}/status in proposals router


@router.post("/recalculate")
async def recalculate_spreadsheet(request: Dict[str, Any]):
    """
    Recalculate spreadsheet values using backend calculator.

    Expected request structure:
    {
        "positions": [
            {
                "id": "pos_0",
                "percentile": "75th",
                "wage_10th": 60320,
                "wage_50th": 96800,
                "wage_75th": 123390,
                "year1_hours": 1880,
                "year2_hours": 1880,
                ...
            }
        ],
        "rates": {
            "fringe": 0.247,
            "oh_onsite": 0.0711,
            "oh_offsite": 0.0711,
            "ga": 0.2243,
            "fee": 0.08
        },
        "escalation_rates": {
            "1_to_2": 0.0272,
            "2_to_3": 0.0299,
            ...
        },
        "total_years": 5
    }

    Returns calculated FBLR, amounts, and totals for all positions.
    """
    try:
        from client.calculation_service import Calculator

        positions = request.get("positions", [])
        rates = request.get("rates", {})
        escalation_rates = request.get("escalation_rates", {})
        total_years = request.get("total_years", 5)

        results = []

        # Calculate each position
        for pos in positions:
            # Get wage - prioritize selected_wage (which may contain custom salary)
            # over percentile wage lookup
            percentile = pos.get("percentile", "50th")
            selected_wage = pos.get("selected_wage")
            if selected_wage is not None and selected_wage > 0:
                base_wage = selected_wage
            else:
                base_wage = pos.get(f"wage_{percentile}", 0)

            # Build hours per year (convert to string keys for Calculator)
            hours_per_year = {}
            for year in range(1, total_years + 1):
                hours_per_year[str(year)] = pos.get(f"year{year}_hours", 1880)

            # Get standard FTE hours from position (provided by jd_parser)
            standard_fte_hours = pos.get("standard_fte_hours", 1880)

            # Calculate Year 1 FBLR
            year_1_hours = hours_per_year.get("1", 1880)

            # Skip positions with invalid wages
            if base_wage <= 0:
                results.append({
                    "id": pos.get("id"),
                    "years": [],
                    "total_hours": 0,
                    "total_amount": 0
                })
                continue
            # Get location type to determine which OH rate to use
            location_type = pos.get("location_type", "On-Site")

            fblr_breakdown = Calculator.calculate_fblr(
                annual_wage=base_wage,
                standard_fte_hours=standard_fte_hours,  # Use standard FTE hours, not actual year hours
                fringe_rate=rates.get("fringe", 0.247),
                oh_onsite_rate=rates.get("oh_onsite", rates.get("oh", 0.0711)),
                oh_offsite_rate=rates.get("oh_offsite", rates.get("oh", 0.0711)),
                location_type=location_type,
                ga_rate=rates.get("ga", 0.2243)
            )
            base_fblr = fblr_breakdown["fblr"]

            # Build yearly data with escalation
            yearly_data = []
            for year in range(1, total_years + 1):
                if year == 1:
                    rate = base_fblr
                else:
                    rate = Calculator.calculate_year_rate(
                        base_rate=base_fblr,
                        escalation_rates=escalation_rates,
                        from_year=1,
                        to_year=year
                    )

                hours = hours_per_year.get(str(year), 0)
                amount = round(rate * hours, 2)

                # Determine which OH rate to use for dlRate calculation
                oh_rate_for_calc = rates.get("oh_onsite", 0.0711) if location_type == "On-Site" else rates.get("oh_offsite", 0.0711)
                if oh_rate_for_calc is None:
                    oh_rate_for_calc = rates.get("oh", 0.0711)

                yearly_data.append({
                    "year": year,
                    "hours": hours,
                    "amount": amount,
                    "breakdown": {
                        "fblr": rate,
                        "dlRate": fblr_breakdown["dl_rate"] if year == 1 else round(rate / (1 + rates.get("fringe", 0.247) + oh_rate_for_calc + rates.get("ga", 0.2243)), 2),
                        "fringe": fblr_breakdown["fringe"] if year == 1 else 0,
                        "oh": fblr_breakdown["oh"] if year == 1 else 0,
                        "ga": fblr_breakdown["ga"] if year == 1 else 0
                    }
                })

            # Calculate totals
            total_hours = sum(y["hours"] for y in yearly_data)
            total_amount = sum(y["amount"] for y in yearly_data)

            results.append({
                "id": pos.get("id"),
                "years": yearly_data,
                "total_hours": total_hours,
                "total_amount": total_amount
            })

        return {
            "status": "success",
            "results": results
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Calculation failed: {str(e)}"
        )


# ---------------------------------------------------------------------------
# Price-to-Win (PTW) suggestion
# ---------------------------------------------------------------------------
#
# Given a proposal_id, looks up the proposal's NAICS + agency from MongoDB,
# queries USASpending.gov for comparable past awards, and returns a suggested
# PTW number along with the supporting distribution and top comparables.
#
# This is the top-down half of the PTW estimate. Bottom-up labor-build
# reconciliation (task 6) will be folded in here later.


class PTWSuggestRequest(BaseModel):
    """Request body for POST /api/pricing/ptw/suggest."""

    proposal_id: str = Field(description="Proposal MongoDB ObjectId (as string).")
    keywords: Optional[List[str]] = Field(
        None,
        description=(
            "Optional keywords to narrow the comparable-award search "
            "(e.g. ['SATCOM']). When omitted, the search runs on NAICS + agency alone."
        ),
    )


@router.post("/ptw/suggest")
async def suggest_ptw(
    body: PTWSuggestRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Suggest a Price-to-Win target based on comparable past federal awards.

    Reads the proposal's NAICS code, awarding agency, and period of performance
    from MongoDB, then queries USASpending.gov for similar contracts. Returns a
    suggested PTW (median $/year scaled across the PoP with annual escalation),
    a competitive low/high band (P25/P75), and the top 10 comparable awards.

    Returns 400 if the proposal is missing NAICS or agency — those are required
    inputs and the user should fill them in via the proposal metadata UI.
    Returns 404 if the proposal doesn't exist or the user doesn't have access.
    Returns 502 if USASpending itself fails.
    """
    crud = get_proposal_crud()

    proposal = crud.get_proposal(
        body.proposal_id,
        str(current_user["_id"]),
        organization_id=current_user.get("organization_id"),
        role=current_user.get("role"),
    )
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found or access denied.",
        )

    naics_code = proposal.get("naics_code")
    agency = proposal.get("agency")

    missing: List[str] = []
    if not naics_code:
        missing.append("naics_code")
    if not agency:
        missing.append("agency")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Proposal is missing required field(s) for PTW lookup: {', '.join(missing)}. "
                "Add them via the proposal metadata, or re-upload so the parser can fill them in."
            ),
        )

    # Pull total contract years from the metadata block populated by processing.py
    metadata = proposal.get("metadata") or {}
    total_years = metadata.get("total_years") or 5

    # Keyword fallback: explicit body.keywords win, otherwise use the
    # scope_keywords the parser extracted from the document. This means the
    # frontend can just send proposal_id and get a focused search for free.
    keywords = body.keywords
    if keywords is None:
        keywords = proposal.get("scope_keywords") or None  # treat [] as None

    # Fetch organization default rates as fallback for BLS positions when the
    # proposal itself has no rates configured (e.g. very fresh upload).
    # No hardcoded numeric defaults in the calculator — everything comes from
    # MongoDB.
    org_default_rates = None
    org_id = proposal.get("organization_id")
    if org_id:
        try:
            from utils.organizations import get_organization_crud
            from bson import ObjectId as _ObjectId
            org_crud = get_organization_crud()
            org_oid = org_id if isinstance(org_id, _ObjectId) else _ObjectId(org_id)
            org = org_crud.get_by_id(org_oid)
            if org and org.get("settings"):
                dr = org["settings"].get("default_rates")
                if dr:
                    org_default_rates = dr
        except Exception as e:
            logger.warning(
                f"PTW: failed to fetch org default rates for proposal "
                f"{body.proposal_id}: {e}"
            )

    # Compute bottom-up FIRST so we can use it to size-filter the top-down
    # comparable pool. Bottom-up is local Python (no network), so this adds
    # ~ms of latency. If the proposal has no priced positions, bottom_up
    # will be empty and we just skip the size filter.
    bottom_up = compute_bottom_up_ptw(
        proposal,
        total_years=int(total_years),
        default_rates=org_default_rates,
    )
    expected_annual_cost = bottom_up.year_1 if bottom_up.is_usable else None

    client = get_usaspending_client()
    try:
        suggestion = await client.suggest_ptw(
            naics_code=naics_code,
            agency_name=agency,
            total_years=int(total_years),
            keywords=keywords,
            expected_annual_cost=expected_annual_cost,
        )
    except USASpendingError as e:
        logger.warning(
            f"PTW suggest failed for proposal {body.proposal_id}: {e.message}"
        )
        # 404 from upstream means no comparables found; surface as 422 so the
        # frontend can show "no comparables" instead of a generic 502.
        if e.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"No comparable past awards found for NAICS {naics_code} / {agency}. "
                    "Try broadening the agency or removing keywords."
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"USASpending lookup failed: {e.message}",
        )
    except Exception as e:
        logger.exception(f"Unexpected PTW error for proposal {body.proposal_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PTW suggestion failed: {e}",
        )

    top_down_dict = suggestion.to_dict()
    reconciled = reconcile(top_down_dict, bottom_up)

    # Response intentionally trimmed to just the reconciliation block + identifying
    # fields. Full top-down comparables list and per-position bottom-up breakdown
    # are computed (and used by the reconciliation engine) but not surfaced — the
    # headline UI doesn't need them. If a debug/detail view is ever needed, gate
    # the verbose payload behind a query param.
    return {
        "proposal_id": body.proposal_id,
        "naics_code": naics_code,
        "agency": agency,
        "total_years": int(total_years),
        "reconciliation": reconciled.to_dict(),
    }
