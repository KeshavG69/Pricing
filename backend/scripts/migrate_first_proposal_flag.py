"""
Migration script to add first_proposal_used flag to existing organizations.

This flag tracks whether an organization has EVER used their free first proposal,
preventing abuse where users delete their first proposal and create another free one.
"""

import sys
import os
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from auth.database import get_mongodb_client
from utils.proposals import get_proposal_crud


def migrate_first_proposal_flag():
    """Add first_proposal_used flag to all organizations."""

    mongodb = get_mongodb_client()
    db = mongodb.get_database()
    orgs_collection = db["organizations"]
    proposal_crud = get_proposal_crud()

    print("=" * 80)
    print("MIGRATING ORGANIZATIONS - Adding first_proposal_used flag")
    print("=" * 80)

    # Get all organizations
    orgs = list(orgs_collection.find({}))
    print(f"\nFound {len(orgs)} organizations to migrate")

    updated_count = 0
    skipped_count = 0

    for org in orgs:
        org_id = org["_id"]
        org_name = org.get("name", "Unknown")

        # Skip if already has the flag
        if "first_proposal_used" in org:
            print(f"✓ Skipping {org_name} (already has flag)")
            skipped_count += 1
            continue

        # Check if org has any proposals (current or deleted)
        # If they have billing records, they've used their free proposal
        billing_collection = db["billing"]
        has_billing = billing_collection.find_one({
            "organization_id": str(org_id),
            "charge_type": "basic",
            "amount_cents": 0  # Free proposal
        })

        # If they have any proposals at all, assume they've used their free one
        proposal_count = proposal_crud.get_org_proposal_count(str(org_id))

        # Set flag based on whether they've created proposals
        first_proposal_used = has_billing is not None or proposal_count > 0

        # Update organization
        orgs_collection.update_one(
            {"_id": org_id},
            {
                "$set": {
                    "first_proposal_used": first_proposal_used,
                    "updated_at": datetime.utcnow()
                }
            }
        )

        status = "USED" if first_proposal_used else "AVAILABLE"
        print(f"✓ Updated {org_name}: first_proposal_used = {first_proposal_used} ({status})")
        updated_count += 1

    print("\n" + "=" * 80)
    print(f"MIGRATION COMPLETE")
    print(f"Updated: {updated_count}")
    print(f"Skipped: {skipped_count}")
    print("=" * 80)


if __name__ == "__main__":
    try:
        migrate_first_proposal_flag()
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
