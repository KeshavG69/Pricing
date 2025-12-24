"""Detailed analysis of Personnel Qualifications PDF extraction."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from client.jd_parser import extract_with_llamaextract


def analyze_pdf():
    """Analyze Personnel Qualifications PDF in detail."""

    print('Extracting raw data from Personnel Qualifications PDF...')
    print('='*80)

    extraction = extract_with_llamaextract('/Users/keshav/Downloads/Personnel Qualifications.pdf', mode='balanced')

    print(f'\nDocument Metadata:')
    print(f'  Location: {extraction.metadata.location}')
    print(f'  Project: {extraction.metadata.project_name}')
    print(f'  Base Years: {extraction.metadata.base_years}')
    print(f'  Option Years: {extraction.metadata.option_years}')
    print(f'  Total Years: {extraction.metadata.total_years}')
    print(f'  Standard FTE Hours: {extraction.metadata.standard_fte_hours}')

    print(f'\nExtracted {len(extraction.positions)} positions')
    print('='*80)

    # Check positions with FTE > 1
    print('\nPositions with FTE > 1:')
    multi_fte_found = False
    for idx, pos in enumerate(extraction.positions, 1):
        if pos.ftes and pos.ftes > 1:
            multi_fte_found = True
            print(f'\n{idx}. {pos.labor_category}')
            print(f'   FTEs: {pos.ftes}')
            print(f'   Hours (per person): {pos.hours}')
            if pos.hours_per_year:
                print(f'   Hours per year (per person):')
                for yh in pos.hours_per_year[:5]:
                    print(f'     Year {yh.year}: {yh.hours}')

    if not multi_fte_found:
        print('  None found - all positions have 1 FTE')

    print('\n' + '='*80)
    print('All positions summary:')
    print('='*80)

    for idx, pos in enumerate(extraction.positions, 1):
        fte_count = pos.ftes or 1
        fte_label = f'{fte_count} FTE' if fte_count == 1 else f'{fte_count} FTEs'

        if pos.hours_per_year:
            hours = pos.hours_per_year[0].hours
        else:
            hours = pos.hours or 'N/A'

        print(f'{idx:2d}. [{fte_label:7s}] {pos.labor_category:<55s} Hours: {hours}')


if __name__ == '__main__':
    analyze_pdf()
