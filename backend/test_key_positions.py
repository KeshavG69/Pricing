"""Test script to verify is_key_position extraction from PDF."""

import asyncio
from client.jd_parser import parse_documents_to_dataframe

async def main():
    pdf_path = "/Users/keshav/Downloads/PriceIQ Personnel Qualifications (1).pdf"

    # Also check MongoDB storage
    print("\n" + "="*60)
    print("Checking MongoDB for stored is_key_position fields...")
    print("="*60)

    try:
        from auth.database import get_mongodb_client
        mongodb = get_mongodb_client()
        db = mongodb.get_database()

        # Find a recent proposal with jobs
        proposal = db.proposals.find_one(
            {"jobs": {"$exists": True, "$ne": []}},
            sort=[("created_at", -1)]
        )

        if proposal:
            print(f"\nFound proposal: {proposal.get('name', 'Unknown')}")
            jobs = proposal.get("jobs", [])
            print(f"Jobs count: {len(jobs)}")

            # Check if is_key_position field exists in jobs
            if jobs:
                first_job = jobs[0]
                has_key_field = "is_key_position" in first_job
                print(f"\nis_key_position field in MongoDB: {'YES' if has_key_field else 'NO'}")

                if has_key_field:
                    key_count = sum(1 for j in jobs if j.get("is_key_position"))
                    print(f"Key positions in this proposal: {key_count}/{len(jobs)}")
                else:
                    print("\nNOTE: is_key_position not in stored jobs.")
                    print("This proposal was created before the feature was added.")
                    print("New uploads will include is_key_position.")
        else:
            print("No proposals with jobs found in MongoDB")
    except Exception as e:
        print(f"MongoDB check failed: {e}")

    print(f"\n{'='*60}")
    print(f"Testing Key Position Extraction")
    print(f"{'='*60}")
    print(f"PDF: {pdf_path}\n")

    # Parse the document
    result = await parse_documents_to_dataframe([pdf_path])

    df = result["df"]

    print(f"\n{'='*60}")
    print(f"RESULTS: {len(df)} positions extracted")
    print(f"{'='*60}\n")

    # Check for is_key_position column
    if "is_key_position" not in df.columns:
        print("WARNING: is_key_position column not found in DataFrame!")
        print(f"Available columns: {list(df.columns)}")
        return

    # Display all positions with their key position status
    print(f"{'Labor Category':<50} | {'Key Position?':<12} | {'Hours (Y1)':<10}")
    print("-" * 80)

    key_count = 0
    for idx, row in df.iterrows():
        labor_cat = row["labor_category"][:48] if len(row["labor_category"]) > 48 else row["labor_category"]
        is_key = row.get("is_key_position", False)
        hours_y1 = row.get("hours_per_year", {}).get("1", "N/A") if row.get("hours_per_year") else "N/A"

        key_marker = "YES" if is_key else "No"
        if is_key:
            key_count += 1

        print(f"{labor_cat:<50} | {key_marker:<12} | {hours_y1:<10}")

    print("-" * 80)
    print(f"\nSummary:")
    print(f"  - Total positions: {len(df)}")
    print(f"  - Key positions (from doc): {key_count}")
    print(f"  - Non-key positions: {len(df) - key_count}")

    # Also check for PM/FA positions that would be excluded via fallback
    pm_fa_count = 0
    for idx, row in df.iterrows():
        lc = row["labor_category"].lower()
        if "program manager" in lc or "financial analyst" in lc:
            pm_fa_count += 1
            if not row.get("is_key_position", False):
                print(f"\n  NOTE: '{row['labor_category']}' will be excluded via PM/FA fallback (not flagged by LLM)")

    print(f"\n  - PM/FA positions (fallback check): {pm_fa_count}")

    # Show travel and ODCs if any
    if result.get("travel"):
        print(f"\nTravel items: {len(result['travel'])}")
    if result.get("odcs"):
        print(f"ODC items: {len(result['odcs'])}")


if __name__ == "__main__":
    asyncio.run(main())
