"""
Test script for position splitting with variable month durations.

Tests that split_multi_year_position() correctly handles partial years
by prorating FTE thresholds based on month counts.
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from routers.pricing import split_multi_year_position


def test_splitting_with_partial_years():
    """
    Test position splitting with 8-month year.

    Scenario:
    - Year 1: 12 months, 1920 hours (1 FTE, no split needed)
    - Year 2: 12 months, 1920 hours (1 FTE, no split needed)
    - Year 3: 8 months, 2560 hours (exceeds 8-month threshold)

    Expected FTE threshold for Year 3: (8/12) × 1920 = 1280 hours
    Expected split: 2560 / 1280 = 2 FTEs needed
    Expected result: 2 positions with [1280, 1280] hours in Year 3
    """
    print("\n" + "="*80)
    print("Testing Position Splitting with Variable Month Durations")
    print("="*80 + "\n")

    # Test case: Position with high hours in 8-month year
    position = {
        'labor_category': 'Senior Software Engineer',
        'experience': 8,
        'location': 'Virginia',
        'soc_code': '15-1252',
        'soc_title': 'Software Developers',
        'wage_75th': 150000,
        'percentile': '75th',
        'hours_per_year': {
            '1': 1920,   # Year 1: 12 months, 1920 hours (1 FTE)
            '2': 1920,   # Year 2: 12 months, 1920 hours (1 FTE)
            '3': 2560    # Year 3: 8 months, 2560 hours (2 FTEs!)
        },
        'standard_fte_hours': 1920
    }

    # Month durations
    months_per_year = {
        '1': 12,  # Full year
        '2': 12,  # Full year
        '3': 8    # 8-month year
    }

    print("📊 Input Position:")
    print(f"  Labor Category: {position['labor_category']}")
    print(f"  Year 1 Hours: {position['hours_per_year']['1']} (12 months)")
    print(f"  Year 2 Hours: {position['hours_per_year']['2']} (12 months)")
    print(f"  Year 3 Hours: {position['hours_per_year']['3']} (8 months)")
    print(f"\n  Year 3 FTE Threshold: (8/12) × 1920 = {(8/12) * 1920:.0f} hours")
    print(f"  Year 3 FTEs Needed: 2560 / 1280 = {2560 / 1280:.1f} → 2 FTEs\n")

    # Run split
    print("⚙️  Running split_multi_year_position()...\n")
    split_positions = split_multi_year_position(
        position,
        max_hours=1920,
        months_per_year=months_per_year
    )

    # Display results
    print(f"✅ Split Complete: {len(split_positions)} position(s) created\n")
    print("="*80)

    for idx, pos in enumerate(split_positions, 1):
        print(f"\n📋 Position {idx}:")
        print(f"  Labor Category: {pos['labor_category']}")
        print(f"  Year 1: {pos['hours_per_year']['1']} hours")
        print(f"  Year 2: {pos['hours_per_year']['2']} hours")
        print(f"  Year 3: {pos['hours_per_year']['3']} hours")

    print("\n" + "="*80)

    # Verify results
    print("\n🔍 Verification:")
    print("-"*80)

    if len(split_positions) == 2:
        print("✅ Correct number of positions created (2)")
    else:
        print(f"❌ Expected 2 positions, got {len(split_positions)}")

    # Check Year 3 hours distribution
    year3_hours = [pos['hours_per_year']['3'] for pos in split_positions]
    expected_year3 = [1280, 1280]

    if year3_hours == expected_year3:
        print(f"✅ Year 3 hours correctly split: {year3_hours}")
    else:
        print(f"❌ Year 3 hours incorrect: {year3_hours}, expected {expected_year3}")

    # Check total hours are preserved
    total_year3 = sum(year3_hours)
    if total_year3 == 2560:
        print(f"✅ Total Year 3 hours preserved: {total_year3}")
    else:
        print(f"❌ Total Year 3 hours wrong: {total_year3}, expected 2560")

    print("\n" + "="*80 + "\n")


def test_no_split_needed():
    """
    Test that positions within threshold are NOT split.
    """
    print("Testing No Split Needed (8-month year with 1280 hours)")
    print("-"*80)

    position = {
        'labor_category': 'Project Manager',
        'hours_per_year': {
            '1': 1920,  # 12 months, 1920 hours (OK)
            '2': 1280   # 8 months, 1280 hours (exactly at threshold)
        },
        'standard_fte_hours': 1920
    }

    months_per_year = {
        '1': 12,
        '2': 8
    }

    split_positions = split_multi_year_position(
        position,
        max_hours=1920,
        months_per_year=months_per_year
    )

    if len(split_positions) == 1:
        print("✅ Correctly kept as 1 position (no split needed)")
    else:
        print(f"❌ Expected 1 position, got {len(split_positions)}")

    print()


if __name__ == "__main__":
    # Run tests
    test_splitting_with_partial_years()
    test_no_split_needed()

    print("✅ All tests completed!\n")
