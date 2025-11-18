"""Test script for job description extraction."""

import json
import pandas as pd
from client.unstructured import extract_document_by_page
from client.jd_parser import parse_page_for_jds


def extract_all_jds(file_path: str) -> list[dict]:
    """
    Extract all job descriptions from a document.

    Args:
        file_path: Path to the document

    Returns:
        List of job description dictionaries
    """
    print(f"Extracting text from: {file_path}")
    pages = extract_document_by_page(file_path)
    print(f"Found {len(pages)} pages")

    all_jds = []
    for page_num, page_text in pages.items():
        print(f"\nProcessing page {page_num}...")
        result = parse_page_for_jds(page_text)

        if result.job_descriptions:
            print(f"  Found {len(result.job_descriptions)} JD(s)")
            for jd in result.job_descriptions:
                all_jds.append(jd.model_dump())
        else:
            print("  No JDs found")

    return all_jds


def export_to_excel(jds: list[dict], output_file: str):
    """
    Export job descriptions to Excel file.

    Args:
        jds: List of job description dictionaries
        output_file: Path to output Excel file
    """
    df = pd.DataFrame(jds)

    # Rename columns to match expected format
    df.rename(columns={
        'labor_category': 'Labor Category',
        'experience': 'Experience',
        'location': 'Location',
        'hours': 'Hours'
    }, inplace=True)

    # Reorder columns
    columns = ['Labor Category', 'Experience', 'Location', 'Hours']
    df = df[columns]

    df.to_excel(output_file, index=False)
    print(f"Excel file saved to: {output_file}")


if __name__ == "__main__":
    file_path = "Labor Information.pdf"
    print("HELLO")

    jds = extract_all_jds(file_path)

    print(f"\n{'='*60}")
    print(f"Total JDs extracted: {len(jds)}")
    print(f"{'='*60}\n")

    # Save to JSON
    json_file = "extracted_jds.json"
    with open(json_file, "w") as f:
        json.dump(jds, f, indent=2)
    print(f"JSON saved to: {json_file}")

    # Save to Excel
    excel_file = "extracted_jds.xlsx"
    export_to_excel(jds, excel_file)

    print("\nSample output:")
    print(json.dumps(jds[:3] if len(jds) > 3 else jds, indent=2))
