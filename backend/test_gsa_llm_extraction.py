"""
Test script for GSA contract extraction - full pipeline with dual-parser system.

Usage:
    cd backend
    uv run python test_gsa_llm_extraction.py [file_path]

This tests:
1. LlamaExtract metadata extraction (contract number, dates, company, year columns)
2. Table-aware chunking (optimized for GSA documents)
3. DUAL-PARSER EXTRACTION:
   a) Description Parser: extracts titles, SINs, descriptions, experience
   b) Rate Parser: extracts titles, SINs, hourly rates by year
4. Intelligent merging: matches descriptions with rates by title + SIN (fuzzy matching)
5. Title-based deduplication

This approach solves the common GSA problem where descriptions are on different pages
from rate tables, ensuring complete data extraction.
"""

import sys
import os
import json
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from client.gsa_parser import parse_gsa_contract


def test_full_extraction(file_path: str):
    """Test the full GSA contract extraction pipeline."""
    print(f"\n{'='*80}")
    print(f"Testing GSA Contract Extraction - Full Pipeline")
    print(f"{'='*80}")
    print(f"File: {file_path}\n")

    print("Pipeline:")
    print("  0. ADAPTIVE ROUTING:")
    print("     • Estimate page count based on file format")
    print("     • < 50 pages: Full document strategy (90-95% accuracy)")
    print("     • ≥ 50 pages: Chunking strategy (75-85% accuracy)")
    print("  1. LlamaExtract -> Metadata (contract #, dates, company, year columns) [PARALLEL]")
    print("  2. Text Extraction -> Full document OR table-aware chunking [PARALLEL]")
    print("  3. DUAL-PARSER EXTRACTION (TRUE parallel with dedicated workers):")
    print("     a) Description Parser -> 5 workers extracting job titles, SINs, descriptions, experience")
    print("     b) Rate Parser -> 5 workers extracting job titles, SINs, hourly rates by year")
    print("     Total: 10 workers (5+5) processing simultaneously")
    print("  4. Merge -> Match descriptions with rates by title + SIN (fuzzy matching)")
    print("  5. Deduplication: by title (case-insensitive)")
    print(f"\n{'='*80}\n")

    # Run the full extraction
    result = parse_gsa_contract(file_path)

    # Display results
    print(f"\n{'='*80}")
    print(f"EXTRACTION RESULTS")
    print(f"{'='*80}")

    print(f"\n📋 Contract Metadata:")
    print(f"   Contract Number: {result.get('contract_number', 'N/A')}")
    print(f"   Company Name: {result.get('company_name', 'N/A')}")
    print(f"   Start Date: {result.get('contract_start_date', 'N/A')}")
    print(f"   End Date: {result.get('contract_end_date', 'N/A')}")
    print(f"   Needs Date: {result.get('needs_date', False)}")

    labor_categories = result.get('labor_categories', [])
    print(f"\n📊 Labor Categories: {len(labor_categories)} total")

    # Analyze year keys
    year_keys = set()
    for cat in labor_categories:
        rates = cat.get('rates_by_year', {})
        year_keys.update(rates.keys())

    if year_keys:
        sorted_years = sorted(year_keys, key=lambda x: int(x) if x.isdigit() else 0)
        print(f"   Year keys found: {', '.join(sorted_years)}")

    # Analyze data completeness
    with_descriptions = [c for c in labor_categories if c.get('description')]
    with_experience = [c for c in labor_categories if c.get('experience')]
    with_rates = [c for c in labor_categories if c.get('rates_by_year')]
    with_both = [c for c in labor_categories if c.get('description') and c.get('rates_by_year')]

    print(f"\n   Data Completeness:")
    print(f"     ✓ With descriptions: {len(with_descriptions)}/{len(labor_categories)}")
    print(f"     ✓ With experience: {len(with_experience)}/{len(labor_categories)}")
    print(f"     ✓ With rates: {len(with_rates)}/{len(labor_categories)}")
    print(f"     ✓ Complete (desc + rates): {len(with_both)}/{len(labor_categories)}")

    # Show first 5
    if labor_categories:
        print(f"\n   First 5 categories:")
        for i, cat in enumerate(labor_categories[:5]):
            rates = cat.get('rates_by_year', {})
            desc = cat.get('description', '')
            exp = cat.get('experience', '')

            print(f"     {i+1}. {cat['title']}")

            if rates:
                first_rate = list(rates.values())[0]
                rate_str = f"${first_rate:.2f}"
                years = list(rates.keys())
                print(f"        Rate: {rate_str} | Years: {', '.join(years)}")
            else:
                print(f"        Rate: N/A")

            if desc:
                desc_preview = desc[:80] + '...' if len(desc) > 80 else desc
                print(f"        Desc: {desc_preview}")

            if exp:
                print(f"        Exp: {exp}")

        # Show last 5 if we have many
        if len(labor_categories) > 10:
            print(f"\n   Last 5 categories:")
            for i, cat in enumerate(labor_categories[-5:]):
                idx = len(labor_categories) - 5 + i + 1
                rates = cat.get('rates_by_year', {})
                desc = cat.get('description', '')
                exp = cat.get('experience', '')

                print(f"     {idx}. {cat['title']}")

                if rates:
                    first_rate = list(rates.values())[0]
                    rate_str = f"${first_rate:.2f}"
                    years = list(rates.keys())
                    print(f"         Rate: {rate_str} | Years: {', '.join(years)}")
                else:
                    print(f"         Rate: N/A")

                if desc:
                    desc_preview = desc[:80] + '...' if len(desc) > 80 else desc
                    print(f"         Desc: {desc_preview}")

                if exp:
                    print(f"         Exp: {exp}")

    # Check for issues
    no_rates = [c for c in labor_categories if not c.get('rates_by_year')]
    no_descriptions = [c for c in labor_categories if not c.get('description')]
    wrong_years = [c for c in labor_categories
                   if c.get('rates_by_year') and '1' in c.get('rates_by_year', {})
                   and '6' not in c.get('rates_by_year', {})]

    print(f"\n   Issues:")
    if no_rates:
        print(f"     ⚠️  Categories without rates: {len(no_rates)}")
        if len(no_rates) <= 3:
            for cat in no_rates:
                print(f"        - {cat['title']}")

    if no_descriptions:
        print(f"     ⚠️  Categories without descriptions: {len(no_descriptions)}")
        if len(no_descriptions) <= 3:
            for cat in no_descriptions:
                print(f"        - {cat['title']}")

    if wrong_years:
        print(f"     ❌ Categories with wrong years (1-5 instead of 6-10): {len(wrong_years)}")
        for cat in wrong_years[:3]:
            print(f"        - {cat['title']}: {list(cat['rates_by_year'].keys())}")

    if not no_rates and not no_descriptions and not wrong_years:
        print(f"     ✅ No issues found!")

    # Save results
    output_file = 'gsa_extraction_results.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            'contract_number': result.get('contract_number'),
            'company_name': result.get('company_name'),
            'contract_start_date': result.get('contract_start_date'),
            'contract_end_date': result.get('contract_end_date'),
            'needs_date': result.get('needs_date'),
            'total_categories': len(labor_categories),
            'year_keys': list(year_keys),
            'labor_categories': labor_categories
        }, f, indent=2)

    print(f"\n✅ Results saved to: {output_file}")
    print(f"\n{'='*80}")
    print(f"Test Complete!")
    print(f"{'='*80}\n")

    return result


if __name__ == "__main__":
    # Default test file
    default_file = '/Users/keshav/Downloads/FSS Price List.rtf'

    if len(sys.argv) >= 2:
        file_path = sys.argv[1]
    else:
        file_path = default_file

    if not os.path.exists(file_path):
        print(f"Error: File not found: {file_path}")
        print(f"\nUsage: uv run python test_gsa_llm_extraction.py <file_path>")
        sys.exit(1)

    test_full_extraction(file_path)
