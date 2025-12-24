"""Test position splitting for Personnel Qualifications PDF."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from routers.pricing import split_multi_year_position


def test_splitting():
    """Test that positions split correctly."""

    print('Testing position splitting...')
    print('='*80)

    # Test case 1: Senior Infrastructure Design Engineer (5640 hrs = 3 FTEs)
    position1 = {
        'labor_category': 'Senior Infrastructure Design Engineer',
        'hours_per_year': {'1': 5640, '2': 5640, '3': 5640, '4': 5640, '5': 5640},
        'location': 'Virginia',
        'soc_code': '151241',
        'wage_50th': 100000
    }

    print('\nTest 1: Senior Infrastructure Design Engineer (5640 hrs)')
    print('Expected: 3 individual positions of 1880 hours each')

    split_positions = split_multi_year_position(position1, max_hours=1880)
    print(f'Result: {len(split_positions)} positions created')

    for idx, pos in enumerate(split_positions, 1):
        year1_hours = pos['hours_per_year'].get('1', 0)
        print(f'  Position {idx}: Year 1 = {year1_hours} hours')

    if len(split_positions) == 3:
        print('✓ CORRECT: Split into 3 positions')
    else:
        print(f'✗ WRONG: Expected 3, got {len(split_positions)}')

    # Test case 2: Systems Administrator (Windows) (52640 hrs = 28 FTEs)
    print('\n' + '='*80)
    position2 = {
        'labor_category': 'Systems Administrator (Windows)',
        'hours_per_year': {'1': 52640, '2': 56400, '3': 56400, '4': 56400, '5': 56400},
        'location': 'Virginia',
        'soc_code': '151232',
        'wage_50th': 80000
    }

    print('\nTest 2: Systems Administrator (Windows) (52640 hrs)')
    print('Expected: 28 individual positions of 1880 hours each')

    split_positions = split_multi_year_position(position2, max_hours=1880)
    print(f'Result: {len(split_positions)} positions created')

    # Show first 3 and last 3
    print('  First 3 positions:')
    for idx in range(min(3, len(split_positions))):
        pos = split_positions[idx]
        year1_hours = pos['hours_per_year'].get('1', 0)
        print(f'    Position {idx+1}: Year 1 = {year1_hours} hours')

    if len(split_positions) > 3:
        print('  ...')
        print('  Last 3 positions:')
        for idx in range(max(3, len(split_positions) - 3), len(split_positions)):
            pos = split_positions[idx]
            year1_hours = pos['hours_per_year'].get('1', 0)
            print(f'    Position {idx+1}: Year 1 = {year1_hours} hours')

    if len(split_positions) == 28:
        print('✓ CORRECT: Split into 28 positions')
    else:
        print(f'✗ WRONG: Expected 28, got {len(split_positions)}')

    # Test case 3: Single FTE (should not split)
    print('\n' + '='*80)
    position3 = {
        'labor_category': 'Program Manager',
        'hours_per_year': {'1': 1880, '2': 1880, '3': 1880, '4': 1880, '5': 1880},
        'location': 'Virginia',
        'soc_code': '111021',
        'wage_50th': 150000
    }

    print('\nTest 3: Program Manager (1880 hrs)')
    print('Expected: 1 position (no split needed)')

    split_positions = split_multi_year_position(position3, max_hours=1880)
    print(f'Result: {len(split_positions)} position(s)')

    if len(split_positions) == 1:
        print('✓ CORRECT: No split (single FTE)')
    else:
        print(f'✗ WRONG: Expected 1, got {len(split_positions)}')


if __name__ == '__main__':
    test_splitting()
