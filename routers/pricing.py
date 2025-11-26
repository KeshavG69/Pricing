"""
Pricing router for spreadsheet recalculation.

Note: Document upload and processing moved to /api/proposals/upload
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
import math

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
            "oh": 0.0711,
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
            # Get wage based on percentile
            percentile = pos.get("percentile", "50th")
            base_wage = pos.get(f"wage_{percentile}", pos.get("selected_wage", 0))

            if base_wage <= 0:
                # Skip positions with invalid wages
                results.append({
                    "id": pos.get("id"),
                    "years": [],
                    "total_hours": 0,
                    "total_amount": 0
                })
                continue

            # Build hours per year (convert to string keys for Calculator)
            hours_per_year = {}
            for year in range(1, total_years + 1):
                hours_per_year[str(year)] = pos.get(f"year{year}_hours", 1880)

            # Calculate Year 1 FBLR
            year_1_hours = hours_per_year.get("1", 1880)
            fblr_breakdown = Calculator.calculate_fblr(
                annual_wage=base_wage,
                hours=year_1_hours,
                fringe_rate=rates.get("fringe", 0.247),
                oh_rate=rates.get("oh", 0.0711),
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

                yearly_data.append({
                    "year": year,
                    "hours": hours,
                    "amount": amount,
                    "breakdown": {
                        "fblr": rate,
                        "dlRate": fblr_breakdown["dl_rate"] if year == 1 else round(rate / (1 + rates.get("fringe", 0.247) + rates.get("oh", 0.0711) + rates.get("ga", 0.2243)), 2),
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
