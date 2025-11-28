"""
Multi-year government contract pricing calculator.

Provides all calculation methods for:
- FBLR (Fully Burdened Labor Rate) with wrap rates
- Multi-year escalation
- Position cost breakdown
- ODC (Other Direct Costs) with G&A adder
- Fee calculations
- Subcontractor markup
"""

from typing import Dict, Any


class Calculator:
    """
    Pure calculation methods for multi-year pricing.
    All methods are static - no state maintained.
    """

    @staticmethod
    def calculate_fblr(
        annual_wage: float,
        hours: int,
        fringe_rate: float,
        oh_rate: float,
        ga_rate: float
    ) -> Dict[str, float]:
        """
        Calculate Fully Burdened Labor Rate from annual wage.

        Applies wrap rates in sequence:
        1. DL (Direct Labor) = annual_wage / hours
        2. Fringe = DL × fringe_rate
        3. OH (Overhead) = (DL + Fringe) × oh_rate
        4. G&A (General & Administrative) = (DL + Fringe + OH) × ga_rate
        5. FBLR = DL + Fringe + OH + G&A

        Args:
            annual_wage: Annual salary in dollars
            hours: Annual hours (e.g., 1880 for full-time)
            fringe_rate: Fringe benefits rate (e.g., 0.247 for 24.7%)
            oh_rate: Overhead rate (e.g., 0.0711 for 7.11%)
            ga_rate: G&A rate (e.g., 0.2243 for 22.43%)

        Returns:
            Dict with:
                - dl_rate: Direct labor hourly rate
                - fringe: Fringe amount per hour
                - oh: Overhead amount per hour
                - ga: G&A amount per hour
                - fblr: Fully burdened labor rate (total)

        Example:
            >>> Calculator.calculate_fblr(115000, 1880, 0.247, 0.0711, 0.2243)
            {
                'dl_rate': 61.17,
                'fringe': 15.11,
                'oh': 5.42,
                'ga': 18.32,
                'fblr': 100.02
            }
        """
        # Step 1: Calculate direct labor hourly rate
        dl_rate = round(annual_wage / hours, 2)

        # Step 2: Apply wrap rates (each applies to cumulative subtotal)
        fringe = round(dl_rate * fringe_rate, 2)
        subtotal_1 = dl_rate + fringe

        oh = round(subtotal_1 * oh_rate, 2)
        subtotal_2 = subtotal_1 + oh

        ga = round(subtotal_2 * ga_rate, 2)

        fblr = round(subtotal_2 + ga, 2)

        return {
            "dl_rate": dl_rate,
            "fringe": fringe,
            "oh": oh,
            "ga": ga,
            "fblr": fblr
        }

    @staticmethod
    def calculate_year_rate(
        base_rate: float,
        escalation_rates: Dict[str, float],
        from_year: int,
        to_year: int
    ) -> float:
        """
        Calculate escalated rate for target year using compound escalation.

        Args:
            base_rate: Starting rate (usually Year 1 FBLR)
            escalation_rates: Dict like {"1_to_2": 0.0272, "2_to_3": 0.0299, ...}
            from_year: Starting year (e.g., 1)
            to_year: Target year (e.g., 3)

        Returns:
            Escalated rate for target year

        Example:
            >>> rates = {"1_to_2": 0.0272, "2_to_3": 0.0299}
            >>> Calculator.calculate_year_rate(100.0, rates, 1, 3)
            105.79  # Compounded: 100 × 1.0272 × 1.0299
        """
        current_rate = base_rate

        # Compound escalation year by year
        for year in range(from_year, to_year):
            key = f"{year}_to_{year+1}"
            esc_rate = escalation_rates.get(key, 0.0)
            current_rate = current_rate * (1 + esc_rate)

        return round(current_rate, 2)

    @staticmethod
    def calculate_position_years(
        position_data: Dict[str, Any],
        escalation_rates: Dict[str, float],
        indirect_rates: Dict[str, float],
        total_years: int
    ) -> Dict[str, Any]:
        """
        Calculate complete position costs for all years.

        Combines FBLR calculation, escalation, and variable hours
        to produce year-by-year breakdown.

        Args:
            position_data: Dict with:
                - labor_category: str
                - base_annual_wage: float
                - hours_per_year: Dict[str, int] like {"1": 1880, "2": 1880, ...}
            escalation_rates: Dict like {"1_to_2": 0.0272, ...}
            indirect_rates: Dict with:
                - fringe: float
                - oh: float
                - ga: float
            total_years: Number of years (e.g., 5)

        Returns:
            Dict with:
                - labor_category: str
                - year_1, year_2, ... year_N: Each with {rate, hours, amount}
                - total_cost: float (sum of all years)

        Example:
            >>> position = {
            ...     "labor_category": "Senior Software Engineer",
            ...     "base_annual_wage": 115000,
            ...     "hours_per_year": {"1": 1880, "2": 1880, "3": 0}
            ... }
            >>> Calculator.calculate_position_years(
            ...     position,
            ...     {"1_to_2": 0.03, "2_to_3": 0.03},
            ...     {"fringe": 0.25, "oh": 0.07, "ga": 0.22},
            ...     3
            ... )
        """
        results = {}
        labor_category = position_data["labor_category"]
        base_wage = float(position_data["base_annual_wage"])
        hours_per_year = position_data["hours_per_year"]

        # Year 1: Calculate base FBLR
        year_1_hours = hours_per_year.get("1", 0)
        if year_1_hours > 0:
            fblr_breakdown = Calculator.calculate_fblr(
                base_wage,
                year_1_hours,
                indirect_rates["fringe"],
                indirect_rates["oh"],
                indirect_rates["ga"]
            )
            base_fblr = fblr_breakdown["fblr"]
        else:
            # No hours in Year 1, still need FBLR for future years
            # Use default 1880 hours for calculation only
            fblr_breakdown = Calculator.calculate_fblr(
                base_wage,
                1880,
                indirect_rates["fringe"],
                indirect_rates["oh"],
                indirect_rates["ga"]
            )
            base_fblr = fblr_breakdown["fblr"]

        results["year_1"] = {
            "rate": base_fblr,
            "hours": year_1_hours,
            "amount": round(base_fblr * year_1_hours, 2)
        }

        # Years 2-N: Escalate rate and calculate amount
        for year in range(2, total_years + 1):
            escalated_rate = Calculator.calculate_year_rate(
                base_fblr,
                escalation_rates,
                from_year=1,
                to_year=year
            )

            hours = hours_per_year.get(str(year), 0)
            amount = round(escalated_rate * hours, 2)

            results[f"year_{year}"] = {
                "rate": escalated_rate,
                "hours": hours,
                "amount": amount
            }

        # Calculate total cost across all years
        total_cost = sum(
            year_data["amount"]
            for year_data in results.values()
            if isinstance(year_data, dict)
        )

        return {
            "labor_category": labor_category,
            **results,
            "total_cost": round(total_cost, 2)
        }

    @staticmethod
    def calculate_odc_years(
        odc_data: Dict[str, Any],
        ga_adder_rate: float,
        escalation_rates: Dict[str, float],
        total_years: int,
        apply_adder: bool = True,
        escalate: bool = False
    ) -> Dict[str, Any]:
        """
        Calculate ODC (Other Direct Costs) for all years with optional G&A adder.

        ODCs include travel, materials, equipment, etc.
        G&A adder covers administrative overhead for processing these costs.

        ODCs can be either fixed (same amount all years) or escalating (increases with inflation).

        Args:
            odc_data: Dict with:
                - category: str (e.g., "Travel", "Materials")
                - description: str (optional)
                - amount_year_1: float (base amount for Year 1)
            ga_adder_rate: G&A rate for ODCs (e.g., 0.2212 for 22.12%)
            escalation_rates: Dict like {"1_to_2": 0.0272, "2_to_3": 0.0299, ...}
            total_years: Number of years
            apply_adder: Whether to apply G&A adder (default True)
            escalate: Whether to escalate ODC year-over-year (default False - most ODCs stay fixed)

        Returns:
            Dict with:
                - category: str
                - year_1, year_2, ... year_N: Each with {base, ga_adder, total}
                - total_cost: float (sum of all years)

        Example (Fixed ODC - Travel):
            >>> odc = {
            ...     "category": "Travel",
            ...     "amount_year_1": 5000
            ... }
            >>> Calculator.calculate_odc_years(
            ...     odc, 0.2212, {"1_to_2": 0.03}, 2, True, escalate=False
            ... )
            {
                'category': 'Travel',
                'year_1': {'base': 5000, 'ga_adder': 1106, 'total': 6106},
                'year_2': {'base': 5000, 'ga_adder': 1106, 'total': 6106},
                'total_cost': 12212
            }

        Example (Escalating ODC - Equipment):
            >>> odc = {
            ...     "category": "Equipment",
            ...     "amount_year_1": 5000
            ... }
            >>> Calculator.calculate_odc_years(
            ...     odc, 0.2212, {"1_to_2": 0.03}, 2, True, escalate=True
            ... )
            {
                'category': 'Equipment',
                'year_1': {'base': 5000, 'ga_adder': 1106, 'total': 6106},
                'year_2': {'base': 5150, 'ga_adder': 1139, 'total': 6289},
                'total_cost': 12395
            }
        """
        results = {}
        category = odc_data["category"]
        base_amount = float(odc_data["amount_year_1"])

        # Calculate amounts for each year based on escalate flag
        if escalate:
            # Escalating ODC - apply escalation rates year-over-year
            amounts_per_year = [base_amount]
            current = base_amount
            for year in range(2, total_years + 1):
                key = f"{year-1}_to_{year}"
                esc_rate = escalation_rates.get(key, 0.0)
                current = current * (1 + esc_rate)
                amounts_per_year.append(round(current, 2))
        else:
            # Fixed ODC - same amount for all years
            amounts_per_year = [base_amount] * total_years

        # Build results for each year with G&A adder
        for year in range(1, total_years + 1):
            year_amount = amounts_per_year[year - 1]

            # Calculate G&A adder if applicable
            if apply_adder:
                ga_adder = round(year_amount * ga_adder_rate, 2)
            else:
                ga_adder = 0.0

            total = round(year_amount + ga_adder, 2)

            results[f"year_{year}"] = {
                "base": year_amount,
                "ga_adder": ga_adder,
                "total": total
            }

        # Calculate total cost across all years
        total_cost = sum(
            year_data["total"]
            for year_data in results.values()
            if isinstance(year_data, dict)
        )

        return {
            "category": category,
            **results,
            "total_cost": round(total_cost, 2)
        }

    @staticmethod
    def calculate_fee_on_labor(
        prime_labor_total: float,
        sub_labor_total: float,
        prime_fee_rate: float,
        sub_fee_rate: float
    ) -> Dict[str, float]:
        """
        Calculate profit fee on total labor costs.

        Fee is applied to TOTAL labor cost (after all wrap rates).
        Different rates for prime contractor vs subcontractor labor
        per government regulations.

        Args:
            prime_labor_total: Total cost of prime contractor labor
            sub_labor_total: Total cost of subcontractor labor
            prime_fee_rate: Fee rate for prime labor (e.g., 0.08 for 8%)
            sub_fee_rate: Fee rate for sub labor (e.g., 0.0126 for 1.26%)

        Returns:
            Dict with:
                - prime_fee: Fee on prime labor (your profit)
                - sub_fee: Fee on sub labor (your profit)
                - total_fee: Combined fee

        Example:
            >>> Calculator.calculate_fee_on_labor(500000, 300000, 0.08, 0.0126)
            {
                'prime_fee': 40000.0,
                'sub_fee': 3780.0,
                'total_fee': 43780.0
            }
        """
        prime_fee = round(prime_labor_total * prime_fee_rate, 2)
        sub_fee = round(sub_labor_total * sub_fee_rate, 2)
        total_fee = round(prime_fee + sub_fee, 2)

        return {
            "prime_fee": prime_fee,
            "sub_fee": sub_fee,
            "total_fee": total_fee
        }

    @staticmethod
    def calculate_subcontractor_markup(
        sub_base_rate: float,
        fee_rate: float,
        smh_rate: float,
        has_max_passthrough_cap: bool = False,
        max_passthrough_rate: float = None
    ) -> Dict[str, float]:
        """
        Apply prime contractor markup to subcontractor's FBLR.

        Subcontractors provide their own FBLR. Prime contractor adds:
        1. Fee (profit for bringing them in)
        2. S&MH (Subcontractor & Material Handling - cost to manage them)

        S&MH applies to (base + fee), not just base (cascading).

        For contracts with max pass-through cap (e.g., SeaPort-NxG at 8%):
        Fee is calculated as: max_passthrough_rate - smh_rate

        Args:
            sub_base_rate: Subcontractor's FBLR ($/hr)
            fee_rate: Prime fee rate (e.g., 0.10 for 10%)
            smh_rate: S&MH rate (e.g., 0.0665 for 6.65%)
            has_max_passthrough_cap: If True, contract has max pass-through requirement
            max_passthrough_rate: Max total markup rate (e.g., 0.08 for 8%)

        Returns:
            Dict with:
                - sub_base_rate: Original rate
                - fee: Fee amount added
                - smh: S&MH amount added
                - final_rate: Billable rate to government
                - applied_fee_rate: Actual fee rate used (for transparency)

        Example (Normal contract):
            >>> Calculator.calculate_subcontractor_markup(140.0, 0.10, 0.0665)
            {
                'sub_base_rate': 140.0,
                'fee': 14.0,
                'smh': 10.24,
                'final_rate': 164.24,
                'applied_fee_rate': 0.10
            }

        Example (SeaPort-NxG with 8% cap):
            >>> Calculator.calculate_subcontractor_markup(
            ...     140.0, 0.10, 0.0665,
            ...     has_max_passthrough_cap=True,
            ...     max_passthrough_rate=0.08
            ... )
            {
                'sub_base_rate': 140.0,
                'fee': 1.89,  # (8% - 6.65%) = 1.35% of 140
                'smh': 9.43,
                'final_rate': 151.32,
                'applied_fee_rate': 0.0135
            }
        """
        # Determine fee rate based on cap requirement
        if has_max_passthrough_cap and max_passthrough_rate is not None:
            # Contract has cap (e.g., SeaPort-NxG) - calculate fee from cap
            applied_fee_rate = max_passthrough_rate - smh_rate

            if applied_fee_rate < 0:
                raise ValueError(
                    f"Max pass-through rate ({max_passthrough_rate*100:.2f}%) is lower than "
                    f"S&MH rate ({smh_rate*100:.2f}%). Cannot meet cap requirement. "
                    f"Resulting fee would be {applied_fee_rate*100:.2f}%."
                )
        else:
            # Normal contract - use provided fee_rate
            applied_fee_rate = fee_rate

        # Step 1: Add fee to subcontractor's rate
        fee = round(sub_base_rate * applied_fee_rate, 2)
        with_fee = round(sub_base_rate + fee, 2)

        # Step 2: Add S&MH to the subtotal (cascading)
        smh = round(with_fee * smh_rate, 2)
        final_rate = round(with_fee + smh, 2)

        return {
            "sub_base_rate": sub_base_rate,
            "fee": fee,
            "smh": smh,
            "final_rate": final_rate,
            "applied_fee_rate": applied_fee_rate
        }

    @staticmethod
    def select_wage_percentile_by_experience(experience_years: int) -> str:
        """
        Automatically select wage percentile based on years of experience.

        Uses industry-standard rules:
        - Junior level (< 3 years) → 25th percentile
        - Mid level (3-5 years) → 50th percentile (median)
        - Senior level (> 5 years) → 75th percentile

        Frontend can override this selection via dropdown.

        Args:
            experience_years: Years of professional experience required

        Returns:
            Percentile string: "25th", "50th", or "75th"

        Example:
            >>> Calculator.select_wage_percentile_by_experience(2)
            "25th"
            >>> Calculator.select_wage_percentile_by_experience(4)
            "50th"
            >>> Calculator.select_wage_percentile_by_experience(8)
            "75th"
        """
        if experience_years < 3:
            return "25th"
        elif 3 <= experience_years <= 5:
            return "50th"
        else:  # > 5 years
            return "75th"

    @staticmethod
    def get_wage_for_percentile(wages_dict: Dict[str, float], percentile: str) -> float:
        """
        Extract wage value for a given percentile from BLS wage data.

        Args:
            wages_dict: Dictionary with all percentile wages, e.g.:
                {
                    "10th": 95000,
                    "25th": 135000,
                    "50th": 169000,
                    "75th": 210000,
                    "90th": 265000
                }
            percentile: Percentile key to extract (e.g., "25th", "50th", "75th")

        Returns:
            Wage value for that percentile

        Raises:
            KeyError: If percentile not found in wages_dict

        Example:
            >>> wages = {"25th": 135000, "50th": 169000, "75th": 210000}
            >>> Calculator.get_wage_for_percentile(wages, "50th")
            169000
        """
        if percentile not in wages_dict:
            raise KeyError(
                f"Percentile '{percentile}' not found in wages data. "
                f"Available percentiles: {list(wages_dict.keys())}"
            )
        return float(wages_dict[percentile])

    @staticmethod
    def calculate_averaged_fblr(
        base_wage: float,
        hours_per_year: Dict[str, float],
        escalation_rates: Dict[str, float],
        fringe_rate: float,
        oh_rate: float,
        ga_rate: float,
        fee_rate: float,
        standard_fte_hours: float = 1880,
        total_years: int = 1
    ) -> Dict[str, float]:
        """
        Calculate averaged FBLR using proportional hourly rates with FTE hours.

        Formula:
        - For each year: (escalated_wage / fte_hours) * actual_hours_worked
        - Sum earned salaries and hours
        - Average DL Rate = Total Salary / Total Hours
        - Apply FBLR cascade

        Args:
            base_wage: Base annual wage (Year 1)
            hours_per_year: Dict of actual hours worked per year (e.g., {"1": 1880, "2": 50})
            escalation_rates: Year-over-year escalation rates (e.g., {"1_to_2": 0.0272})
            fringe_rate: Fringe benefits rate (e.g., 0.247 for 24.7%)
            oh_rate: Overhead rate (e.g., 0.0711 for 7.11%)
            ga_rate: G&A rate (e.g., 0.2243 for 22.43%)
            fee_rate: Fee/profit rate (e.g., 0.07 for 7%)
            standard_fte_hours: Full-time equivalent hours (default 1880)
            total_years: Total contract years

        Returns:
            Dict with keys: dl_rate, fringe, oh, ga, fee, fblr

        Example:
            >>> Calculator.calculate_averaged_fblr(
            ...     base_wage=112590,
            ...     hours_per_year={"1": 1880, "2": 50, "3": 0, "4": 0, "5": 0},
            ...     escalation_rates={"1_to_2": 0.0272},
            ...     fringe_rate=0.247,
            ...     oh_rate=0.0711,
            ...     ga_rate=0.2243,
            ...     fee_rate=0.07,
            ...     standard_fte_hours=1880,
            ...     total_years=5
            ... )
            {'dl_rate': 59.93, 'fringe': 14.80, ...}
        """
        if base_wage == 0 or total_years == 0:
            return {
                'dl_rate': 0,
                'fringe': 0,
                'oh': 0,
                'ga': 0,
                'fee': 0,
                'fblr': 0
            }

        total_salary = 0
        total_hours = 0
        current_year_wage = base_wage

        for year in range(1, total_years + 1):
            year_str = str(year)
            hours_this_year = hours_per_year.get(year_str, 0)

            # Calculate proportional salary for this year
            if hours_this_year > 0:
                hourly_rate_this_year = current_year_wage / standard_fte_hours
                salary_earned_this_year = hourly_rate_this_year * hours_this_year

                total_salary += salary_earned_this_year
                total_hours += hours_this_year

            # Apply escalation for next year
            if year < total_years:
                escalation_key = f"{year}_to_{year + 1}"
                escalation_rate = escalation_rates.get(escalation_key, 0)
                current_year_wage = current_year_wage * (1 + escalation_rate)

        if total_hours == 0:
            return {
                'dl_rate': 0,
                'fringe': 0,
                'oh': 0,
                'ga': 0,
                'fee': 0,
                'fblr': 0
            }

        # Calculate averaged DL rate
        dl_rate = total_salary / total_hours

        # Apply FBLR cascade
        fringe = dl_rate * fringe_rate
        oh = (dl_rate + fringe) * oh_rate
        ga = (dl_rate + fringe + oh) * ga_rate
        fee = (dl_rate + fringe + oh + ga) * fee_rate
        fblr = dl_rate + fringe + oh + ga + fee

        return {
            'dl_rate': dl_rate,
            'fringe': fringe,
            'oh': oh,
            'ga': ga,
            'fee': fee,
            'fblr': fblr
        }
