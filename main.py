"""
Main pipeline for government contractor pricing system.

Workflow:
1. Parse documents → Extract JDs → Save to Excel
2. Load Excel → Run agents in parallel (10 at a time) → Add wage columns
3. Save final Excel with pricing data
"""

import asyncio
from typing import List
import pandas as pd

from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents


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
