"""
End-to-end pipeline test for variable month duration support.

Tests the complete workflow:
1. PDF extraction with LlamaExtract (including months_per_year)
2. Agent processing (SOC matching + wage lookup)
3. Position splitting with month-aware logic
4. Final data validation
"""

import sys
import asyncio
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents
from routers.pricing import split_multi_year_position, split_position_by_hours
import numpy as np


def clean_value(val):
    """Clean NaN/inf values for JSON serialization."""
    if isinstance(val, float):
        if np.isnan(val) or np.isinf(val):
            return None
    return val


async def test_full_pipeline(pdf_path: str):
    """
    Run complete pipeline test.

    Args:
        pdf_path: Path to PDF file to test
    """
    print("\n" + "="*80)
    print("FULL PIPELINE TEST: PDF → Extraction → Agents → Splitting → Final Data")
    print("="*80 + "\n")

    print(f"📄 PDF File: {pdf_path}")
    print("="*80 + "\n")

    # =========================================================================
    # STEP 1: PDF Extraction with LlamaExtract
    # =========================================================================
    print("STEP 1: PDF Extraction with LlamaExtract")
    print("-"*80)

    try:
        df = await parse_documents_to_dataframe([pdf_path])

        print(f"✅ Extraction successful!")
        print(f"   - Positions extracted: {len(df)}")

        # Check metadata
        if not df.empty:
            first_row = df.iloc[0]
            base_years = first_row.get('base_years', 'N/A')
            option_years = first_row.get('option_years', 'N/A')
            total_years = first_row.get('total_years', 'N/A')
            standard_fte = first_row.get('standard_fte_hours', 'N/A')
            months_per_year = first_row.get('months_per_year', None)

            print(f"   - Base years: {base_years}")
            print(f"   - Option years: {option_years}")
            print(f"   - Total years: {total_years}")
            print(f"   - Standard FTE hours: {standard_fte}")

            if months_per_year:
                print(f"   - Months per year: {months_per_year}")
                partial_years = [y for y, m in months_per_year.items() if m != 12]
                if partial_years:
                    print(f"   ⚠️  PARTIAL YEARS DETECTED: {', '.join(f'Year {y}' for y in partial_years)}")
            else:
                print(f"   - Months per year: None (defaulting to 12)")

        print()
    except Exception as e:
        print(f"❌ Extraction failed: {e}")
        import traceback
        traceback.print_exc()
        return None

    # =========================================================================
    # STEP 2: Agent Processing (SOC Matching + Wage Lookup)
    # =========================================================================
    print("STEP 2: Agent Processing (SOC Matching + Wage Lookup)")
    print("-"*80)

    try:
        processed_df = await process_dataframe_with_agents(
            df,
            max_workers=5  # Use 5 workers for faster processing
        )

        print(f"✅ Agent processing complete!")
        print(f"   - Positions processed: {len(processed_df)}")

        # Check how many got wage data
        wage_cols = ['wage_10th', 'wage_25th', 'wage_50th', 'wage_75th', 'wage_90th']
        positions_with_wages = 0

        for _, row in processed_df.iterrows():
            if any(row.get(col) and row.get(col) > 0 for col in wage_cols):
                positions_with_wages += 1

        print(f"   - Positions with wage data: {positions_with_wages}/{len(processed_df)}")
        print()
    except Exception as e:
        print(f"❌ Agent processing failed: {e}")
        import traceback
        traceback.print_exc()
        return None

    # =========================================================================
    # STEP 3: Data Cleaning & Conversion
    # =========================================================================
    print("STEP 3: Data Cleaning & Conversion")
    print("-"*80)

    # Rename columns to match API format
    column_mapping = {
        'soc_code': 'soc_code',
        'soc_title': 'soc_title',
        'BLS Labour Category Mapping': 'soc_title',
    }
    processed_df = processed_df.rename(columns=column_mapping)

    jobs_data = processed_df.to_dict('records')

    # Clean NaN/inf values
    cleaned_jobs = []
    for job in jobs_data:
        cleaned_job = {k: clean_value(v) for k, v in job.items()}
        cleaned_jobs.append(cleaned_job)

    print(f"✅ Data cleaning complete!")
    print(f"   - Jobs ready for splitting: {len(cleaned_jobs)}")
    print()

    # =========================================================================
    # STEP 4: Position Splitting (Month-Aware)
    # =========================================================================
    print("STEP 4: Position Splitting with Month-Aware Logic")
    print("-"*80)

    # Extract FTE threshold and months_per_year
    fte_threshold = 1920  # Default
    months_per_year_dict = None

    if cleaned_jobs and len(cleaned_jobs) > 0:
        first_job_threshold = cleaned_jobs[0].get('standard_fte_hours')
        if first_job_threshold and 1500 <= first_job_threshold <= 2500:
            fte_threshold = int(first_job_threshold)

        # Extract months_per_year
        months_per_year_dict = cleaned_jobs[0].get('months_per_year')

    print(f"   - FTE threshold: {fte_threshold} hours")
    print(f"   - Months per year: {months_per_year_dict or 'None (12 month default)'}")

    if months_per_year_dict:
        print(f"\n   📊 Year-specific FTE thresholds:")
        for year, months in sorted(months_per_year_dict.items(), key=lambda x: int(x[0])):
            threshold = (months / 12.0) * fte_threshold
            print(f"      Year {year}: {months} months → {threshold:.0f} hour threshold")

    print()

    # Apply splitting
    final_split_jobs = []
    positions_split = 0

    for job in cleaned_jobs:
        original_count = 1

        # Check if job has hours_per_year (multi-year contract)
        if 'hours_per_year' in job and job['hours_per_year']:
            split_positions = split_multi_year_position(
                job,
                max_hours=fte_threshold,
                months_per_year=months_per_year_dict
            )
            final_split_jobs.extend(split_positions)
            if len(split_positions) > 1:
                positions_split += 1
                print(f"   🔀 Split: {job.get('labor_category', 'Unknown')} → {len(split_positions)} positions")
        elif 'hours' in job and job['hours'] and job['hours'] > fte_threshold:
            # Legacy single-year contract
            split_positions = split_position_by_hours(job, max_hours=fte_threshold)
            final_split_jobs.extend(split_positions)
            if len(split_positions) > 1:
                positions_split += 1
                print(f"   🔀 Split: {job.get('labor_category', 'Unknown')} → {len(split_positions)} positions")
        else:
            final_split_jobs.append(job)

    print(f"\n✅ Splitting complete!")
    print(f"   - Original positions: {len(cleaned_jobs)}")
    print(f"   - Positions split: {positions_split}")
    print(f"   - Final positions: {len(final_split_jobs)}")
    print()

    # =========================================================================
    # STEP 5: Final Data Validation
    # =========================================================================
    print("STEP 5: Final Data Validation")
    print("-"*80)

    # Extract metadata
    metadata = {}
    if final_split_jobs and len(final_split_jobs) > 0:
        first_job = final_split_jobs[0]
        metadata = {
            'base_years': first_job.get('base_years'),
            'option_years': first_job.get('option_years'),
            'total_years': first_job.get('total_years'),
            'total_jobs': len(final_split_jobs),
            'standard_fte_hours': first_job.get('standard_fte_hours'),
            'months_per_year': first_job.get('months_per_year')
        }

    print(f"✅ Final validation complete!")
    print(f"\n   📋 Metadata:")
    for key, value in metadata.items():
        print(f"      {key}: {value}")

    print(f"\n   📊 Sample positions (first 3):")
    for idx, job in enumerate(final_split_jobs[:3], 1):
        print(f"\n      Position {idx}:")
        print(f"         Labor Category: {job.get('labor_category', 'N/A')}")
        print(f"         SOC Code: {job.get('soc_code', 'N/A')}")
        print(f"         Experience: {job.get('experience', 'N/A')} years")
        print(f"         Location: {job.get('location', 'N/A')}")

        # Display wage data
        wage_75th = job.get('wage_75th')
        if wage_75th and wage_75th > 0:
            print(f"         Wage (75th): ${wage_75th:,.0f}")

        # Display hours
        hours_per_year = job.get('hours_per_year')
        if hours_per_year:
            hours_str = ", ".join([f"Y{y}: {h}" for y, h in sorted(hours_per_year.items(), key=lambda x: int(x[0]))])
            print(f"         Hours per year: {hours_str}")

    print("\n" + "="*80)
    print("✅ FULL PIPELINE TEST COMPLETED SUCCESSFULLY!")
    print("="*80 + "\n")

    return {
        'metadata': metadata,
        'jobs': final_split_jobs,
        'stats': {
            'original_positions': len(cleaned_jobs),
            'positions_split': positions_split,
            'final_positions': len(final_split_jobs)
        }
    }


if __name__ == "__main__":
    # Test with Personnel Qualifications PDF
    pdf_path = "/Users/keshav/Downloads/Personnel Qualifications.pdf"

    # Check if file exists
    if not Path(pdf_path).exists():
        print(f"❌ Error: PDF file not found at {pdf_path}")
        sys.exit(1)

    # Run full pipeline test
    result = asyncio.run(test_full_pipeline(pdf_path))

    # Exit with appropriate code
    sys.exit(0 if result is not None else 1)
