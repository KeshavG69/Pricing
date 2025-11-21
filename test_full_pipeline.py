"""
Test the complete pipeline from document parsing to Excel generation.

This tests the full workflow:
1. Parse PDF documents with llamaextract
2. Fetch wage data for each position
3. Build project data structure
4. Generate professional Excel cost proposal
"""

import asyncio
from main import run_full_pipeline


async def test_complete_pipeline():
    """Test the complete pipeline with actual document parsing."""
    print("\n" + "="*70)
    print("  TESTING COMPLETE PIPELINE")
    print("  Document Parsing → Wage Fetching → Excel Generation")
    print("="*70 + "\n")

    # Document to parse (update with actual path)
    document_paths = [
        "/Users/keshav/Downloads/PriceIQ Personnel Qualifications (1).pdf"
    ]

    # Project configuration
    project_config = {
        'solicitation_number': 'N0017825R3013',
        'prime_contractor_name': 'Test Company Inc.',
        'subcontractor_names': ['Astrion Group LLC', 'Deloitte Consulting LLP'],
        'dcaa_contact': 'test.contact@dcaa.mil',
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
                'name': 'Astrion Group LLC',
                'labor_categories': [
                    {
                        'labor_category': 'Systems Administrator (Windows)',
                        'ecraft_code': 'SYSTEMS ADMINISTRATOR II',
                        'year_1_rate': 107.33,
                        'year_1_hours': 1880,
                        'year_2_rate': 110.25,
                        'year_2_hours': 1880,
                        'year_3_rate': 113.54,
                        'year_3_hours': 1880,
                        'year_4_rate': 116.72,
                        'year_4_hours': 1880,
                        'year_5_rate': 120.05,
                        'year_5_hours': 1880,
                        'year_6_rate': 123.53,
                        'year_6_hours': 1880,
                    },
                    {
                        'labor_category': 'Electrical Engineer',
                        'ecraft_code': 'ENGINEER, ELECTRICAL/ELECTRONICS II',
                        'year_1_rate': 77.61,
                        'year_1_hours': 1880,
                        'year_2_rate': 79.72,
                        'year_2_hours': 1880,
                        'year_3_rate': 82.10,
                        'year_3_hours': 1880,
                        'year_4_rate': 84.40,
                        'year_4_hours': 1880,
                        'year_5_rate': 86.81,
                        'year_5_hours': 1880,
                        'year_6_rate': 89.33,
                        'year_6_hours': 1880,
                    }
                ]
            },
            {
                'name': 'Deloitte Consulting LLP',
                'labor_categories': [
                    {
                        'labor_category': 'Program Analyst',
                        'ecraft_code': 'ANALYST, FINANCIAL SYSTEMS',
                        'year_1_rate': 95.50,
                        'year_1_hours': 3760,  # 2 people
                        'year_2_rate': 98.10,
                        'year_2_hours': 3760,
                        'year_3_rate': 101.03,
                        'year_3_hours': 3760,
                        'year_4_rate': 103.86,
                        'year_4_hours': 3760,
                        'year_5_rate': 106.82,
                        'year_5_hours': 3760,
                        'year_6_rate': 109.92,
                        'year_6_hours': 3760,
                    }
                ]
            }
        ],

        # Other Direct Costs
        'odcs': [
            {
                'category': 'Travel',
                'amount_year_1': 5000,
                'escalate': False,  # Fixed amount
                'apply_adder': True
            },
            {
                'category': 'Equipment',
                'amount_year_1': 10000,
                'escalate': True,   # Escalates with inflation
                'apply_adder': True
            },
            {
                'category': 'Software Licenses',
                'amount_year_1': 15000,
                'escalate': True,
                'apply_adder': True
            }
        ]
    }

    print("📋 Test Configuration:")
    print(f"   Documents to parse: {len(document_paths)}")
    for doc in document_paths:
        print(f"     - {doc}")
    print(f"   Contract: {project_config['total_years']} years ({project_config['base_years']} base + {project_config['total_years'] - project_config['base_years']} option)")
    print(f"   Subcontractors: {len(project_config['subcontractors'])}")
    print(f"   ODCs: {len(project_config['odcs'])}")
    print()

    # Run the full pipeline
    try:
        result_path = await run_full_pipeline(
            document_paths=document_paths,
            intermediate_excel_path="test_intermediate_data.xlsx",
            final_cost_proposal_path="test_final_cost_proposal.xlsx",
            project_config=project_config,
            max_workers=5  # Use 5 workers for testing
        )

        print("✅ PIPELINE TEST COMPLETE!")
        print()
        print("Generated Files:")
        print("  1. test_intermediate_data.xlsx - Raw position data with wages")
        print("  2. test_final_cost_proposal.xlsx - Professional cost proposal")
        print()
        print("Review Checklist:")
        print("  ✓ Open intermediate Excel to verify parsing extracted all positions")
        print("  ✓ Verify wage data was fetched for each position")
        print("  ✓ Open final cost proposal to check formatting")
        print("  ✓ Verify dynamic year columns (should have 6 years)")
        print("  ✓ Check FBLR calculations for prime labor")
        print("  ✓ Verify subcontractor rates are displayed correctly")
        print("  ✓ Check pass-through and fee calculations")
        print()

    except FileNotFoundError as e:
        print(f"\n❌ ERROR: Document not found")
        print(f"   {e}")
        print()
        print("Please update the document path in test_full_pipeline.py")
        print("Current path: /Users/keshav/Downloads/PriceIQ Personnel Qualifications (1).pdf")
        print()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """Run the test."""
    await test_complete_pipeline()


if __name__ == "__main__":
    asyncio.run(main())
