"""
Migration script to add first_free_proposal_id to existing organizations.

This field tracks which proposal ID got the free first proposal benefit,
allowing BOTH basic AND advanced analysis to be free for that proposal.
"""

import sys
import os
from datetime import datetime
from bson import ObjectId

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from auth.database import get_mongodb_client
from utils.proposals import get_proposal_crud


def migrate_first_proposal_flag():
    """Add first_free_proposal_id to all organizations (except Rajesh's)."""

    mongodb = get_mongodb_client()
    db = mongodb.get_database()
    orgs_collection = db["organizations"]
    proposals_collection = db["proposals"]
    users_collection = db["users"]

    print("=" * 80)
    print("MIGRATING ORGANIZATIONS - Adding first_free_proposal_id")
    print("=" * 80)

    # Find Rajesh's organization ID
    rajesh_user = users_collection.find_one({"email": {"$regex": "rajesh", "$options": "i"}})
    rajesh_org_id = None
    if rajesh_user:
        # Check for proposal with org_id (since user record doesn't have it)
        rajesh_proposal = proposals_collection.find_one({"user_id": rajesh_user["_id"]})
        if rajesh_proposal and rajesh_proposal.get("organization_id"):
            rajesh_org_id = rajesh_proposal["organization_id"]
            print(f"\n🔍 Found Rajesh's organization: {rajesh_org_id}")
            rajesh_org = orgs_collection.find_one({"_id": ObjectId(rajesh_org_id)})
            if rajesh_org:
                print(f"   Organization name: {rajesh_org.get('name', 'Unknown')}")

    # Get all organizations
    orgs = list(orgs_collection.find({}))
    print(f"\nFound {len(orgs)} organizations to migrate\n")

    updated_count = 0
    skipped_count = 0
    rajesh_skipped = False

    for org in orgs:
        org_id = org["_id"]
        org_name = org.get("name", "Unknown")

        # Skip Rajesh's organization (keep flag unset for free proposal)
        if rajesh_org_id and str(org_id) == str(rajesh_org_id):
            print(f"⭐ SPECIAL: Skipping {org_name} (Rajesh's org - keeping free proposal available)")
            rajesh_skipped = True
            skipped_count += 1
            continue

        # Skip if already has the new flag
        if "first_free_proposal_id" in org:
            print(f"✓ Skipping {org_name} (already migrated)")
            skipped_count += 1
            continue

        # Get org's first proposal (by creation date)
        first_proposal = proposals_collection.find_one(
            {"organization_id": org_id},
            sort=[("created_at", 1)]  # Oldest first
        )

        if first_proposal:
            # Set first_free_proposal_id to their first proposal
            orgs_collection.update_one(
                {"_id": org_id},
                {
                    "$set": {
                        "first_free_proposal_id": first_proposal["_id"],
                        "updated_at": datetime.utcnow()
                    },
                    "$unset": {"first_proposal_used": ""}  # Remove old field if exists
                }
            )
            print(f"✓ Updated {org_name}: first_free_proposal_id = {first_proposal['_id']} (USED)")
            updated_count += 1
        else:
            # No proposals yet - remove old field but don't set new one (they still get free proposal)
            if "first_proposal_used" in org:
                orgs_collection.update_one(
                    {"_id": org_id},
                    {
                        "$unset": {"first_proposal_used": ""},
                        "$set": {"updated_at": datetime.utcnow()}
                    }
                )
            print(f"✓ Updated {org_name}: No proposals yet (FREE AVAILABLE)")
            updated_count += 1

    print("\n" + "=" * 80)
    print(f"MIGRATION COMPLETE")
    print(f"Updated: {updated_count}")
    print(f"Skipped: {skipped_count}")
    if rajesh_skipped:
        print(f"⭐ Rajesh's org kept free proposal available")
    print("=" * 80)


if __name__ == "__main__":
    try:
        migrate_first_proposal_flag()
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
