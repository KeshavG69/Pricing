"""
Test script for PDF extraction with month duration support.

Tests the jd_parser's ability to extract month durations from PDFs.
"""

import sys
import asyncio
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from client.jd_parser import parse_documents_to_dataframe


async def test_pdf_extraction(pdf_path: str):
    """
    Test PDF extraction including month duration parsing.

    Args:
        pdf_path: Path to the PDF file to test
    """
    print(f"\n{'='*80}")
    print(f"Testing PDF Extraction with Month Duration Support")
    print(f"{'='*80}\n")

    print(f"📄 PDF File: {pdf_path}")
    print(f"{'='*80}\n")

    try:
        # Parse the PDF
        df = await parse_documents_to_dataframe([pdf_path])

        print(f"\n{'='*80}")
        print(f"✅ Extraction Successful!")
        print(f"{'='*80}\n")

        # Display DataFrame info
        print(f"📊 Total Positions Extracted: {len(df)}")
        print(f"{'='*80}\n")

        # Display metadata columns
        if not df.empty:
            print(f"📋 Document Metadata:")
            print(f"{'-'*80}")

            # Get metadata from first row
            first_row = df.iloc[0]

            metadata_fields = {
                'Project Name': first_row.get('project_name', 'N/A'),
                'Location': first_row.get('location', 'N/A'),
                'Base Years': first_row.get('base_years', 'N/A'),
                'Option Years': first_row.get('option_years', 'N/A'),
                'Total Years': first_row.get('total_years', 'N/A'),
                'Standard FTE Hours': first_row.get('standard_fte_hours', 'N/A'),
            }

            for field, value in metadata_fields.items():
                print(f"  {field}: {value}")

            # Display months_per_year if present
            months_per_year = first_row.get('months_per_year', None)
            print(f"\n  Months Per Year:")
            if months_per_year:
                if isinstance(months_per_year, dict):
                    for year, months in sorted(months_per_year.items(), key=lambda x: int(x[0])):
                        year_label = "Base Year" if year == "1" else f"Option Year {int(year) - 1}"
                        month_label = f"{months} months"
                        status = "⚠️ PARTIAL" if months != 12 else "✓ Full year"
                        print(f"    Year {year} ({year_label}): {month_label} {status}")
                else:
                    print(f"    {months_per_year}")
            else:
                print(f"    None (will default to 12 months per year)")

            print(f"\n{'='*80}\n")

            # Display sample positions
            print(f"📝 Sample Positions (first 5):")
            print(f"{'-'*80}\n")

            sample_df = df.head(5)
            for idx, row in sample_df.iterrows():
                print(f"Position {idx + 1}:")
                print(f"  Labor Category: {row['labor_category']}")
                print(f"  Experience: {row.get('experience', 'N/A')} years")
                print(f"  Location: {row.get('location', 'N/A')}")

                # Display hours_per_year
                hours_per_year = row.get('hours_per_year', {})
                if hours_per_year and isinstance(hours_per_year, dict):
                    hours_list = [f"Year {y}: {h}h" for y, h in sorted(hours_per_year.items(), key=lambda x: int(x[0]))]
                    print(f"  Hours: {', '.join(hours_list)}")
                else:
                    print(f"  Hours: {row.get('hours', 'N/A')}")

                print()

            print(f"{'='*80}\n")

            # Display full DataFrame columns
            print(f"📋 All Extracted Columns:")
            print(f"{'-'*80}")
            for col in df.columns:
                print(f"  - {col}")

            print(f"\n{'='*80}\n")

            # Check for months_per_year consistency
            if 'months_per_year' in df.columns:
                print(f"🔍 Months Per Year Analysis:")
                print(f"{'-'*80}")

                # Check first row's months_per_year (should be consistent across all rows)
                months_data = df.iloc[0]['months_per_year']

                if isinstance(months_data, dict):
                    partial_years = [y for y, m in months_data.items() if m != 12]
                    if partial_years:
                        print(f"  ⚠️  Partial years detected: {', '.join(f'Year {y}' for y in partial_years)}")
                        print(f"  ✅  This means escalation will be prorated for these years!")
                    else:
                        print(f"  ✓  All years are 12 months (no prorating needed)")
                elif months_data is None or str(months_data) == 'nan':
                    print(f"  ℹ️  No month data specified (will default to 12)")

                print(f"\n{'='*80}\n")

        # Success summary
        print(f"✅ Test Completed Successfully!")
        print(f"\n📊 Summary:")
        print(f"  - Positions extracted: {len(df)}")
        print(f"  - Metadata extracted: {'Yes' if not df.empty else 'No'}")
        if not df.empty:
            months_per_year_val = df.iloc[0].get('months_per_year', None)
            print(f"  - Months per year: {'Yes' if months_per_year_val else 'No (defaulting to 12)'}")
        print(f"\n{'='*80}\n")

        return df

    except Exception as e:
        print(f"\n❌ Error during extraction:")
        print(f"{'='*80}")
        print(f"{type(e).__name__}: {str(e)}")
        print(f"{'='*80}\n")

        import traceback
        print("Full traceback:")
        print(traceback.format_exc())

        return None


if __name__ == "__main__":
    # Test with the specified PDF
    pdf_path = "/Users/keshav/Downloads/SeaPort M6785425R3005 Info (1).pdf"

    # Check if file exists
    if not Path(pdf_path).exists():
        print(f"❌ Error: PDF file not found at {pdf_path}")
        sys.exit(1)

    # Run test
    result_df = asyncio.run(test_pdf_extraction(pdf_path))

    # Exit with appropriate code
    sys.exit(0 if result_df is not None else 1)
