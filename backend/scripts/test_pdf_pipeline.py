"""Test the full pipeline for Personnel Qualifications PDF."""

import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from client.jd_parser import parse_documents_to_dataframe


async def test_pipeline():
    """Test full extraction pipeline."""

    print('Testing full pipeline for Personnel Qualifications PDF...')
    print('='*80)

    result = await parse_documents_to_dataframe(['/Users/keshav/Downloads/Personnel Qualifications.pdf'])
    df = result['df']

    print(f'\nExtracted {len(df)} positions from pipeline')
    print('='*80)

    # Check Senior Infrastructure Design Engineer specifically
    print('\nLooking for "Senior Infrastructure Design Engineer" (non-Lead):')
    for idx, row in df.iterrows():
        if 'Senior Infrastructure Design' in row['labor_category'] and 'Lead' not in row['labor_category']:
            print(f'\nFound at index {idx}:')
            print(f'  Labor Category: {row["labor_category"]}')
            print(f'  Hours (legacy): {row.get("hours", "N/A")}')
            print(f'  Hours per year: {row.get("hours_per_year", {})}')

            hours_per_year = row.get("hours_per_year", {})
            if hours_per_year:
                year1 = hours_per_year.get('1', 0)
                expected_ftes = year1 / 1880
                print(f'  Year 1 hours: {year1}')
                print(f'  Calculated FTEs: {expected_ftes:.1f}')
                print(f'  Expected: 5640 hours (3 FTEs)')

                if year1 == 5640:
                    print('  ✓ CORRECT - Will split into 3 positions')
                elif year1 == 16920:
                    print('  ✗ WRONG - Multiplied 3 times (5640 × 3 = 16920)')
                else:
                    print(f'  ? UNEXPECTED value')
            break

    # Check Systems Administrator (Windows) - should be 28 FTEs
    print('\n' + '='*80)
    print('\nLooking for "Systems Administrator (Windows)":')
    for idx, row in df.iterrows():
        if row['labor_category'] == 'Systems Administrator (Windows)':
            print(f'\nFound at index {idx}:')
            print(f'  Labor Category: {row["labor_category"]}')

            hours_per_year = row.get("hours_per_year", {})
            if hours_per_year:
                year1 = hours_per_year.get('1', 0)
                expected_ftes = year1 / 1880
                print(f'  Year 1 hours: {year1}')
                print(f'  Calculated FTEs: {expected_ftes:.1f}')
                print(f'  Expected: 52,640 hours (28 FTEs)')

                if year1 == 52640:
                    print('  ✓ CORRECT - Will split into 28 positions')
                else:
                    print(f'  ✗ WRONG - Expected 52,640')
            break


if __name__ == '__main__':
    asyncio.run(test_pipeline())
