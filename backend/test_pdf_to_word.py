"""
Test script to convert PDF to DOCX and compare parsing results.
"""

import sys
import os
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from client.jd_parser import extract_with_llamaextract


def convert_pdf_to_docx(pdf_path: str, output_docx_path: str) -> bool:
    """
    Convert PDF to DOCX using pdf2docx library.

    Install: pip install pdf2docx
    """
    try:
        from pdf2docx import Converter

        print(f"Converting PDF to DOCX...")
        print(f"  Input:  {pdf_path}")
        print(f"  Output: {output_docx_path}")

        cv = Converter(pdf_path)
        cv.convert(output_docx_path, start=0, end=None)
        cv.close()

        print(f"✓ Conversion complete!")
        return True

    except ImportError:
        print("❌ pdf2docx not installed. Installing...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pdf2docx"])
        print("✓ Installed pdf2docx. Please run the script again.")
        return False
    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_parsing(file_path: str, label: str):
    """Test parsing a document and print summary."""
    print(f"\n{'='*60}")
    print(f"Testing {label}: {Path(file_path).name}")
    print(f"{'='*60}")

    try:
        extraction = extract_with_llamaextract(file_path, mode="premium")

        print(f"\n✓ Extraction successful!")
        print(f"\nMetadata:")
        print(f"  Location: {extraction.metadata.location}")
        print(f"  Project: {extraction.metadata.project_name}")
        print(f"  Base years: {extraction.metadata.base_years}")
        print(f"  Option years: {extraction.metadata.option_years}")
        print(f"  Total years: {extraction.metadata.total_years}")
        print(f"  Standard FTE hours: {extraction.metadata.standard_fte_hours}")

        print(f"\nPositions: {len(extraction.positions)}")
        for i, pos in enumerate(extraction.positions[:5], 1):  # Show first 5
            print(f"  {i}. {pos.labor_category}")
            if pos.description:
                desc_preview = pos.description[:100] + "..." if len(pos.description) > 100 else pos.description
                print(f"     Description: {desc_preview}")
            print(f"     Experience: {pos.experience} years" if pos.experience else "     Experience: Not specified")
            print(f"     Location: {pos.location or 'Not specified'}")

            if pos.hours_per_year:
                hours_summary = {yh.year: yh.hours for yh in pos.hours_per_year}
                print(f"     Hours per year: {hours_summary}")
            elif pos.hours:
                print(f"     Total hours: {pos.hours}")

        if len(extraction.positions) > 5:
            print(f"  ... and {len(extraction.positions) - 5} more positions")

        if extraction.travel:
            print(f"\nTravel items: {len(extraction.travel)}")
            for travel in extraction.travel:
                print(f"  - {travel.description}")

        if extraction.odcs:
            print(f"\nODC items: {len(extraction.odcs)}")
            for odc in extraction.odcs:
                print(f"  - {odc.category}: {odc.description or 'N/A'}")

        return extraction

    except Exception as e:
        print(f"\n❌ Extraction failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    pdf_path = "/Users/keshav/Downloads/PriceIQ Personnel Qualifications (1) (1).pdf"

    # Check if PDF exists
    if not os.path.exists(pdf_path):
        print(f"❌ PDF not found: {pdf_path}")
        return

    # Output DOCX path
    docx_path = pdf_path.replace(".pdf", "_converted.docx")

    print("="*60)
    print("PDF to DOCX Conversion & Parsing Test")
    print("="*60)

    # Step 1: Test parsing original PDF
    pdf_extraction = test_parsing(pdf_path, "PDF (Original)")

    # Step 2: Convert PDF to DOCX
    print(f"\n{'='*60}")
    print("Converting PDF to DOCX...")
    print(f"{'='*60}")

    if not convert_pdf_to_docx(pdf_path, docx_path):
        print("\n❌ Conversion failed. Exiting.")
        return

    # Step 3: Test parsing converted DOCX
    docx_extraction = test_parsing(docx_path, "DOCX (Converted)")

    # Step 4: Compare results
    print(f"\n{'='*60}")
    print("Comparison Summary")
    print(f"{'='*60}")

    if pdf_extraction and docx_extraction:
        print(f"\nPositions extracted:")
        print(f"  PDF:  {len(pdf_extraction.positions)}")
        print(f"  DOCX: {len(docx_extraction.positions)}")

        if len(pdf_extraction.positions) == len(docx_extraction.positions):
            print(f"  ✓ Same number of positions extracted")
        else:
            print(f"  ⚠️ Different number of positions!")

        print(f"\nMetadata comparison:")
        print(f"  Total years - PDF: {pdf_extraction.metadata.total_years}, DOCX: {docx_extraction.metadata.total_years}")
        print(f"  Location - PDF: {pdf_extraction.metadata.location}, DOCX: {docx_extraction.metadata.location}")

        # Compare first position
        if pdf_extraction.positions and docx_extraction.positions:
            pdf_pos = pdf_extraction.positions[0]
            docx_pos = docx_extraction.positions[0]

            print(f"\nFirst position comparison:")
            print(f"  Labor category - PDF: {pdf_pos.labor_category}")
            print(f"  Labor category - DOCX: {docx_pos.labor_category}")
            print(f"  Match: {'✓' if pdf_pos.labor_category == docx_pos.labor_category else '✗'}")

    print(f"\n{'='*60}")
    print(f"Test complete!")
    print(f"Converted file saved: {docx_path}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
