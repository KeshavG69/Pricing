"""
Pipeline functions for document processing and pricing.
"""

import asyncio
from typing import Dict, Any
import pandas as pd
import json

from agent.agent import create_pricing_agent


async def process_single_row(row_dict: Dict[str, Any], row_index: int) -> Dict[str, Any]:
    """
    Process a single JD row with the pricing agent.

    Args:
        row_dict: Dictionary with keys: labor_category, description, experience, location, hours
        row_index: Row number (for logging)

    Returns:
        Dictionary with original fields plus: soc_code, occupation_name, area,
        wage_10th, wage_25th, wage_50th, wage_75th, wage_90th
    """
    labor_category = row_dict.get("labor_category", "")
    description = row_dict.get("description")
    location = row_dict.get("location")

    print(f"  [{row_index}] Processing: {labor_category} in {location}")

    try:
        # Create pricing agent with description for better SOC matching
        agent = await create_pricing_agent(
            labor_category=labor_category,
            description=description,
            location=location
        )

        # Run agent to get wage data (using async version)
        prompt = f"Find wage data for {labor_category} in {location}"
        result = await agent.arun(prompt)

        # Extract wage data from agent response
        # The wage_tool returns: {soc_code, occupation_name, area, wages: {10th, 25th, 50th, 75th, 90th}}
        if result and hasattr(result, 'content'):
            wage_data = result.content

            # Parse string to dict if needed (agno returns tool output as string)
            if isinstance(wage_data, str):
                try:
                    wage_data = json.loads(wage_data.replace("'", '"'))  # Convert single quotes to double quotes
                except json.JSONDecodeError:
                    # Fallback to eval if JSON parsing fails
                    wage_data = eval(wage_data)

            if isinstance(wage_data, dict):
                wages = wage_data.get("wages", {})
                print(f"  [{row_index}] ✓ Found: {wage_data.get('soc_code')} - {wage_data.get('occupation_name')}")

                return {
                    **row_dict,  # Original fields (includes parsed description from JD)
                    "BLS Code": wage_data.get("soc_code"),
                    "BLS Labour Category Mapping": wage_data.get("occupation_name"),
                    "BLS Occupation Description": wage_data.get("bls_occupation_description"),
                    "area": wage_data.get("area"),
                    "wage_10th": wages.get("10th"),
                    "wage_25th": wages.get("25th"),
                    "wage_50th": wages.get("50th"),
                    "wage_75th": wages.get("75th"),
                    "wage_90th": wages.get("90th"),
                }

        # If no valid result, return original data with None values
        print(f"  [{row_index}] ⚠️  No wage data found for {labor_category}")
        return {
            **row_dict,
            "BLS Code": None,
            "BLS Labour Category Mapping": None,
            "BLS Occupation Description": None,
            "area": None,
            "wage_10th": None,
            "wage_25th": None,
            "wage_50th": None,
            "wage_75th": None,
            "wage_90th": None,
        }

    except Exception as e:
        print(f"  [{row_index}] ❌ Error processing {labor_category}: {e}")
        return {
            **row_dict,
            "BLS Code": None,
            "BLS Labour Category Mapping": None,
            "BLS Occupation Description": None,
            "area": None,
            "wage_10th": None,
            "wage_25th": None,
            "wage_50th": None,
            "wage_75th": None,
            "wage_90th": None,
        }


async def process_dataframe_with_agents(
    df: pd.DataFrame,
    max_workers: int = 10
) -> pd.DataFrame:
    """
    Process DataFrame with pricing agents in parallel and add wage columns.

    Args:
        df: Input DataFrame with JD data (labor_category, description, experience, location, hours)
        max_workers: Number of parallel agents (default: 10)

    Returns:
        DataFrame with added wage columns (soc_code, occupation_name, area, wage_10th-90th)
    """
    print(f"\n{'='*60}")
    print(f"Processing {len(df)} job descriptions")
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
            return await process_single_row(row, index)

    # Create all tasks and run them in parallel (limited by semaphore)
    tasks = [bounded_process(row, i + 1) for i, row in enumerate(rows)]
    results = await asyncio.gather(*tasks)

    print(f"\n{'='*60}")
    print(f"✓ Processed {len(results)} rows")
    print(f"{'='*60}\n")

    # Create output DataFrame with wage columns
    output_df = pd.DataFrame(results)

    return output_df
