"""
Download and parse OEWS data from BLS for local wage lookups.
"""

import requests
from pathlib import Path
import pandas as pd
from typing import Dict, Optional

# BLS Download Server URLs (these work without 403 errors)
BLS_BASE = "https://download.bls.gov/pub/time.series/oe/"
ESSENTIAL_FILES = {
    "occupation": "oe.occupation",      # ~260 KB - Occupation codes/titles
    "datatype": "oe.datatype",          # ~500 bytes - Data type codes
    "area": "oe.area",                  # ~20 KB - Geographic areas
    "data": "oe.data.0.Current",        # ~328 MB - All current wage data
    "series": "oe.series",              # ~1.2 GB - Series definitions
}

DATA_DIR = Path("data/oews")


def download_file(filename: str, output_path: Path) -> bool:
    """Download a file from BLS."""
    url = BLS_BASE + filename
    print(f"Downloading {filename}...")

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
    }

    try:
        response = requests.get(url, headers=headers, timeout=120)
        response.raise_for_status()

        output_path.write_bytes(response.content)
        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"  ✓ Downloaded {size_mb:.2f} MB")
        return True

    except Exception as e:
        print(f"  ✗ Failed: {e}")
        return False


def parse_occupation_file() -> pd.DataFrame:
    """Parse occupation codes file into DataFrame."""
    print("\nParsing occupation codes...")

    occ_file = DATA_DIR / "oe.occupation"

    # Tab-delimited: occupation_code, occupation_name
    df = pd.read_csv(
        occ_file,
        sep="\t",
        names=["occupation_code", "occupation_name"],
        dtype=str,
    )

    print(f"  ✓ Loaded {len(df)} occupations")
    return df


def parse_datatype_file() -> pd.DataFrame:
    """Parse data type codes."""
    print("Parsing data types...")

    dt_file = DATA_DIR / "oe.datatype"

    # Tab-delimited: datatype_code, datatype_text
    df = pd.read_csv(
        dt_file,
        sep="\t",
        names=["datatype_code", "datatype_text"],
        dtype=str,
    )

    print(f"  ✓ Loaded {len(df)} data types")
    return df


def parse_area_file() -> pd.DataFrame:
    """Parse area codes file."""
    print("Parsing geographic areas...")

    area_file = DATA_DIR / "oe.area"

    # Tab-delimited: area_code, area_name
    df = pd.read_csv(
        area_file,
        sep="\t",
        names=["area_code", "area_name"],
        dtype=str,
    )

    print(f"  ✓ Loaded {len(df)} areas")
    return df


def parse_data_file_sample(nrows: int = 100000) -> pd.DataFrame:
    """Parse wage data file (sample first N rows due to size)."""
    print(f"Parsing wage data (first {nrows:,} rows)...")

    data_file = DATA_DIR / "oe.data.0.Current"

    # Tab-delimited: series_id, year, period, value, footnote_codes
    df = pd.read_csv(
        data_file,
        sep="\t",
        header=0,  # Has header row
        dtype=str,  # Read all as string first
        nrows=nrows,
    )

    # Clean column names (strip whitespace)
    df.columns = df.columns.str.strip()

    # Convert year to int
    df["year"] = pd.to_numeric(df["year"], errors="coerce")

    # Convert value to float (handle non-numeric)
    df["value"] = pd.to_numeric(df["value"], errors="coerce")

    print(f"  ✓ Loaded {len(df):,} wage records")
    return df


def main():
    """Main setup function."""
    print("=" * 60)
    print("OEWS Data Setup - Downloading from BLS")
    print("=" * 60)

    # Create data directory
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Download essential files (skip the huge series file for now)
    files_to_download = ["occupation", "datatype", "area", "data"]

    for file_key in files_to_download:
        filename = ESSENTIAL_FILES[file_key]
        output_path = DATA_DIR / filename

        # Skip if already downloaded
        if output_path.exists():
            size_mb = output_path.stat().st_size / (1024 * 1024)
            print(f"✓ {filename} already exists ({size_mb:.2f} MB)")
            continue

        success = download_file(filename, output_path)
        if not success:
            print(f"\n⚠️  Failed to download {filename}")
            return

    print("\n" + "=" * 60)
    print("Parsing downloaded files...")
    print("=" * 60)

    # Parse files
    occupations = parse_occupation_file()
    datatypes = parse_datatype_file()
    areas = parse_area_file()
    wage_data = parse_data_file_sample(nrows=100000)  # Sample first 100k rows

    print("\n" + "=" * 60)
    print("OEWS Data Setup Complete!")
    print("=" * 60)
    print(f"\nData location: {DATA_DIR.absolute()}")
    print(f"\nSummary:")
    print(f"  - {len(occupations):,} occupations")
    print(f"  - {len(areas):,} geographic areas")
    print(f"  - {len(wage_data):,} wage records (sampled)")
    print(f"\nTotal download size: ~330 MB")
    print("\nNext step: Create wage lookup function")


if __name__ == "__main__":
    main()
