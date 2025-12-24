"""Test Personnel Qualifications PDF extraction."""

import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from client.jd_parser import parse_documents_to_dataframe


async def test_personnel_qual():
    """Test Personnel Qualifications PDF."""

    file_path = "/Users/keshav/Downloads/Personnel Qualifications.pdf"

    print("Testing Personnel Qualifications PDF extraction...")
    print("=" * 80)

    result = await parse_documents_to_dataframe([file_path])
    df = result["df"]
    odcs = result["odcs"]

    print(f"\n✓ Extracted {len(df)} positions")
    print(f"✓ Extracted {len(odcs)} ODCs")

    print("\n" + "=" * 80)
    print("EXTRACTED POSITIONS (first 10):")
    print("=" * 80)

    for idx, row in df.head(10).iterrows():
        labor_category = row['labor_category']
        hours = row.get('hours', 'N/A')
        hours_per_year = row.get('hours_per_year', {})
        location = row.get('location', 'N/A')

        print(f"\n{idx + 1}. {labor_category}")
        print(f"   Location: {location}")
        print(f"   Legacy hours: {hours}")

        if hours_per_year:
            print(f"   Hours per year:")
            for year, hrs in sorted(hours_per_year.items(), key=lambda x: int(x[0]))[:3]:
                print(f"     Year {year}: {hrs} hours")


if __name__ == "__main__":
    asyncio.run(test_personnel_qual())
