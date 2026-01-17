"""
Test script that replaces JD parser with Intelligent Parser and runs the full pipeline.

This script:
1. Uses intelligent_parser.py instead of jd_parser.py
2. Converts the intelligent parser output to DataFrame format
3. Runs the full pipeline (agents, wage lookup, FBLR calculation)
4. Outputs final JSON
"""

import asyncio
import json
import pandas as pd
from pathlib import Path
from typing import Dict, Any

# Intelligent parser
from client.intelligent_parser import parse_document_intelligent

# Rest of the system (unchanged)
from utils.pipeline import process_dataframe_with_agents, build_project_data_from_dataframe
from routers.pricing import split_multi_year_position


def convert_intelligent_output_to_dataframe(intelligent_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert intelligent parser output to the same format as jd_parser output.

    Args:
        intelligent_result: Output from parse_document_intelligent()

    Returns:
        Dict with keys: df, travel, odcs, extensions (same as parse_documents_to_dataframe)
    """
    metadata = intelligent_result.get("metadata", {})
    positions = intelligent_result.get("positions", [])
    travel = intelligent_result.get("travel", [])
    odcs = intelligent_result.get("odcs", [])
    extensions = intelligent_result.get("extensions", [])

    # Build months_per_year dict from extensions
    total_years = metadata.get("total_years", 5)
    months_per_year_dict = {}

    # Default: all regular years have 12 months
    for year in range(1, total_years + 1):
        months_per_year_dict[str(year)] = 12

    # Add extension years with their specific month counts
    for ext in extensions:
        ext_year = ext.get("year")
        ext_months = ext.get("duration_months", 6)
        if ext_year:
            months_per_year_dict[str(ext_year)] = ext_months

    # Convert positions to DataFrame rows
    rows = []
    for pos in positions:
        # Extract hours_per_year dict
        hours_per_year = pos.get("hours_per_year", {})

        row = {
            "labor_category": pos.get("labor_category", ""),
            "description": pos.get("description", ""),
            "experience": pos.get("experience"),
            "location": pos.get("location"),
            "location_type": pos.get("location_type", "On-Site"),
            "is_key_position": pos.get("is_key_position", False),
            "hours_per_year": hours_per_year,

            # Metadata (document-level info)
            "base_years": metadata.get("base_years", 1),
            "option_years": metadata.get("option_years", 4),
            "total_years": metadata.get("total_years", 5),
            "project_name": metadata.get("project_name"),
            "standard_fte_hours": metadata.get("standard_fte_hours", 1920),
            "months_per_year": months_per_year_dict if months_per_year_dict else None
        }

        rows.append(row)

    # Create DataFrame
    df = pd.DataFrame(rows)

    # Convert travel list
    travel_list = []
    for t in travel:
        travel_list.append({
            "description": t.get("description", ""),
            "amount_per_year": t.get("amount_per_year", {})
        })

    # Convert ODCs list
    odc_list = []
    for o in odcs:
        odc_list.append({
            "category": o.get("category", ""),
            "description": o.get("description", ""),
            "amount_per_year": o.get("amount_per_year")
        })

    # Convert extensions list
    extensions = intelligent_result.get("extensions", [])
    extension_list = []
    for e in extensions:
        extension_list.append({
            "year": e.get("year"),
            "label": e.get("label", ""),
            "duration_months": e.get("duration_months", 6),
            "description": e.get("description", "")
        })

    return {
        "df": df,
        "travel": travel_list,
        "odcs": odc_list,
        "extensions": extension_list
    }


async def test_intelligent_pipeline():
    """
    Test the full pipeline with intelligent parser instead of JD parser.
    """

    print("="*70)
    print("INTELLIGENT PARSER PIPELINE TEST")
    print("="*70)

    # Input file
    file_path = "/Users/keshav/Downloads/Performance Work Statement C (1).pdf"

    print(f"\n📄 Input: {Path(file_path).name}")

    # ========================================================================
    # STEP 1: Parse with Intelligent Parser
    # ========================================================================
    print(f"\n{'='*70}")
    print("STEP 1: INTELLIGENT PARSER (Replaces JD Parser)")
    print("="*70)

    intelligent_result = await parse_document_intelligent(file_path)

    print(f"\n✅ Parsed:")
    print(f"   - Positions: {len(intelligent_result.get('positions', []))}")
    print(f"   - Travel items: {len(intelligent_result.get('travel', []))}")
    print(f"   - ODCs: {len(intelligent_result.get('odcs', []))}")
    print(f"   - Extensions: {len(intelligent_result.get('extensions', []))}")

    # ========================================================================
    # STEP 2: Convert to DataFrame Format
    # ========================================================================
    print(f"\n{'='*70}")
    print("STEP 2: CONVERT TO DATAFRAME (Adapter Layer)")
    print("="*70)

    parse_result = convert_intelligent_output_to_dataframe(intelligent_result)
    df = parse_result["df"]
    extracted_travel = parse_result["travel"]
    extracted_odcs = parse_result["odcs"]
    extracted_extensions = parse_result["extensions"]

    print(f"\n✅ Converted to DataFrame:")
    print(f"   - DataFrame shape: {df.shape}")
    print(f"   - Columns: {list(df.columns)}")
    if extracted_extensions:
        print(f"   - Extensions: {len(extracted_extensions)} period(s)")

    # Show first 3 positions
    print(f"\n📋 First 3 positions:")
    for idx, row in df.head(3).iterrows():
        print(f"   {idx+1}. {row['labor_category']}")
        hours_y1 = row['hours_per_year'].get('1', 0) if isinstance(row['hours_per_year'], dict) else 0
        print(f"      Hours Year 1: {hours_y1}, Location: {row['location_type']}")

    # ========================================================================
    # STEP 3: Process with Agents (SOC Search + Wage Lookup)
    # ========================================================================
    print(f"\n{'='*70}")
    print("STEP 3: AGENT PROCESSING (SOC Search + BLS Wage Lookup)")
    print("="*70)
    print("⏳ Running parallel agent processing...")

    # Use default organization rates
    organization_rates = {
        "fringe": 0.247,
        "oh_onsite": 0.0711,
        "oh_offsite": 0.0711,
        "ga": 0.2243,
        "fee": 0.08
    }

    processed_df = await process_dataframe_with_agents(
        df,
        organization_rates=organization_rates,
        max_workers=10
    )

    print(f"\n✅ Agent processing complete:")
    print(f"   - Processed: {len(processed_df)} positions")
    print(f"   - Added columns: wage_25th, wage_50th, wage_75th, fblr_rate, etc.")

    # Show wage data for first 3
    print(f"\n💰 Wage data (first 3 positions):")
    for idx, row in processed_df.head(3).iterrows():
        print(f"   {idx+1}. {row['labor_category']}")
        print(f"      Wage (median): ${row.get('wage_50th', 0):,.0f}")
        print(f"      FBLR: ${row.get('fblr_rate', 0):.2f}/hr")

    # ========================================================================
    # STEP 4: Split Positions by FTE
    # ========================================================================
    print(f"\n{'='*70}")
    print("STEP 4: POSITION SPLITTING (Multi-FTE Positions)")
    print("="*70)

    # Convert to dict for splitting
    positions_list = []
    for _, row in processed_df.iterrows():
        position_dict = row.to_dict()
        positions_list.append(position_dict)

    # Split positions that exceed FTE threshold
    split_positions = []
    for pos in positions_list:
        split_result = split_multi_year_position(pos, max_hours=1920)
        split_positions.extend(split_result)

    print(f"\n✅ Position splitting complete:")
    print(f"   - Original positions: {len(positions_list)}")
    print(f"   - After splitting: {len(split_positions)}")
    print(f"   - FTE created: {len(split_positions) - len(positions_list)} additional")

    # ========================================================================
    # STEP 5: Build Project Data Structure
    # ========================================================================
    print(f"\n{'='*70}")
    print("STEP 5: BUILD PROJECT DATA STRUCTURE")
    print("="*70)

    # Build project config dict for build_project_data_from_dataframe
    metadata = intelligent_result.get('metadata', {})
    # Handle None values by using 'or' instead of get() default
    total_years = metadata.get('total_years') or 5
    base_years = metadata.get('base_years') or 1

    project_config = {
        'solicitation_number': metadata.get('project_name', 'N/A'),
        'prime_contractor_name': 'Contractor',
        'subcontractor_names': [],
        'dcaa_contact': '',
        'total_years': total_years,
        'base_years': base_years,
        'escalation_rates': {},  # No escalation for this test
        'indirect_rates': {
            'fringe': organization_rates['fringe'],
            'oh_onsite': organization_rates['oh_onsite'],
            'oh_offsite': organization_rates['oh_offsite'],
            'ga': organization_rates['ga']
        },
        'passthrough_rates': {
            'small_business': 0.10,
            'other': 0.08
        },
        'fee_rates': {
            'prime_labor': organization_rates['fee'],
            'subcontractor_labor': 0.08,
            'materials_equipment': 0.08,
            'travel': 0.08,
            'odcs': 0.08
        },
        'travel': extracted_travel,
        'odcs': extracted_odcs,
        'extensions': [],
        'ga_adder_rate': 0.0,
        'subcontractors': []
    }

    project_data = build_project_data_from_dataframe(
        processed_df,
        project_config
    )

    # Update with split positions
    project_data["positions"] = split_positions

    print(f"\n✅ Project data structure built:")
    print(f"   - Total positions (after split): {len(project_data['positions'])}")
    print(f"   - Travel items: {len(project_data.get('travel', []))}")
    print(f"   - ODCs: {len(project_data.get('odcs', []))}")
    print(f"   - Subcontractors: {len(project_data.get('subcontractors', []))}")

    # ========================================================================
    # STEP 6: Output Final JSON
    # ========================================================================
    print(f"\n{'='*70}")
    print("STEP 6: FINAL JSON OUTPUT")
    print("="*70)

    print(f"\n✅ Pipeline complete!")
    print(f"   - Total positions (after split): {len(project_data['positions'])}")
    print(f"   - Project: {intelligent_result['metadata'].get('project_name', 'N/A')}")

    print(f"\n{'='*70}")
    print("FINAL JSON OUTPUT")
    print("="*70)
    print(json.dumps(project_data, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(test_intelligent_pipeline())
