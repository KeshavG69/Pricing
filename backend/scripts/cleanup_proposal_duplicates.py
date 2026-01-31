"""
Script to remove duplicate jobs data and should_trigger_advanced flag from ALL proposals.

Usage:
    uv run python scripts/cleanup_proposal_duplicates.py
"""

import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from bson import ObjectId
from auth.database import get_mongodb_client
from datetime import datetime

# Set to True to skip confirmation prompt (for non-interactive execution)
AUTO_CONFIRM = True


def cleanup_single_proposal(proposals, proposal_id: str):
    """Remove duplicate jobs array and should_trigger_advanced flag for a single proposal."""

    # Find the proposal
    proposal = proposals.find_one({"_id": ObjectId(proposal_id)})

    if not proposal:
        return {"error": f"Proposal {proposal_id} not found"}

    stats = {
        "proposal_id": proposal_id,
        "name": proposal.get('name', 'Untitled'),
        "removed": [],
        "copied": [],
        "skipped": False
    }

    # Check current state
    has_jobs = "jobs" in proposal
    has_should_trigger = "should_trigger_advanced" in proposal
    has_rates_top = "rates" in proposal
    has_escalation_top = "escalation_rates" in proposal
    has_positions = proposal.get("spreadsheet_data", {}).get("positions") is not None
    has_rates_sd = "rates" in proposal.get("spreadsheet_data", {})
    has_escalation_sd = "escalation_rates" in proposal.get("spreadsheet_data", {})

    # First, ensure data exists in spreadsheet_data before removing duplicates
    set_operations = {}

    # Copy jobs to positions if missing
    if not has_positions and has_jobs:
        jobs = proposal.get("jobs", [])
        if "spreadsheet_data" not in proposal:
            proposal["spreadsheet_data"] = {}
        set_operations["spreadsheet_data.positions"] = jobs
        stats["copied"].append(f"jobs → positions ({len(jobs)} items)")

    # Copy rates if missing in spreadsheet_data
    if not has_rates_sd and has_rates_top:
        set_operations["spreadsheet_data.rates"] = proposal.get("rates")
        stats["copied"].append("rates")

    # Copy escalation_rates if missing in spreadsheet_data
    if not has_escalation_sd and has_escalation_top:
        set_operations["spreadsheet_data.escalation_rates"] = proposal.get("escalation_rates")
        stats["copied"].append("escalation_rates")

    # Apply copy operations if any
    if set_operations:
        set_operations["updated_at"] = datetime.utcnow()
        proposals.update_one(
            {"_id": ObjectId(proposal_id)},
            {"$set": set_operations}
        )

    # Prepare remove operations
    unset_fields = {}

    if has_jobs:
        unset_fields["jobs"] = ""
        stats["removed"].append(f"jobs ({len(proposal.get('jobs', []))} items)")

    if has_should_trigger:
        unset_fields["should_trigger_advanced"] = ""
        stats["removed"].append("should_trigger_advanced")

    # Only remove top-level rates if they also exist in spreadsheet_data (duplicate)
    if has_rates_top and (has_rates_sd or "spreadsheet_data.rates" in set_operations):
        unset_fields["rates"] = ""
        stats["removed"].append("rates (top-level)")

    if has_escalation_top and (has_escalation_sd or "spreadsheet_data.escalation_rates" in set_operations):
        unset_fields["escalation_rates"] = ""
        stats["removed"].append("escalation_rates (top-level)")

    # Skip if nothing to do
    if not unset_fields:
        stats["skipped"] = True
        return stats

    # Perform cleanup
    result = proposals.update_one(
        {"_id": ObjectId(proposal_id)},
        {
            "$unset": unset_fields,
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    stats["modified"] = result.modified_count > 0

    return stats


def cleanup_all_proposals():
    """Clean up all proposals in the database."""

    # Connect to MongoDB
    mongodb = get_mongodb_client()
    db = mongodb.get_database()
    proposals = db["proposals"]

    # Get all proposal IDs
    all_proposals = list(proposals.find({}, {"_id": 1, "name": 1}))

    total = len(all_proposals)
    print(f"\n📋 Found {total} proposals to process")

    if total == 0:
        print("✅ No proposals to clean up")
        return

    # Confirm before proceeding
    if not AUTO_CONFIRM:
        confirm = input(f"\n⚠️  About to modify {total} proposals. Proceed? (yes/no): ")
        if confirm.lower() != "yes":
            print("❌ Cleanup cancelled")
            return

    print("\n" + "="*60)
    print("Starting cleanup...")
    print("="*60)

    # Track statistics
    results = {
        "total": total,
        "modified": 0,
        "skipped": 0,
        "errors": 0,
        "removed_items": {
            "jobs": 0,
            "should_trigger_advanced": 0,
            "rates": 0,
            "escalation_rates": 0
        },
        "copied_items": {
            "positions": 0,
            "rates": 0,
            "escalation_rates": 0
        }
    }

    # Process each proposal
    for i, prop in enumerate(all_proposals, 1):
        proposal_id = str(prop["_id"])
        name = prop.get("name", "Untitled")

        # Show progress
        print(f"\n[{i}/{total}] Processing: {name[:50]}")

        try:
            stats = cleanup_single_proposal(proposals, proposal_id)

            if "error" in stats:
                print(f"   ❌ {stats['error']}")
                results["errors"] += 1
            elif stats["skipped"]:
                print(f"   ⏭️  Skipped (already clean)")
                results["skipped"] += 1
            else:
                print(f"   ✅ Modified")
                if stats.get("removed"):
                    print(f"      Removed: {', '.join(stats['removed'])}")
                if stats.get("copied"):
                    print(f"      Copied: {', '.join(stats['copied'])}")

                results["modified"] += 1

                # Track item counts
                for item in stats.get("removed", []):
                    if "jobs" in item:
                        results["removed_items"]["jobs"] += 1
                    elif "should_trigger_advanced" in item:
                        results["removed_items"]["should_trigger_advanced"] += 1
                    elif "rates (top-level)" in item:
                        results["removed_items"]["rates"] += 1
                    elif "escalation_rates (top-level)" in item:
                        results["removed_items"]["escalation_rates"] += 1

                for item in stats.get("copied", []):
                    if "positions" in item:
                        results["copied_items"]["positions"] += 1
                    elif item == "rates":
                        results["copied_items"]["rates"] += 1
                    elif item == "escalation_rates":
                        results["copied_items"]["escalation_rates"] += 1

        except Exception as e:
            print(f"   ❌ Error: {str(e)}")
            results["errors"] += 1

    # Print summary
    print("\n" + "="*60)
    print("CLEANUP SUMMARY")
    print("="*60)
    print(f"Total proposals: {results['total']}")
    print(f"Modified: {results['modified']}")
    print(f"Skipped (already clean): {results['skipped']}")
    print(f"Errors: {results['errors']}")

    print(f"\n📊 Items Removed:")
    print(f"   - jobs arrays: {results['removed_items']['jobs']}")
    print(f"   - should_trigger_advanced flags: {results['removed_items']['should_trigger_advanced']}")
    print(f"   - rates (top-level): {results['removed_items']['rates']}")
    print(f"   - escalation_rates (top-level): {results['removed_items']['escalation_rates']}")

    print(f"\n📊 Items Copied to spreadsheet_data:")
    print(f"   - positions: {results['copied_items']['positions']}")
    print(f"   - rates: {results['copied_items']['rates']}")
    print(f"   - escalation_rates: {results['copied_items']['escalation_rates']}")

    print("\n✅ Cleanup complete!")


if __name__ == "__main__":
    print("=" * 60)
    print("Proposal Cleanup Script - Remove ALL Duplicate Data")
    print("=" * 60)
    cleanup_all_proposals()
    print("\n" + "=" * 60)
