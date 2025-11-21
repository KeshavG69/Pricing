"""
Test Excel generation directly without document parsing.

This bypasses the LlamaExtract SSL issue and tests just the Excel generator.
"""

from client.excel_generator import ExcelGenerator


def test_excel_generation():
    """Test Excel generation with sample data."""
    print("\n" + "="*70)
    print("  TESTING EXCEL GENERATOR")
    print("="*70 + "\n")

    # Sample project data
    project_data = {
        'solicitation_number': 'N0017825R3013',
        'prime_contractor_name': 'Test Company Inc.',
        'subcontractor_names': ['Astrion Group LLC', 'Deloitte Consulting LLP'],
        'dcaa_contact': 'test.contact@dcaa.mil',
        'total_years': 6,  # 1 base + 5 options
        'base_years': 1,

        # Escalation rates
        'escalation_rates': {
            '1_to_2': 0.0272,
            '2_to_3': 0.0299,
            '3_to_4': 0.0280,
            '4_to_5': 0.0285,
            '5_to_6': 0.0290,
        },

        # Indirect rates
        'indirect_rates': {
            'fringe': 0.247,
            'oh': 0.0711,
            'ga': 0.2243
        },

        # Prime positions
        'prime_positions': [
            {
                'name': 'Key - Individual 1',
                'labor_category': 'Program Manager, Senior',
                'ecraft_code': 'MANAGER, PROGRAM/PROJECT II',
                'base_annual_wage': 145000,
                'hours_per_year': {'1': 1880, '2': 1880, '3': 1880, '4': 1880, '5': 1880, '6': 1880}
            },
            {
                'name': 'Key - Individual 2',
                'labor_category': 'Systems Analyst, Senior',
                'ecraft_code': 'ENGINEER, SYSTEMS III',
                'base_annual_wage': 125000,
                'hours_per_year': {'1': 1880, '2': 1880, '3': 1880, '4': 1880, '5': 1880, '6': 1880}
            },
            {
                'name': 'TBD',
                'labor_category': 'Software Engineer, Senior',
                'ecraft_code': 'ENGINEER, SOFTWARE III',
                'base_annual_wage': 130000,
                'hours_per_year': {'1': 1880, '2': 1880, '3': 1880, '4': 1880, '5': 1880, '6': 1880}
            },
        ],

        # Subcontractors
        'subcontractors': [
            {
                'name': 'Astrion Group LLC',
                'labor_categories': [
                    {
                        'labor_category': 'Systems Administrator (Windows)',
                        'ecraft_code': 'SYSTEMS ADMINISTRATOR II',
                        'year_1_rate': 107.33, 'year_1_hours': 1880,
                        'year_2_rate': 110.25, 'year_2_hours': 1880,
                        'year_3_rate': 113.54, 'year_3_hours': 1880,
                        'year_4_rate': 116.72, 'year_4_hours': 1880,
                        'year_5_rate': 120.05, 'year_5_hours': 1880,
                        'year_6_rate': 123.53, 'year_6_hours': 1880,
                    },
                ]
            },
        ],

        # Pass-through and fee rates
        'passthrough_rates': {'smh': 0.0665, 'ga': 0.0},
        'fee_rates': {'prime_labor': 0.08, 'sub_labor': 0.0126},
        'ga_adder_rate': 0.2212,

        # ODCs
        'odcs': [
            {'category': 'Travel', 'amount_year_1': 5000, 'escalate': False, 'apply_adder': True},
            {'category': 'Equipment', 'amount_year_1': 10000, 'escalate': True, 'apply_adder': True},
        ]
    }

    print("📊 Generating Excel cost proposal...")
    print(f"   - Prime positions: {len(project_data['prime_positions'])}")
    print(f"   - Subcontractors: {len(project_data['subcontractors'])}")
    print(f"   - ODCs: {len(project_data['odcs'])}")
    print(f"   - Years: {project_data['total_years']}\n")

    # Generate Excel
    generator = ExcelGenerator()
    workbook = generator.generate_cost_proposal(project_data)

    # Save
    output_path = "sample_cost_proposal.xlsx"
    workbook.save(output_path)

    print(f"✅ SUCCESS!")
    print(f"   Generated: {output_path}\n")
    print("Open the file to verify:")
    print("  ✓ Dynamic 6-year columns")
    print("  ✓ Prime labor with FBLR calculations")
    print("  ✓ Subcontractor rate table")
    print("  ✓ Pass-through and fees")
    print("  ✓ ODCs with escalation")
    print()


if __name__ == "__main__":
    try:
        test_excel_generation()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
