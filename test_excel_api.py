"""
Test the Excel export API endpoints.

Tests:
1. GET /api/excel/template - Get configuration template
2. POST /api/excel/generate-from-data - Generate Excel from job data
"""

import asyncio
import json
from httpx import AsyncClient


async def test_template_endpoint():
    """Test the template endpoint."""
    print("\n" + "=" * 70)
    print("TEST 1: Get Project Configuration Template")
    print("=" * 70)

    async with AsyncClient(base_url="http://localhost:8000") as client:
        response = await client.get("/api/excel/template")

        if response.status_code == 200:
            data = response.json()
            print("✅ Template endpoint successful")
            print(f"\nTemplate structure:")
            print(f"  - Description: {data.get('description')}")
            print(f"  - Contains 'template' key: {('template' in data)}")
            print(f"  - Contains 'notes' key: {('notes' in data)}")

            # Show sample job structure
            template = data.get('template', {})
            if 'jobs' in template and len(template['jobs']) > 0:
                job = template['jobs'][0]
                print(f"\n  Sample job structure:")
                print(f"    - labor_category: {job.get('labor_category')}")
                print(f"    - selected_wage: ${job.get('selected_wage'):,}")
                print(f"    - hours: {job.get('hours')}")

            # Show project config structure
            if 'project_config' in template:
                config = template['project_config']
                print(f"\n  Project config structure:")
                print(f"    - solicitation_number: {config.get('solicitation_number')}")
                print(f"    - total_years: {config.get('total_years')}")
                print(f"    - base_years: {config.get('base_years')}")
                print(f"    - Has escalation_rates: {('escalation_rates' in config)}")
                print(f"    - Has indirect_rates: {('indirect_rates' in config)}")

        else:
            print(f"❌ Template endpoint failed: {response.status_code}")
            print(f"   Error: {response.text}")


async def test_generate_from_data_endpoint():
    """Test the generate-from-data endpoint with sample data."""
    print("\n" + "=" * 70)
    print("TEST 2: Generate Excel from Job Data")
    print("=" * 70)

    # Sample job data (minimal for testing)
    request_data = {
        "jobs": [
            {
                "labor_category": "Program Manager",
                "selected_wage": 216220,
                "hours": 1880,
                "hours_per_year": "{'1': 1880, '2': 1880, '3': 1880}",
                "experience": 10
            },
            {
                "labor_category": "Systems Analyst",
                "selected_wage": 132360,
                "hours": 1880,
                "hours_per_year": "{'1': 1880, '2': 1880, '3': 1880}",
                "experience": 6
            }
        ],
        "project_config": {
            "solicitation_number": "TEST001",
            "prime_contractor_name": "Test Company Inc.",
            "subcontractor_names": [],
            "dcaa_contact": "test@example.com",
            "total_years": 3,
            "base_years": 1,
            "escalation_rates": {
                "1_to_2": 0.0272,
                "2_to_3": 0.0299
            },
            "indirect_rates": {
                "fringe": 0.247,
                "oh": 0.0711,
                "ga": 0.2243
            },
            "passthrough_rates": {
                "smh": 0.0665,
                "ga": 0.0
            },
            "fee_rates": {
                "prime_labor": 0.08,
                "sub_labor": 0.0126
            },
            "ga_adder_rate": 0.2212,
            "subcontractors": [],
            "odcs": [
                {
                    "category": "Travel",
                    "amount_year_1": 5000,
                    "escalate": False,
                    "apply_adder": True
                }
            ],
            "include_rate_table": True
        }
    }

    async with AsyncClient(base_url="http://localhost:8000", timeout=60.0) as client:
        response = await client.post(
            "/api/excel/generate-from-data",
            json=request_data
        )

        if response.status_code == 200:
            print("✅ Excel generation successful")

            # Save the Excel file
            output_path = "test_api_generated.xlsx"
            with open(output_path, "wb") as f:
                f.write(response.content)

            print(f"\n  File saved: {output_path}")
            print(f"  File size: {len(response.content):,} bytes")

            # Check content type
            content_type = response.headers.get('content-type', '')
            print(f"  Content-Type: {content_type}")

            # Check filename from headers
            content_disp = response.headers.get('content-disposition', '')
            if 'filename=' in content_disp:
                filename = content_disp.split('filename=')[1]
                print(f"  Suggested filename: {filename}")

            print(f"\n  ✓ Open {output_path} to verify the Excel file")

        else:
            print(f"❌ Excel generation failed: {response.status_code}")
            print(f"   Error: {response.text}")


async def main():
    """Run all tests."""
    print("\n" + "=" * 70)
    print("TESTING EXCEL EXPORT API ENDPOINTS")
    print("=" * 70)
    print("\nNote: Make sure the server is running with:")
    print("  python -m uvicorn app.server:app --reload")
    print()

    try:
        # Test 1: Template endpoint
        await test_template_endpoint()

        # Test 2: Generate from data
        await test_generate_from_data_endpoint()

        print("\n" + "=" * 70)
        print("ALL TESTS COMPLETE")
        print("=" * 70)

    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
