"""
Pipeline functions for document processing and pricing.
"""

import asyncio
from typing import Dict, Any, Optional
import pandas as pd
import json

from agent.agent import create_pricing_agent, create_gsa_pricing_agent


async def process_single_row(
    row_dict: Dict[str, Any],
    row_index: int,
    wage_source: Optional[Dict[str, Any]] = None,
    organization_id: Optional[str] = None,
    organization_rates: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Process a single JD row with the pricing agent (BLS or GSA).

    Args:
        row_dict: Dictionary with keys: labor_category, description, experience, location, hours
        row_index: Row number (for logging)
        wage_source: {"type": "bls"} or {"type": "gsa", "file_id": "..."}
        organization_id: Organization ID (required for GSA)

    Returns:
        Dictionary with original fields plus wage data
    """
    labor_category = row_dict.get("labor_category", "")
    description = row_dict.get("description")
    location = row_dict.get("location") or "National"
    soc_code = row_dict.get("soc_code")  # Extract SOC code from document (if provided)

    # Default to BLS
    if wage_source is None:
        wage_source = {"type": "bls"}

    is_gsa = wage_source.get("type") == "gsa"
    source_label = "GSA" if is_gsa else "BLS"

    # Log SOC code if provided
    if soc_code and not is_gsa:
        print(f"  [{row_index}] Processing ({source_label}): {labor_category} [SOC: {soc_code} from document]")
    else:
        print(f"  [{row_index}] Processing ({source_label}): {labor_category}")

    try:
        if is_gsa:
            # GSA flow - use GSA agent with Pinecone search
            file_id = wage_source.get("file_id")
            gsa_agent = await create_gsa_pricing_agent(
                labor_category=labor_category,
                description=description,
                organization_id=organization_id,
                file_id=file_id,
                soc_code=soc_code
            )
            gsa_prompt = f"Find GSA labor category and rate for: {labor_category}"

            # If organization rates provided, also run BLS agent in parallel for discount comparison
            if organization_rates:
                print(f"  [{row_index}] 🔍 Running GSA + BLS agents in parallel for discount comparison...")
                bls_agent = await create_pricing_agent(
                    labor_category=labor_category,
                    description=description,
                    location=location or "National",
                    soc_code=soc_code
                )
                # Build prompt with description for better context
                bls_prompt = f"Find wage data for {labor_category}"
                if description:
                    bls_prompt += f". Job description: {description}"

                # Run both agents in parallel
                gsa_result, bls_result = await asyncio.gather(
                    gsa_agent.arun(gsa_prompt),
                    bls_agent.arun(bls_prompt),
                    return_exceptions=True
                )
            else:
                # Only run GSA agent
                gsa_result = await gsa_agent.arun(gsa_prompt)
                bls_result = None

            result = gsa_result  # For compatibility with existing code
        else:
            # BLS flow - use standard pricing agent
            agent = await create_pricing_agent(
                labor_category=labor_category,
                description=description,
                location=location,
                soc_code=soc_code
            )
            # Build prompt with description for better context
            prompt = f"Find wage data for {labor_category} in {location}"
            if description:
                prompt += f". Job description: {description}"
            result = await agent.arun(prompt)
            bls_result = None  # Not used in BLS flow

        # Extract data from agent response
        if result and hasattr(result, 'content'):
            data = result.content

            # Parse string to dict if needed (agno returns tool output as string)
            if isinstance(data, str):
                try:
                    data = json.loads(data.replace("'", '"'))
                except json.JSONDecodeError:
                    data = eval(data)

            if isinstance(data, dict):
                if is_gsa:
                    # GSA response: {lcat_id, title, rates_by_year, current_gsa_year, ...}
                    rates_by_year = data.get("rates_by_year", {})
                    current_gsa_year = data.get("current_gsa_year", 1)

                    # Get year 1 rate for display
                    year1_rate = rates_by_year.get(str(current_gsa_year)) or rates_by_year.get("1")
                    print(f"  [{row_index}] ✓ Found GSA: {data.get('lcat_id')} - {data.get('title')} (Year {current_gsa_year} rate: ${year1_rate}/hr)")

                    if data.get("error"):
                        print(f"  [{row_index}] ⚠️ GSA Error: {data.get('error')}")

                    # NEW: Also fetch BLS data for discount comparison (if org rates provided)
                    gsa_result = {
                        **row_dict,
                        "wage_source": "gsa",
                        "gsa_lcat_id": data.get("lcat_id"),
                        "gsa_title": data.get("title"),
                        "gsa_sin": data.get("sin"),
                        "gsa_education": data.get("education"),
                        "gsa_experience": data.get("experience"),
                        "gsa_rates_by_year": rates_by_year,
                        "gsa_current_year": current_gsa_year,
                        "selected_wage": year1_rate,  # For display, calculation service uses rates_by_year
                        "gsa_discount_rate": 0.0,  # Default, user can override
                        # No BLS fields for GSA
                        "BLS Code": None,
                        "BLS Labour Category Mapping": None,
                        "BLS Occupation Description": None,
                        "area": None,
                        "wage_10th": None,
                        "wage_25th": None,
                        "wage_50th": None,
                        "wage_75th": None,
                        "wage_90th": None,
                        "selected_percentile": None,
                    }

                    # Process BLS comparison data if available (from parallel execution)
                    if organization_rates and year1_rate and bls_result:
                        try:
                            # Check if BLS result is an exception
                            if isinstance(bls_result, Exception):
                                print(f"  [{row_index}] ⚠️ BLS agent failed: {bls_result}")
                            elif bls_result and hasattr(bls_result, 'content'):
                                print(f"  [{row_index}] ✓ Processing BLS comparison data...")
                                bls_data = bls_result.content

                                # Parse string to dict if needed
                                if isinstance(bls_data, str):
                                    try:
                                        bls_data = json.loads(bls_data.replace("'", '"'))
                                    except json.JSONDecodeError:
                                        bls_data = eval(bls_data)

                                if isinstance(bls_data, dict) and bls_data.get("wages"):
                                    # Calculate BLS FBLR using organization rates
                                    bls_fblr_data = calculate_bls_fblr_comparison(
                                        bls_wages=bls_data["wages"],
                                        experience=row_dict.get("experience"),
                                        organization_rates=organization_rates,
                                        standard_fte_hours=row_dict.get("standard_fte_hours", 1880),
                                        location_type=row_dict.get("location_type", "On-Site")
                                    )

                                    if bls_fblr_data:
                                        # Compare GSA rate vs BLS FBLR and suggest discount
                                        discount_analysis = calculate_suggested_discount(
                                            gsa_rate=year1_rate,
                                            bls_fblr=bls_fblr_data["fblr"],
                                            bls_selected_wage=bls_fblr_data["selected_wage"]
                                        )

                                        print(f"  [{row_index}] 💰 GSA: ${year1_rate:.2f}/hr vs BLS FBLR: ${bls_fblr_data['fblr']:.2f}/hr → Suggested discount: {discount_analysis['suggested_discount_rate']*100:.1f}%")

                                        # Add comparison data to GSA response
                                        gsa_result.update({
                                            "bls_comparison_fblr": bls_fblr_data["fblr"],
                                            "bls_comparison_soc_code": bls_data.get("soc_code"),
                                            "bls_comparison_wage": bls_fblr_data["selected_wage"],
                                            "bls_comparison_percentile": bls_fblr_data["selected_percentile"],
                                            "suggested_discount_rate": discount_analysis["suggested_discount_rate"],
                                            "discount_rationale": discount_analysis["rationale"],
                                        })

                        except Exception as e:
                            print(f"  [{row_index}] ⚠️ BLS comparison processing failed: {e}")
                            # Continue without comparison data

                    return gsa_result
                else:
                    # BLS response: {soc_code, occupation_name, area, wages: {...}}
                    wages = data.get("wages", {})
                    print(f"  [{row_index}] ✓ Found BLS: {data.get('soc_code')} - {data.get('occupation_name')}")

                    # Determine selected wage based on experience
                    experience = row_dict.get("experience")
                    selected_wage = None
                    selected_percentile = None

                    if experience is not None and isinstance(experience, (int, float)):
                        if experience < 3:
                            selected_wage = wages.get("25th")
                            selected_percentile = "25th"
                        elif 3 <= experience < 6:
                            selected_wage = wages.get("50th")
                            selected_percentile = "50th"
                        else:
                            selected_wage = wages.get("75th")
                            selected_percentile = "75th"
                    else:
                        selected_wage = wages.get("50th")
                        selected_percentile = "50th (default)"

                    print(f"  [{row_index}] 💰 Selected: ${selected_wage} ({selected_percentile})")

                    return {
                        **row_dict,
                        "wage_source": "bls",
                        "BLS Code": data.get("soc_code"),
                        "BLS Labour Category Mapping": data.get("occupation_name"),
                        "BLS Occupation Description": data.get("bls_occupation_description"),
                        "area": data.get("area"),
                        "wage_10th": wages.get("10th"),
                        "wage_25th": wages.get("25th"),
                        "wage_50th": wages.get("50th"),
                        "wage_75th": wages.get("75th"),
                        "wage_90th": wages.get("90th"),
                        "selected_wage": selected_wage,
                        "selected_percentile": selected_percentile,
                    }

        # If no valid result, return original data with None values
        print(f"  [{row_index}] ⚠️  No data found for {labor_category}")
        return {
            **row_dict,
            "wage_source": wage_source.get("type"),
            "BLS Code": None,
            "BLS Labour Category Mapping": None,
            "BLS Occupation Description": None,
            "area": None,
            "wage_10th": None,
            "wage_25th": None,
            "wage_50th": None,
            "wage_75th": None,
            "wage_90th": None,
            "selected_wage": None,
            "selected_percentile": None,
        }

    except Exception as e:
        print(f"  [{row_index}] ❌ Error processing {labor_category}: {e}")
        return {
            **row_dict,
            "wage_source": wage_source.get("type") if wage_source else "bls",
            "BLS Code": None,
            "BLS Labour Category Mapping": None,
            "BLS Occupation Description": None,
            "area": None,
            "wage_10th": None,
            "wage_25th": None,
            "wage_50th": None,
            "wage_75th": None,
            "wage_90th": None,
            "selected_wage": None,
            "selected_percentile": None,
        }


def calculate_bls_fblr_comparison(
    bls_wages: Dict[str, float],
    experience: Optional[float],
    organization_rates: Dict[str, float],
    standard_fte_hours: int = 1880,
    location_type: str = "On-Site"
) -> Optional[Dict[str, Any]]:
    """
    Calculate BLS FBLR for comparison with GSA rates.

    Uses the same logic as BLS flow to select wage based on experience,
    then calculates FBLR using organization's indirect rates (including fee).

    Args:
        bls_wages: BLS wage data {"10th": ..., "25th": ..., "50th": ..., "75th": ..., "90th": ...}
        experience: Years of experience (determines percentile selection)
        organization_rates: {"fringe": 0.247, "oh_onsite": 0.0711, "oh_offsite": 0.0711, "ga": 0.2243, "fee": 0.07}
        standard_fte_hours: FTE hours for hourly rate calculation (default 1880)
        location_type: Position location type ("On-Site" or "Off-Site", default "On-Site")

    Returns:
        {
            "selected_wage": 115000,
            "selected_percentile": "50th",
            "fblr": 107.03,  # Hourly FBLR rate (includes fee)
            "dl_rate": 61.17,
            "components": {
                "fringe": 15.11,
                "oh": 5.42,
                "ga": 18.33,
                "fee": 7.00
            }
        }
        Returns None if no valid wage found.
    """
    from client.calculation_service import Calculator

    # Determine selected wage based on experience (same logic as BLS flow)
    selected_wage = None
    selected_percentile = None

    if experience is not None and isinstance(experience, (int, float)):
        if experience < 3:
            selected_wage = bls_wages.get("25th")
            selected_percentile = "25th"
        elif 3 <= experience < 6:
            selected_wage = bls_wages.get("50th")
            selected_percentile = "50th"
        else:
            selected_wage = bls_wages.get("75th")
            selected_percentile = "75th"
    else:
        selected_wage = bls_wages.get("50th")
        selected_percentile = "50th"

    if not selected_wage or selected_wage <= 0:
        return None

    # Calculate FBLR using calculate_averaged_fblr (includes fee!)
    # Use appropriate OH rate based on location_type (fallback to old 'oh' field if present)
    oh_onsite = organization_rates.get("oh_onsite", organization_rates.get("oh", 0.0711))
    oh_offsite = organization_rates.get("oh_offsite", organization_rates.get("oh", 0.0711))

    fblr_data = Calculator.calculate_averaged_fblr(
        base_wage=selected_wage,
        hours_per_year={"1": standard_fte_hours},  # Single year
        escalation_rates={},  # No escalation
        fringe_rate=organization_rates.get("fringe", 0.247),
        oh_onsite_rate=oh_onsite,
        oh_offsite_rate=oh_offsite,
        location_type=location_type,  # Use actual location_type from job data
        ga_rate=organization_rates.get("ga", 0.2243),
        fee_rate=organization_rates.get("fee", 0.07),
        standard_fte_hours=standard_fte_hours,
        total_years=1  # Single year
    )

    return {
        "selected_wage": selected_wage,
        "selected_percentile": selected_percentile,
        "fblr": fblr_data["fblr"],  # Already includes fee
        "dl_rate": fblr_data["dl_rate"],
        "components": {
            "fringe": fblr_data["fringe"],
            "oh": fblr_data["oh"],
            "ga": fblr_data["ga"],
            "fee": fblr_data["fee"]
        }
    }


def calculate_suggested_discount(
    gsa_rate: float,
    bls_fblr: float,
    bls_selected_wage: float
) -> Dict[str, Any]:
    """
    Calculate suggested discount based on GSA vs BLS comparison.

    Strategy:
    - If GSA > BLS FBLR: Suggest discount to match BLS exactly
    - If GSA <= BLS FBLR: No discount needed (already competitive)
    - Cap maximum suggested discount at 20%

    Args:
        gsa_rate: GSA hourly rate ($/hr)
        bls_fblr: BLS FBLR hourly rate ($/hr, includes fee)
        bls_selected_wage: BLS annual wage used for comparison

    Returns:
        {
            "suggested_discount_rate": 0.187,  # 18.7% discount
            "rationale": "GSA rate ($131.68/hr) is 18.7% higher than BLS FBLR ($107.03/hr)...",
            "gsa_rate_original": 131.68,
            "bls_fblr": 107.03,
            "rate_after_discount": 107.03
        }
    """
    if not gsa_rate or not bls_fblr or gsa_rate <= 0 or bls_fblr <= 0:
        return {
            "suggested_discount_rate": 0.0,
            "rationale": "Insufficient data for comparison",
            "gsa_rate_original": gsa_rate,
            "bls_fblr": bls_fblr,
            "rate_after_discount": gsa_rate
        }

    # Calculate percentage difference
    diff_pct = (gsa_rate - bls_fblr) / gsa_rate

    if diff_pct <= 0:
        # GSA is already equal or lower than BLS
        return {
            "suggested_discount_rate": 0.0,
            "rationale": f"GSA rate (${gsa_rate:.2f}/hr) is already competitive vs BLS FBLR (${bls_fblr:.2f}/hr). No discount needed.",
            "gsa_rate_original": gsa_rate,
            "bls_fblr": bls_fblr,
            "rate_after_discount": gsa_rate
        }

    # GSA is higher - suggest discount to match BLS exactly
    suggested_discount = (gsa_rate - bls_fblr) / gsa_rate

    # Cap discount at 20%
    if suggested_discount > 0.20:
        suggested_discount = 0.20
        rate_after_discount = gsa_rate * (1 - suggested_discount)
        rationale = (
            f"GSA rate (${gsa_rate:.2f}/hr) is {diff_pct*100:.1f}% higher than BLS FBLR (${bls_fblr:.2f}/hr). "
            f"Suggested discount capped at 20% → Final rate: ${rate_after_discount:.2f}/hr "
            f"(Note: BLS rate is ${bls_fblr:.2f}/hr)"
        )
    else:
        rate_after_discount = bls_fblr  # Match BLS exactly
        rationale = (
            f"GSA rate (${gsa_rate:.2f}/hr) is {diff_pct*100:.1f}% higher than BLS FBLR (${bls_fblr:.2f}/hr). "
            f"Suggested discount: {suggested_discount*100:.1f}% to match BLS rate exactly"
        )

    return {
        "suggested_discount_rate": round(suggested_discount, 4),
        "rationale": rationale,
        "gsa_rate_original": gsa_rate,
        "bls_fblr": bls_fblr,
        "rate_after_discount": round(rate_after_discount, 2)
    }


async def process_dataframe_with_agents(
    df: pd.DataFrame,
    max_workers: int = 10,
    wage_source: Optional[Dict[str, Any]] = None,
    organization_id: Optional[str] = None,
    organization_rates: Optional[Dict[str, float]] = None
) -> pd.DataFrame:
    """
    Process DataFrame with pricing agents in parallel and add wage columns.

    Args:
        df: Input DataFrame with JD data (labor_category, description, experience, location, hours)
        max_workers: Number of parallel agents (default: 10)
        wage_source: {"type": "bls"} or {"type": "gsa", "file_id": "..."}
        organization_id: Organization ID (required for GSA)
        organization_rates: Organization's indirect rates for BLS comparison (GSA mode only)

    Returns:
        DataFrame with added wage columns (includes discount suggestions for GSA)
    """
    source_type = wage_source.get("type", "bls") if wage_source else "bls"
    print(f"\n{'='*60}")
    print(f"Processing {len(df)} job descriptions")
    print(f"Wage source: {source_type.upper()}")
    print(f"Parallel workers: {max_workers}")
    print(f"{'='*60}\n")

    if len(df) == 0:
        print("⚠️  No data to process")
        return df

    # Convert DataFrame rows to list of dicts
    rows = df.to_dict('records')

    # Process rows in parallel with semaphore to limit concurrency
    print(f"Starting parallel processing with {max_workers} workers...\n")

    # Use asyncio.Semaphore to limit concurrent executions
    semaphore = asyncio.Semaphore(max_workers)

    async def bounded_process(row, index):
        """Process a single row with semaphore to limit concurrency."""
        async with semaphore:
            return await process_single_row(row, index, wage_source, organization_id, organization_rates)

    # Create all tasks and run them in parallel (limited by semaphore)
    tasks = [bounded_process(row, i + 1) for i, row in enumerate(rows)]
    results = await asyncio.gather(*tasks)

    print(f"\n{'='*60}")
    print(f"✓ Processed {len(results)} rows")
    print(f"{'='*60}\n")

    # Create output DataFrame with wage columns
    output_df = pd.DataFrame(results)

    return output_df


def build_project_data_from_dataframe(
    df: pd.DataFrame,
    project_config: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Build project data structure from DataFrame for Excel generation.

    Args:
        df: DataFrame with positions and wage data
        project_config: Configuration with solicitation info, rates, etc.

    Returns:
        Complete project data dict for ExcelGenerator
    """
    import ast
    from client.calculation_service import Calculator

    # Extract prime positions and split subcontractor positions from DataFrame
    prime_positions = []
    subcontractor_positions = []

    for _, row in df.iterrows():
        # Parse hours_per_year from DataFrame
        # It may be a string representation of a dict that needs to be parsed
        hours_per_year = {}

        if 'hours_per_year' in row and pd.notna(row['hours_per_year']):
            hours_data = row['hours_per_year']

            # If it's a string representation of a dict, parse it
            if isinstance(hours_data, str):
                try:
                    hours_per_year = ast.literal_eval(hours_data)
                except (ValueError, SyntaxError):
                    # If parsing fails, use single hours value for all years
                    single_hours = row.get('hours', 1880)
                    for year in range(1, project_config['total_years'] + 1):
                        hours_per_year[str(year)] = single_hours
            elif isinstance(hours_data, dict):
                # Already a dict
                hours_per_year = hours_data
            else:
                # Use single hours value for all years
                single_hours = row.get('hours', 1880)
                for year in range(1, project_config['total_years'] + 1):
                    hours_per_year[str(year)] = single_hours
        else:
            # Default: use hours column or 1880 for all years
            single_hours = row.get('hours', 1880)
            for year in range(1, project_config['total_years'] + 1):
                hours_per_year[str(year)] = single_hours

        # Ensure we have hours for all years in project_config
        for year in range(1, project_config['total_years'] + 1):
            if str(year) not in hours_per_year:
                # Use last available year's hours or default to 1880
                hours_per_year[str(year)] = hours_per_year.get(str(year-1), 1880)
            elif hours_per_year[str(year)] is None:
                # If hours is None (e.g., from deleted subcontractor assignment), use default
                # NOTE: We keep 0 hours as-is (user may have intentionally set it to 0)
                hours_per_year[str(year)] = 1920  # Default FTE hours

        # Parse gsa_rates_by_year if it's a string
        gsa_rates_by_year = {}
        if 'gsa_rates_by_year' in row and pd.notna(row['gsa_rates_by_year']):
            rates_data = row['gsa_rates_by_year']
            if isinstance(rates_data, str):
                try:
                    gsa_rates_by_year = ast.literal_eval(rates_data)
                except (ValueError, SyntaxError):
                    gsa_rates_by_year = {}
            elif isinstance(rates_data, dict):
                gsa_rates_by_year = rates_data

        # Determine base annual wage with priority (matching frontend's getEffectiveSalary):
        # 1. selected_salaries (user's manual edits, averaged)
        # 2. custom_salary (legacy)
        # 3. selected_wage (system selection)
        # 4. wage_50th (fallback)
        selected_salaries = row.get('selected_salaries', [])
        if selected_salaries and len(selected_salaries) > 0:
            # User manually edited - use average of selected salaries
            base_annual_wage = sum(selected_salaries) / len(selected_salaries)
        elif row.get('custom_salary'):
            # Legacy custom salary
            base_annual_wage = row.get('custom_salary')
        elif row.get('selected_wage'):
            # System selected wage
            base_annual_wage = row.get('selected_wage')
        else:
            # Fallback
            base_annual_wage = row.get('wage_50th', 100000)

        position = {
            'name': row.get('name', project_config.get('prime_contractor_name', 'TBD')),  # Use prime contractor name
            'labor_category': row['labor_category'],
            'ecraft_code': row.get('BLS Labour Category Mapping', row.get('ecraft_code', row.get('soc_title', 'TBD'))),  # Use BLS labor category or soc_title
            'bls_code': row.get('BLS Code', row.get('soc_code', '')),  # Add BLS Code or soc_code
            'base_annual_wage': base_annual_wage,  # Use prioritized wage (matches frontend getEffectiveSalary)
            'hours_per_year': hours_per_year,
            'standard_fte_hours': row.get('standard_fte_hours', 1880),
            'percentile': row.get('percentile', '50th'),
            'wage_10th': row.get('wage_10th', 0),
            'wage_25th': row.get('wage_25th', 0),
            'wage_50th': row.get('wage_50th', 0),
            'wage_75th': row.get('wage_75th', 0),
            'wage_90th': row.get('wage_90th', 0),
            'location': row.get('location', ''),
            'site': 'Government' if row.get('location_type') == 'On-Site' else 'Contractor',
            'location_type': row.get('location_type', 'On-Site'),
            # GSA-specific fields
            'wage_source': (row.get('wage_source') or 'bls').lower(),
            'gsa_lcat_id': row.get('gsa_lcat_id'),
            'gsa_title': row.get('gsa_title'),
            'gsa_rates_by_year': gsa_rates_by_year,  # Use parsed value
            'gsa_current_year': row.get('gsa_current_year'),
            'gsa_custom_rate': row.get('gsa_custom_rate'),
            'gsa_discount_rate': 0.0 if pd.isna(row.get('gsa_discount_rate')) else float(row.get('gsa_discount_rate')),
            'bls_analysis_row': row.get('bls_analysis_row'),
        }

        # Check if position has subcontractor hours assigned
        sub_hours = row.get('subcontractor_hours') or 0
        # Filter out None values before summing
        try:
            total_hours = row.get('hours') or sum(h for h in hours_per_year.values() if h is not None and h > 0)
            # If sum results in 0, skip this position (likely data issue)
            if total_hours == 0:
                print(f"⚠️  WARNING: Position '{row.get('labor_category')}' has 0 total hours, skipping")
                print(f"    hours_per_year: {hours_per_year}")
                print(f"    row.get('hours'): {row.get('hours')}")
                continue
        except Exception as e:
            print(f"❌ Error calculating total_hours for {row.get('labor_category')}: {e}")
            print(f"   hours_per_year values: {hours_per_year.values()}")
            print(f"   row.get('hours'): {row.get('hours')}")
            # Skip position on error instead of raising
            print(f"   Skipping this position due to error")
            continue

        if sub_hours == 0:
            # All prime labor
            prime_positions.append(position)
        elif sub_hours >= total_hours:
            # All subcontractor labor
            subcontractor_positions.append(position)
        else:
            # Split between prime and subcontractor
            # Create prime position with prime hours
            prime_position = position.copy()
            if 'prime_hours_per_year' in row and pd.notna(row['prime_hours_per_year']):
                prime_hours_data = row['prime_hours_per_year']
                if isinstance(prime_hours_data, str):
                    try:
                        prime_position['hours_per_year'] = ast.literal_eval(prime_hours_data)
                    except (ValueError, SyntaxError):
                        prime_position['hours_per_year'] = hours_per_year
                elif isinstance(prime_hours_data, dict):
                    prime_position['hours_per_year'] = prime_hours_data
            else:
                # Calculate prime hours proportionally if not provided
                ratio = (total_hours - sub_hours) / total_hours if total_hours > 0 else 1.0
                prime_position['hours_per_year'] = {
                    year: int((hrs or 0) * ratio) for year, hrs in hours_per_year.items()
                }
            prime_positions.append(prime_position)

            # Create subcontractor position with subcontractor hours
            sub_position = position.copy()
            if 'subcontractor_hours_per_year' in row and pd.notna(row['subcontractor_hours_per_year']):
                sub_hours_data = row['subcontractor_hours_per_year']
                if isinstance(sub_hours_data, str):
                    try:
                        sub_position['hours_per_year'] = ast.literal_eval(sub_hours_data)
                    except (ValueError, SyntaxError):
                        sub_position['hours_per_year'] = {}
                elif isinstance(sub_hours_data, dict):
                    sub_position['hours_per_year'] = sub_hours_data
            else:
                # Calculate subcontractor hours proportionally if not provided
                ratio = sub_hours / total_hours if total_hours > 0 else 0.0
                sub_position['hours_per_year'] = {
                    year: int((hrs or 0) * ratio) for year, hrs in hours_per_year.items()
                }
            subcontractor_positions.append(sub_position)

    # Build subcontractor structure from split positions
    # Combine with any pre-configured subcontractors
    subcontractors = project_config.get('subcontractors', [])

    # If we have split subcontractor positions, add them to subcontractors list
    if subcontractor_positions:
        # Create a default subcontractor entry for split positions
        # Group all split positions under one "Extracted Positions" subcontractor
        split_sub_labor_categories = []

        for sub_pos in subcontractor_positions:
            # Convert position to labor category format for subcontractor
            labor_cat = {
                'labor_category': sub_pos['labor_category'],
                'ecraft_code': sub_pos['ecraft_code'],
                'site': sub_pos.get('site', 'Government'),
            }

            # Add year rates from hours_per_year
            for year_num in range(1, project_config['total_years'] + 1):
                year_str = str(year_num)
                hours = sub_pos['hours_per_year'].get(year_str, 0)

                # Calculate rate for this year (using base wage with escalation)
                base_rate = Calculator.calculate_hourly_rate(
                    sub_pos['base_annual_wage'],
                    sub_pos.get('standard_fte_hours', 1880)
                )

                # Apply escalation
                escalated_rate = Calculator.calculate_year_rate(
                    base_rate,
                    project_config['escalation_rates'],
                    from_year=1,
                    to_year=year_num
                )

                labor_cat[f'year_{year_num}_rate'] = round(escalated_rate, 2)
                labor_cat[f'year_{year_num}_hours'] = hours

            split_sub_labor_categories.append(labor_cat)

        # Add split positions subcontractor
        if split_sub_labor_categories:
            subcontractors.append({
                'name': 'Subcontractor Labor (From Extracted Positions)',
                'labor_categories': split_sub_labor_categories
            })

    # Build complete project data
    project_data = {
        'solicitation_number': project_config['solicitation_number'],
        'prime_contractor_name': project_config['prime_contractor_name'],
        'subcontractor_names': project_config.get('subcontractor_names', []),
        'dcaa_contact': project_config.get('dcaa_contact', ''),
        'total_years': project_config['total_years'],
        'base_years': project_config['base_years'],
        'option_years': project_config['total_years'] - project_config['base_years'],
        'escalation_rates': project_config['escalation_rates'],
        'indirect_rates': project_config['indirect_rates'],
        'prime_positions': prime_positions,
        'subcontractors': subcontractors,
        'passthrough_rates': project_config['passthrough_rates'],
        'fee_rates': project_config['fee_rates'],
        'travel': project_config.get('travel', []),
        'odcs': project_config.get('odcs', []),
        'extensions': project_config.get('extensions', []),
        'surge': project_config.get('surge'),
        'surge_multiplier': project_config.get('surge_multiplier', 1.15),
    }

    return project_data
