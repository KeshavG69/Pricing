"""
Test script for intelligent parser with surge and OT detection.

Usage:
    uv run python test_parser_surge.py
"""

import asyncio
import json
from pathlib import Path
from client.intelligent_parser import parse_document_intelligent


async def test_parser():
    """Test the intelligent parser with a real document."""

    # File to test
    test_file = "/Users/keshav/Downloads/Chat Ingestion.xlsx"

    print("=" * 80)
    print("TESTING INTELLIGENT PARSER - Surge & OT Detection")
    print("=" * 80)
    print(f"\nTest File: {test_file}")

    # Check if file exists
    if not Path(test_file).exists():
        print(f"\n❌ ERROR: File not found: {test_file}")
        return

    print("\n🚀 Starting parser...\n")

    # Run parser
    result = await parse_document_intelligent(test_file)

    print("\n" + "=" * 80)
    print("DETAILED RESULTS")
    print("=" * 80)

    # Metadata
    metadata = result.get("metadata", {})
    print("\n📋 METADATA:")
    print(f"  Project: {metadata.get('project_name', 'N/A')}")
    print(f"  Location: {metadata.get('location', 'N/A')}")
    print(f"  Total Years: {metadata.get('total_years', 'N/A')}")
    print(f"  Base Years: {metadata.get('base_years', 'N/A')}")
    print(f"  Option Years: {metadata.get('option_years', 'N/A')}")
    print(f"  Standard FTE Hours: {metadata.get('standard_fte_hours', 'N/A')}")

    # Positions analysis
    positions = result.get("positions", [])
    base_positions = [p for p in positions if not p.get("is_surge", False)]
    surge_positions = [p for p in positions if p.get("is_surge", False)]
    ot_positions = [p for p in positions if p.get("ot_hours_per_year")]

    print(f"\n👥 POSITIONS SUMMARY:")
    print(f"  Total Positions: {len(positions)}")
    print(f"  Base Positions: {len(base_positions)}")
    print(f"  Surge Positions: {len(surge_positions)}")
    print(f"  Positions with OT: {len(ot_positions)}")

    # Show base positions
    if base_positions:
        print("\n📊 BASE POSITIONS:")
        for i, pos in enumerate(base_positions[:10], 1):
            cat = pos.get("labor_category", "Unknown")
            hours_y1 = pos.get("hours_per_year", {}).get("1", 0)
            ot_y1 = pos.get("ot_hours_per_year", {}).get("1", 0)
            loc_type = pos.get("location_type", "N/A")
            ot_tag = f" (OT: {ot_y1} hrs)" if ot_y1 > 0 else ""
            print(f"  {i}. {cat} - {hours_y1} hrs/yr{ot_tag} - {loc_type}")

        if len(base_positions) > 10:
            print(f"  ... and {len(base_positions) - 10} more base positions")

    # Show surge positions
    if surge_positions:
        print("\n🚀 SURGE POSITIONS:")
        for i, pos in enumerate(surge_positions, 1):
            cat = pos.get("labor_category", "Unknown")
            hours_y1 = pos.get("hours_per_year", {}).get("1", 0)
            loc_type = pos.get("location_type", "N/A")
            print(f"  {i}. {cat} - {hours_y1} hrs/yr - {loc_type}")

    # Surge option
    surge = result.get("surge", None)
    print("\n🎯 SURGE OPTION:")
    if surge and surge.get("percentage"):
        print(f"  Scenario: 2 (Percentage-based)")
        print(f"  Percentage: {surge.get('percentage') * 100:.1f}%")
        print(f"  Description: {surge.get('description', 'N/A')}")
    elif surge_positions:
        print(f"  Scenario: 1 (Specific positions)")
        print(f"  Total surge positions: {len(surge_positions)}")
        if surge and surge.get("description"):
            print(f"  Description: {surge.get('description')}")
    else:
        print("  No surge option detected")

    # OT Hours
    if ot_positions:
        print("\n⏰ OVERTIME HOURS:")
        for i, pos in enumerate(ot_positions[:5], 1):
            cat = pos.get("labor_category", "Unknown")
            ot_hrs = pos.get("ot_hours_per_year", {})
            ot_y1 = ot_hrs.get("1", 0)
            print(f"  {i}. {cat}: {ot_y1} OT hrs in Year 1")

        if len(ot_positions) > 5:
            print(f"  ... and {len(ot_positions) - 5} more positions with OT")
    else:
        print("\n⏰ OVERTIME HOURS:")
        print("  No OT hours detected")

    # Travel
    travel = result.get("travel", [])
    print(f"\n✈️ TRAVEL:")
    print(f"  Items: {len(travel)}")
    for i, item in enumerate(travel[:3], 1):
        desc = item.get("description", "N/A")
        amt_y1 = item.get("amount_per_year", {}).get("1", 0)
        print(f"  {i}. {desc}: ${amt_y1:,.2f} in Year 1")

    # ODCs
    odcs = result.get("odcs", [])
    print(f"\n📦 ODCs:")
    print(f"  Items: {len(odcs)}")
    for i, item in enumerate(odcs[:3], 1):
        cat = item.get("category", "N/A")
        desc = item.get("description", "N/A")
        amt_y1 = item.get("amount_per_year", {}).get("1", 0)
        print(f"  {i}. {cat} - {desc}: ${amt_y1:,.2f} in Year 1")

    # Extensions
    extensions = result.get("extensions", [])
    print(f"\n📅 EXTENSIONS:")
    if extensions:
        print(f"  Count: {len(extensions)}")
        for ext in extensions:
            year = ext.get("year", "N/A")
            label = ext.get("label", "N/A")
            duration = ext.get("duration_months", "N/A")
            print(f"  Year {year}: {label} ({duration} months)")
    else:
        print("  No extensions detected")

    # Save full JSON output
    output_file = "test_parser_output.json"
    with open(output_file, "w") as f:
        json.dump(result, f, indent=2, default=str)

    print(f"\n💾 Full JSON output saved to: {output_file}")
    print("\n" + "=" * 80)
    print("✅ TEST COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(test_parser())
