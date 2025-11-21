"""
Main pipeline for government contractor pricing system.

Complete Workflow:
1. Parse documents → Extract JDs and positions
2. Run agents in parallel → Get wage data for each position
3. Build project data structure with all costs
4. Generate professional Excel cost proposal using ExcelGenerator

This demonstrates the full flow from document extraction to final Excel output.
"""

import asyncio
from typing import List, Dict, Any
import pandas as pd

from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents
from client.excel_generator import ExcelGenerator


async def run_full_pipeline(
    document_paths: List[str],
    intermediate_excel_path: str,
    final_cost_proposal_path: str,
    project_config: Dict[str, Any],
    max_workers: int = 10
) -> str:
    """
    Run the complete pipeline from documents to final cost proposal Excel.

    Args:
        document_paths: List of document paths to parse (PDF, DOCX, etc.)
        intermediate_excel_path: Path to save intermediate data (with wage data)
        final_cost_proposal_path: Path to save final cost proposal Excel
        project_config: Project configuration (solicitation, rates, etc.)
        max_workers: Number of parallel agents (default: 10)

    Returns:
        Path to final cost proposal Excel file
    """
    print(f"\n{'='*70}")
    print(f"  GOVERNMENT CONTRACTOR PRICING PIPELINE")
    print(f"{'='*70}\n")

    # Step 1: Parse documents to DataFrame
    print("📄 STEP 1: Parsing documents and extracting positions...")
    print(f"   Documents: {', '.join(document_paths)}")
    df = await parse_documents_to_dataframe(document_paths)
    print(f"   ✓ Extracted {len(df)} positions\n")

    # Step 2: Process DataFrame with agents to get wage data
    print("🤖 STEP 2: Running pricing agents to fetch wage data...")
    print(f"   Processing {len(df)} positions with {max_workers} parallel workers")
    final_df = await process_dataframe_with_agents(df, max_workers=max_workers)

    # Save intermediate results
    final_df.to_excel(intermediate_excel_path, index=False, engine='openpyxl')
    print(f"   ✓ Saved intermediate data to: {intermediate_excel_path}\n")

    # Step 3: Build project data structure from DataFrame
    print("🏗️  STEP 3: Building project data structure...")
    project_data = build_project_data_from_dataframe(final_df, project_config)
    print(f"   ✓ Built project structure with:")
    print(f"     - {len(project_data['prime_positions'])} prime positions")
    print(f"     - {len(project_data['subcontractors'])} subcontractors")
    print(f"     - {len(project_data['odcs'])} ODCs")
    print(f"     - {project_data['total_years']} years ({project_data['base_years']} base + {project_data['option_years']} option)\n")

    # Step 4: Generate Excel cost proposal
    print("📊 STEP 4: Generating professional Excel cost proposal...")
    generator = ExcelGenerator()
    workbook = generator.generate_cost_proposal(project_data)

    # Save the workbook
    workbook.save(final_cost_proposal_path)
    print(f"   ✓ Generated cost proposal: {final_cost_proposal_path}\n")

    print(f"{'='*70}")
    print(f"  PIPELINE COMPLETE ✅")
    print(f"{'='*70}")
    print(f"Outputs:")
    print(f"  1. Intermediate data: {intermediate_excel_path}")
    print(f"  2. Cost proposal:     {final_cost_proposal_path}\n")

    return final_cost_proposal_path


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

    # Extract prime positions from DataFrame
    prime_positions = []

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
            'name': row.get('name', 'TBD'),
            'labor_category': row['labor_category'],
            'ecraft_code': row.get('ecraft_code', 'TBD'),
            'base_annual_wage': row.get('selected_wage', row.get('wage_50th', 100000)),  # Use selected wage or 50th percentile
            'hours_per_year': hours_per_year
        }
        prime_positions.append(position)

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
        'subcontractors': project_config.get('subcontractors', []),
        'passthrough_rates': project_config['passthrough_rates'],
        'fee_rates': project_config['fee_rates'],
        'odcs': project_config.get('odcs', []),
        'ga_adder_rate': project_config['ga_adder_rate']
    }

    return project_data


async def main():
    """
    Example usage of the complete pricing pipeline.

    This demonstrates the full flow from document parsing to Excel generation.
    """
    # Document paths to parse
    document_paths = ["Labor Information.pdf"]  # Replace with actual paths

    # Project configuration
    project_config = {
        'solicitation_number': 'N0017825R3013',
        'prime_contractor_name': 'Your Company Name',
        'subcontractor_names': ['Subcontractor A', 'Subcontractor B'],
        'dcaa_contact': 'contact@example.com',
        'total_years': 6,  # 1 base + 5 options
        'base_years': 1,

        # Escalation rates (year-over-year wage increases)
        'escalation_rates': {
            '1_to_2': 0.0272,  # 2.72%
            '2_to_3': 0.0299,  # 2.99%
            '3_to_4': 0.0280,  # 2.80%
            '4_to_5': 0.0285,  # 2.85%
            '5_to_6': 0.0290,  # 2.90%
        },

        # Indirect rates (for FBLR calculation)
        'indirect_rates': {
            'fringe': 0.247,   # 24.7%
            'oh': 0.0711,      # 7.11%
            'ga': 0.2243       # 22.43%
        },

        # Pass-through rates (for managing subcontractors)
        'passthrough_rates': {
            'smh': 0.0665,     # 6.65% S&MH
            'ga': 0.0          # No additional G&A
        },

        # Fee rates (profit margins)
        'fee_rates': {
            'prime_labor': 0.08,    # 8% fee on prime labor
            'sub_labor': 0.0126     # 1.26% fee on subcontractor labor
        },

        # G&A adder for ODCs
        'ga_adder_rate': 0.2212,    # 22.12%

        # Subcontractors (simple rate table)
        'subcontractors': [
            {
                'name': 'Subcontractor A',
                'labor_categories': [
                    {
                        'labor_category': 'Systems Administrator',
                        'ecraft_code': 'SYSTEMS ADMINISTRATOR II',
                        'year_1_rate': 107.33,
                        'year_1_hours': 1880,
                        'year_2_rate': 110.25,
                        'year_2_hours': 1880,
                        'year_3_rate': 113.25,
                        'year_3_hours': 1880,
                        'year_4_rate': 116.30,
                        'year_4_hours': 1880,
                        'year_5_rate': 119.40,
                        'year_5_hours': 1880,
                        'year_6_rate': 122.55,
                        'year_6_hours': 1880,
                    }
                ]
            }
        ],

        # Other Direct Costs
        'odcs': [
            {
                'category': 'Travel',
                'amount_year_1': 5000,
                'escalate': False  # Fixed amount
            },
            {
                'category': 'Equipment',
                'amount_year_1': 10000,
                'escalate': True   # Escalates with inflation
            }
        ]
    }

    # Run the pipeline
    await run_full_pipeline(
        document_paths=document_paths,
        intermediate_excel_path="intermediate_pricing_data.xlsx",
        final_cost_proposal_path="final_cost_proposal.xlsx",
        project_config=project_config,
        max_workers=10
    )


if __name__ == "__main__":
    asyncio.run(main())
