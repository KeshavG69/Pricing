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
    organization_id: Optional[str] = None
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

    # Default to BLS
    if wage_source is None:
        wage_source = {"type": "bls"}

    is_gsa = wage_source.get("type") == "gsa"
    source_label = "GSA" if is_gsa else "BLS"

    print(f"  [{row_index}] Processing ({source_label}): {labor_category}")

    try:
        if is_gsa:
            # GSA flow - use GSA agent with Pinecone search
            file_id = wage_source.get("file_id")
            agent = await create_gsa_pricing_agent(
                labor_category=labor_category,
                description=description,
                organization_id=organization_id,
                file_id=file_id
            )
            prompt = f"Find GSA labor category and rate for: {labor_category}"
        else:
            # BLS flow - use standard pricing agent
            agent = await create_pricing_agent(
                labor_category=labor_category,
                description=description,
                location=location
            )
            prompt = f"Find wage data for {labor_category} in {location}"

        result = await agent.arun(prompt)

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

                    return {
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


async def process_dataframe_with_agents(
    df: pd.DataFrame,
    max_workers: int = 10,
    wage_source: Optional[Dict[str, Any]] = None,
    organization_id: Optional[str] = None
) -> pd.DataFrame:
    """
    Process DataFrame with pricing agents in parallel and add wage columns.

    Args:
        df: Input DataFrame with JD data (labor_category, description, experience, location, hours)
        max_workers: Number of parallel agents (default: 10)
        wage_source: {"type": "bls"} or {"type": "gsa", "file_id": "..."}
        organization_id: Organization ID (required for GSA)

    Returns:
        DataFrame with added wage columns
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
            return await process_single_row(row, index, wage_source, organization_id)

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

        position = {
            'name': row.get('name', project_config.get('prime_contractor_name', 'TBD')),  # Use prime contractor name
            'labor_category': row['labor_category'],
            'ecraft_code': row.get('BLS Labour Category Mapping', row.get('ecraft_code', row.get('soc_title', 'TBD'))),  # Use BLS labor category or soc_title
            'bls_code': row.get('BLS Code', row.get('soc_code', '')),  # Add BLS Code or soc_code
            'base_annual_wage': row.get('selected_wage', row.get('wage_50th', 100000)),  # Use selected wage
            'hours_per_year': hours_per_year,
            'standard_fte_hours': row.get('standard_fte_hours', 1880),
            'percentile': row.get('percentile', '50th'),
            'wage_10th': row.get('wage_10th', 0),
            'wage_25th': row.get('wage_25th', 0),
            'wage_50th': row.get('wage_50th', 0),
            'wage_75th': row.get('wage_75th', 0),
            'wage_90th': row.get('wage_90th', 0),
        }

        # Check if position has subcontractor hours assigned
        sub_hours = row.get('subcontractor_hours', 0)
        total_hours = row.get('hours', sum(hours_per_year.values()))

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
                    year: int(hrs * ratio) for year, hrs in hours_per_year.items()
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
                    year: int(hrs * ratio) for year, hrs in hours_per_year.items()
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
        'ga_adder_rate': project_config['ga_adder_rate']
    }

    return project_data
