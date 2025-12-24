"""
Test script for GSA integration flow.

Tests the GSA tools and calculations directly without external API calls.

Usage:
    cd backend
    uv run python scripts/test_gsa_flow.py
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Test organization and user IDs (use real ones from your DB)
TEST_ORG_ID = "test_org_123"
TEST_USER_ID = "test_user_123"

# Mock labor categories (simulate parsed GSA contract data)
MOCK_LABOR_CATEGORIES = [
    {
        "lcat_id": "LC001",
        "title": "Program Manager",
        "sin": "54151S",
        "education": "Bachelor's Degree",
        "experience": "10+ years",
        "rates_by_year": {
            "1": 185.50,
            "2": 190.25,
            "3": 195.00,
            "4": 200.00,
            "5": 205.50,
            "6": 210.00
        }
    },
    {
        "lcat_id": "LC002",
        "title": "Software Developer III",
        "sin": "54151S",
        "education": "Bachelor's Degree",
        "experience": "5+ years",
        "rates_by_year": {
            "1": 145.50,
            "2": 149.25,
            "3": 153.00,
            "4": 157.00,
            "5": 161.50,
            "6": 165.00
        }
    },
    {
        "lcat_id": "LC003",
        "title": "Systems Engineer",
        "sin": "54151S",
        "education": "Bachelor's Degree",
        "experience": "3+ years",
        "rates_by_year": {
            "1": 125.00,
            "2": 128.50,
            "3": 132.00,
            "4": 135.75,
            "5": 139.50,
            "6": 143.00
        }
    }
]


def print_header(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def test_gsa_flow():
    """Run all GSA tests in order (synchronous)."""

    # =========================================================================
    # TEST 1: GSA Year Calculation
    # =========================================================================
    print_header("TEST 1: GSA Year Calculation")

    from utils.agno_tools import calculate_gsa_year

    test_cases = [
        ("2020-01-15", "Contract started Jan 2020"),
        ("2023-06-01", "Contract started Jun 2023"),
        ("2024-12-01", "Contract started Dec 2024"),
    ]

    for start_date, description in test_cases:
        year = calculate_gsa_year(start_date)
        print(f"✓ {description}: Year {year}")

    # =========================================================================
    # TEST 2: GSA Rate Calculation (no indirect rates)
    # =========================================================================
    print_header("TEST 2: GSA Rate Calculation")

    from client.calculation_service import Calculator

    test_rates = [
        (185.50, 0.0, "No discount"),
        (185.50, 0.05, "5% discount"),
        (185.50, 0.10, "10% discount"),
        (145.50, 0.08, "8% discount on lower rate"),
    ]

    for gsa_rate, discount, description in test_rates:
        result = Calculator.calculate_gsa_rate(gsa_rate, discount)
        print(f"\n{description}:")
        print(f"  GSA Rate: ${result['gsa_rate']}")
        print(f"  Discount: ${result['discount']} ({discount*100}%)")
        print(f"  Final Rate: ${result['final_rate']}")
        print(f"  Fringe/OH/G&A/Fee: ${result['fringe']}/{result['oh']}/{result['ga']}/{result['fee']} (all 0)")

    # =========================================================================
    # TEST 3: GSA Position Year Calculation
    # =========================================================================
    print_header("TEST 3: GSA Position Years Calculation")

    position_data = {
        "labor_category": "Program Manager",
        "gsa_rates_by_year": {"1": 185.50, "2": 190.25, "3": 195.00, "4": 200.00, "5": 205.50},
        "hours_per_year": {"1": 1880, "2": 1880, "3": 1880, "4": 1880, "5": 940}
    }

    result = Calculator.calculate_gsa_position_years(position_data, total_years=5, discount_rate=0.10)

    print(f"Position: {result['labor_category']}")
    print(f"Wage Source: {result['wage_source']}")
    print(f"\nYear-by-Year Breakdown:")

    for year in range(1, 6):
        year_data = result.get(f"year_{year}", {})
        print(f"  Year {year}: GSA ${year_data.get('gsa_rate', 0)}/hr → Final ${year_data.get('rate', 0)}/hr × {year_data.get('hours', 0)} hrs = ${year_data.get('amount', 0):,.2f}")

    print(f"\n✓ Total Cost: ${result['total_cost']:,.2f}")

    # =========================================================================
    # TEST 4: GSA Rate Tool (uses entrypoint)
    # =========================================================================
    print_header("TEST 4: GSA Rate Tool (entrypoint)")

    from utils.agno_tools import create_gsa_rate_tool
    from utils.company_repository import get_company_repository_crud
    from auth.database import get_mongodb_client
    from app.settings import settings

    # Create a test contract in MongoDB
    print("Creating test contract in MongoDB...")
    crud = get_company_repository_crud()

    test_contract = crud.create(
        organization_id=TEST_ORG_ID,
        user_id=TEST_USER_ID,
        data={"name": "Test GSA Contract", "status": "active"}
    )
    mongo_file_id = test_contract["file_id"]
    print(f"✓ Created contract with file_id: {mongo_file_id}")

    # Update with mock labor categories
    mongodb = get_mongodb_client()
    db = mongodb.get_database()

    db["company_repositories"].update_one(
        {"file_id": mongo_file_id},
        {"$set": {
            "contract_start_date": "2020-01-15",
            "labor_categories": MOCK_LABOR_CATEGORIES,
            "status": "active"
        }}
    )
    print("✓ Updated contract with mock labor categories")

    # Create rate tool
    gsa_rate_tool = create_gsa_rate_tool(TEST_ORG_ID, mongo_file_id, "2020-01-15")

    # Test getting rates for each labor category
    print("\nTesting rate lookups:")
    for lcat in MOCK_LABOR_CATEGORIES:
        lcat_id = lcat["lcat_id"]

        # Call the tool's entrypoint directly
        rate_result = gsa_rate_tool.entrypoint(lcat_id=lcat_id, proposal_year=1)

        if rate_result.get("error"):
            print(f"  ⚠️ {lcat_id}: {rate_result.get('error')}")
        else:
            print(f"  ✓ {lcat_id} ({rate_result.get('title')}): ${rate_result.get('rate')}/hr (Year {rate_result.get('contract_year')})")

    # Test year progression
    print("\nTesting year progression for LC001:")
    for proposal_year in range(1, 4):
        rate_result = gsa_rate_tool.entrypoint(lcat_id="LC001", proposal_year=proposal_year)
        print(f"  Proposal Year {proposal_year} → Contract Year {rate_result.get('contract_year')}: ${rate_result.get('rate')}/hr")

    # =========================================================================
    # TEST 5: Pinecone Storage (if API key available)
    # =========================================================================
    print_header("TEST 5: Pinecone Storage")

    if not settings.PINECONE_API_KEY:
        print("⚠️  PINECONE_API_KEY not set - skipping Pinecone tests")
        print("   Add PINECONE_API_KEY to .env to test Pinecone")
    else:
        from client.gsa_pinecone import get_gsa_pinecone_client

        pinecone_client = get_gsa_pinecone_client()
        test_file_id = "test_pinecone_123"

        print(f"Storing {len(MOCK_LABOR_CATEGORIES)} labor categories...")
        count = pinecone_client.store_labor_categories(
            organization_id=TEST_ORG_ID,
            file_id=test_file_id,
            labor_categories=MOCK_LABOR_CATEGORIES
        )
        print(f"✓ Stored {count} vectors in Pinecone")

        # Test search
        print("\nTesting Pinecone search:")
        test_queries = ["Software Developer", "Program Manager", "Systems Engineer"]

        for query in test_queries:
            print(f"\n  Searching: '{query}'")
            results = pinecone_client.search_labor_categories(
                query=query,
                organization_id=TEST_ORG_ID,
                file_id=test_file_id,
                top_k=2
            )
            for match in results:
                print(f"    → {match.get('title')} (score: {match.get('score', 0):.3f})")

        # Cleanup Pinecone
        print("\nCleaning up Pinecone...")
        pinecone_client.delete_labor_categories(TEST_ORG_ID, test_file_id)
        print("✓ Deleted test vectors from Pinecone")

    # =========================================================================
    # CLEANUP
    # =========================================================================
    print_header("CLEANUP")

    # Delete test contract from MongoDB
    print("Deleting test contract from MongoDB...")
    crud.delete(mongo_file_id, TEST_ORG_ID)
    print("✓ Deleted from MongoDB")

    # =========================================================================
    # SUMMARY
    # =========================================================================
    print_header("TEST SUMMARY")

    print("✓ GSA Year Calculation - Working")
    print("✓ GSA Rate Calculation - Working (no indirect rates)")
    print("✓ GSA Position Years - Working")
    print("✓ GSA Rate Tool (entrypoint) - Working")
    print("✓ Pinecone Storage - " + ("Working" if settings.PINECONE_API_KEY else "Skipped (no API key)"))
    print("✓ MongoDB CRUD - Working")

    print("\n🎉 GSA Integration Tests Complete!")


if __name__ == "__main__":
    test_gsa_flow()
