"""Inspect a single proposal document in MongoDB to diagnose missing data."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bson import ObjectId
from pymongo import MongoClient

from app.settings import settings

PROPOSAL_ID = "69eba92aa7072d3882c189dc"


def main():
    db_name = os.environ.get("MONGODB_DATABASE_OVERRIDE", "priceiq")
    client = MongoClient(settings.MONGODB_URL)
    db = client[db_name]
    print(f"Using database: {db_name}")

    proposal = db.proposals.find_one({"_id": ObjectId(PROPOSAL_ID)})
    if not proposal:
        print(f"NOT FOUND: {PROPOSAL_ID}")
        return

    print("=" * 60)
    print(f"Proposal: {proposal.get('name')}  status={proposal.get('status')}")
    print(f"Total top-level fields: {len(proposal)}")
    print("=" * 60)
    for k, v in proposal.items():
        if isinstance(v, (list, dict)):
            size = len(v)
            print(f"  {k}: {type(v).__name__}(len={size})")
        else:
            vs = repr(v)
            print(f"  {k}: {vs[:100]}")

    print("\n--- spreadsheet_data inspection ---")
    sd = proposal.get("spreadsheet_data")
    if sd is None:
        print("spreadsheet_data is MISSING / None")
    elif isinstance(sd, dict):
        print(f"spreadsheet_data keys: {list(sd.keys())}")
        for k, v in sd.items():
            if isinstance(v, (list, dict)):
                print(f"  {k}: {type(v).__name__}(len={len(v)})")
            else:
                print(f"  {k}: {repr(v)[:100]}")
    else:
        print(f"spreadsheet_data type: {type(sd).__name__}")

    print("\n--- jobs inspection ---")
    jobs = proposal.get("jobs")
    if jobs is None:
        print("jobs: MISSING")
    else:
        print(f"jobs: len={len(jobs)}")
        if jobs:
            print(f"  first job keys: {list(jobs[0].keys())[:20]}")

    print("\n--- rates inspection ---")
    rates = (sd or {}).get("rates")
    if rates:
        for k, v in rates.items():
            print(f"  {k}: {repr(v)[:80]}")

    print("\n--- first position inspection ---")
    positions = (sd or {}).get("positions") or []
    if positions:
        first = positions[0]
        print(f"  keys: {list(first.keys())}")
        for k, v in first.items():
            if isinstance(v, (dict, list)):
                print(f"  {k}: {type(v).__name__}(len={len(v)}) -> {repr(v)[:120]}")
            else:
                print(f"  {k}: {repr(v)[:120]}")

        # Check for positions with zero/missing critical data
        zero_rate_count = sum(1 for p in positions if not p.get("rate"))
        zero_hours_count = sum(1 for p in positions if not p.get("hours_per_year") or not any(p.get("hours_per_year", {}).values()))
        missing_lc_count = sum(1 for p in positions if not p.get("labor_category"))
        print(f"\n  positions with no rate: {zero_rate_count}/{len(positions)}")
        print(f"  positions with no hours: {zero_hours_count}/{len(positions)}")
        print(f"  positions with no labor_category: {missing_lc_count}/{len(positions)}")

    print("\n--- metadata inspection ---")
    md = proposal.get("metadata") or {}
    for k, v in md.items():
        print(f"  {k}: {repr(v)[:120]}")

    print("\n--- wage_source inspection ---")
    ws = proposal.get("wage_source") or {}
    for k, v in ws.items():
        print(f"  {k}: {repr(v)[:120]}")

    print("\n--- sample of positions with wage_source ---")
    positions = (sd or {}).get("positions") or []
    ws_counts = {}
    for p in positions:
        k = p.get("wage_source")
        ws_counts[k] = ws_counts.get(k, 0) + 1
    print(f"  wage_source distribution across positions: {ws_counts}")

    # Any position that DID get data?
    any_with_wage = [p for p in positions if p.get("selected_wage") or p.get("soc_code")]
    print(f"  positions with ANY wage data: {len(any_with_wage)}/{len(positions)}")


if __name__ == "__main__":
    main()
