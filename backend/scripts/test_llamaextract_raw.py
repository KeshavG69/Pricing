"""Test to see raw LlamaExtract output before processing."""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from client.jd_parser import extract_with_llamaextract


def test_raw_extraction():
    """Test raw LlamaExtract output."""

    file_path = "/Users/keshav/Downloads/SURFLANT Ingestion.xlsx"

    print("Testing RAW LlamaExtract output (before FTE multiplication)...")
    print("=" * 80)

    # Extract directly
    extraction = extract_with_llamaextract(file_path, mode="balanced")

    print(f"\nExtracted {len(extraction.positions)} positions\n")

    for idx, position in enumerate(extraction.positions[:5], 1):
        print(f"{idx}. {position.labor_category}")
        print(f"   FTEs: {position.ftes}")
        print(f"   Hours (single value): {position.hours}")
        print(f"   Hours per year: {position.hours_per_year}")
        print()


if __name__ == "__main__":
    test_raw_extraction()
