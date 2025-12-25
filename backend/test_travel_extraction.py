"""
Test script to verify jd_parser is extracting Travel data correctly.

Usage:
    cd backend
    uv run python test_travel_extraction.py
"""

import asyncio
import json
from pathlib import Path
from client.jd_parser import parse_documents_to_dataframe


async def test_travel_extraction():
    """Test if jd_parser extracts Travel data from the uploaded document."""

    # Path to the uploaded document
    document_path = "/Users/keshav/Downloads/Personnel Labor Category Qualifications.pdf"

    print("=" * 80)
    print("Testing Travel Extraction from jd_parser")
    print("=" * 80)
    print(f"\nDocument: {document_path}")
    print()

    # Check if file exists
    if not Path(document_path).exists():
        print(f"❌ ERROR: File not found at {document_path}")
        return

    try:
        # Call jd_parser
        print("🔍 Calling parse_documents_to_dataframe()...")
        print()

        result = await parse_documents_to_dataframe([document_path])

        print("\n" + "=" * 80)
        print("EXTRACTION RESULTS")
        print("=" * 80)

        # Check what keys are in the result
        print(f"\n📋 Result keys: {list(result.keys())}")

        # Check DataFrame (positions)
        df = result.get("df")
        if df is not None:
            print(f"\n✅ DataFrame: {len(df)} positions extracted")
            print(f"   Columns: {list(df.columns)}")
        else:
            print("\n❌ DataFrame: None")

        # Check Travel data
        travel = result.get("travel")
        if travel is not None:
            print(f"\n✅ Travel: {len(travel)} items extracted")
            if len(travel) > 0:
                print("\n   Travel Items:")
                for i, item in enumerate(travel):
                    print(f"\n   [{i+1}] {json.dumps(item, indent=6)}")
            else:
                print("   (No travel items found in document)")
        else:
            print("\n❌ Travel: None (field missing from result)")

        # Check ODCs data
        odcs = result.get("odcs")
        if odcs is not None:
            print(f"\n✅ ODCs: {len(odcs)} items extracted")
            if len(odcs) > 0:
                print("\n   ODC Items:")
                for i, item in enumerate(odcs):
                    print(f"\n   [{i+1}] {json.dumps(item, indent=6)}")
            else:
                print("   (No ODC items found in document)")
        else:
            print("\n❌ ODCs: None (field missing from result)")

        print("\n" + "=" * 80)
        print("CONCLUSION")
        print("=" * 80)

        if travel is None:
            print("\n❌ PROBLEM: 'travel' field is missing from jd_parser result")
            print("   This means the parser is not returning travel data at all.")
        elif len(travel) == 0:
            print("\n⚠️  WARNING: 'travel' field exists but is empty")
            print("   This could mean:")
            print("   1. The document doesn't contain travel data")
            print("   2. LlamaExtract couldn't find/extract travel information")
            print("   3. The extraction schema needs adjustment")
        else:
            print(f"\n✅ SUCCESS: {len(travel)} travel items extracted successfully")

        print()

    except Exception as e:
        print(f"\n❌ ERROR during extraction: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_travel_extraction())
