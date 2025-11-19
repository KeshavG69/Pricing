"""
Main pipeline for government contractor pricing system.

Workflow:
1. Parse documents → Extract JDs → Save to Excel
2. Load Excel → Run agents in parallel (10 at a time) → Add wage columns
3. Save final Excel with pricing data
"""

import asyncio
from typing import List, Dict, Any
import pandas as pd
import json

from client.jd_parser import parse_documents_to_dataframe
from agent.agent import create_pricing_agent


async def process_single_row(row_dict: Dict[str, Any], row_index: int) -> Dict[str, Any]:
    """
    Process a single JD row with the pricing agent.

    Args:
        row_dict: Dictionary with keys: labor_category, experience, location, hours
        row_index: Row number (for logging)

    Returns:
        Dictionary with original fields plus: soc_code, occupation_name, area,
        wage_10th, wage_25th, wage_50th, wage_75th, wage_90th
    """
    labor_category = row_dict.get("labor_category", "")
    location = row_dict.get("location")

    print(f"  [{row_index}] Processing: {labor_category} in {location}")

    try:
        # Create pricing agent
        agent = await create_pricing_agent(
            labor_category=labor_category,
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
                    **row_dict,  # Original fields
                    "soc_code": wage_data.get("soc_code"),
                    "occupation_name": wage_data.get("occupation_name"),
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
            "soc_code": None,
            "occupation_name": None,
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
            "soc_code": None,
            "occupation_name": None,
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
        df: Input DataFrame with JD data (labor_category, experience, location, hours)
        max_workers: Number of parallel agents (default: 10)

    Returns:
        DataFrame with added wage columns
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


async def run_full_pipeline(
    document_paths: List[str],
    output_excel_path: str,
    max_workers: int = 10
) -> str:
    """
    Run the complete pipeline from documents to final pricing Excel.

    Args:
        document_paths: List of document paths to parse (PDF, DOCX, etc.)
        output_excel_path: Path to save final Excel (with wage data)
        max_workers: Number of parallel agents (default: 10)

    Returns:
        Path to final Excel file with pricing data
    """
    print(f"\n{'#'*60}")
    print(f"# GOVERNMENT CONTRACTOR PRICING PIPELINE")
    print(f"{'#'*60}\n")

    # Step 1: Parse documents to DataFrame
    print("STEP 1: Parsing documents...")
    df = await parse_documents_to_dataframe(document_paths)

    # Step 2: Process DataFrame with agents
    print("STEP 2: Running pricing agents...")
    final_df = await process_dataframe_with_agents(df, max_workers=max_workers)

    # Step 3: Save final Excel
    final_df.to_excel(output_excel_path, index=False, engine='openpyxl')
    print(f"✓ Saved final results to: {output_excel_path}\n")

    print(f"{'#'*60}")
    print(f"# PIPELINE COMPLETE")
    print(f"{'#'*60}")
    print(f"Final output: {output_excel_path}\n")

    return output_excel_path


async def main():
    """Example usage of the pricing pipeline."""
    # Example: Process a single document
    document_paths = ["Labor Information.pdf"]  # Replace with actual paths

    await run_full_pipeline(
        document_paths=document_paths,
        output_excel_path="final_pricing.xlsx",
        max_workers=10
    )


if __name__ == "__main__":
    asyncio.run(main())
