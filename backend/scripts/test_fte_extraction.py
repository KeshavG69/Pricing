"""Test script to verify FTE extraction from SURFLANT Excel file."""

import sys
import asyncio
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from client.jd_parser import parse_documents_to_dataframe


async def test_fte_extraction():
    """Test FTE extraction and multiplication."""

    file_path = "/Users/keshav/Downloads/SURFLANT Ingestion.xlsx"

    print("Testing FTE extraction from SURFLANT Excel file...")
    print("=" * 80)

    # Parse the document
    result = await parse_documents_to_dataframe([file_path])
    df = result["df"]
    odcs = result["odcs"]

    print(f"\n✓ Extracted {len(df)} positions")
    print(f"✓ Extracted {len(odcs)} ODCs")

    # Display positions with hours
    print("\n" + "=" * 80)
    print("EXTRACTED POSITIONS:")
    print("=" * 80)

    for idx, row in df.iterrows():
        labor_category = row['labor_category']
        hours = row.get('hours', 'N/A')
        hours_per_year = row.get('hours_per_year', {})

        print(f"\n{idx + 1}. {labor_category}")
        print(f"   Legacy hours: {hours}")

        if hours_per_year:
            print(f"   Hours per year:")
            for year, hrs in sorted(hours_per_year.items(), key=lambda x: int(x[0])):
                print(f"     Year {year}: {hrs} hours")

    # Check specific positions that should have FTE multipliers
    print("\n" + "=" * 80)
    print("FTE VERIFICATION:")
    print("=" * 80)

    test_cases = [
        ("NMCI ACTR", 4, 7680),  # 4 FTEs × 1920 = 7680
        ("SharePoint Administrator / Database Administrator", 3, 5760),  # 3 FTEs × 1920 = 5760
        ("Cyber Security Support Technicians", 6, 11520),  # 6 FTEs × 1920 = 11520
    ]

    for labor_cat, expected_ftes, expected_hours in test_cases:
        matching_rows = df[df['labor_category'].str.contains(labor_cat, case=False, na=False)]

        if not matching_rows.empty:
            row = matching_rows.iloc[0]
            hours_per_year = row.get('hours_per_year', {})
            year1_hours = hours_per_year.get('1', 0) if hours_per_year else 0

            status = "✓" if year1_hours == expected_hours else "✗"
            print(f"\n{status} {labor_cat}")
            print(f"   Expected: {expected_ftes} FTEs × 1920 = {expected_hours} hours")
            print(f"   Got: {year1_hours} hours (Year 1)")

            if year1_hours == expected_hours:
                print(f"   Status: FTE multiplier working correctly!")
            else:
                print(f"   Status: FTE multiplier NOT applied (still showing 1920)")
        else:
            print(f"\n✗ {labor_cat}")
            print(f"   NOT FOUND in extraction")

    print("\n" + "=" * 80)
    print("ODCs:")
    print("=" * 80)
    for odc in odcs:
        print(f"\n- {odc['category']}: {odc['description']}")
        print(f"  Amounts: {odc['amount_per_year']}")


if __name__ == "__main__":
    asyncio.run(test_fte_extraction())
