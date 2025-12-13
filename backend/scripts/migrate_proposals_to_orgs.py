"""
Migration script to add organization_id to existing proposals.

Finds proposals without organization_id and sets it based on the user's organization.
"""

from auth.database import MongoDB
from bson import ObjectId


def migrate_proposals_to_organizations():
    """Add organization_id to existing proposals based on user's organization."""
    db = MongoDB.get_database()
    proposals_collection = db["proposals"]
    users_collection = db["users"]

    print("Starting proposal migration to add organization_id...")

    # Find all proposals without organization_id
    proposals_without_org = proposals_collection.find({
        "organization_id": {"$exists": False}
    })

    migrated_count = 0
    skipped_count = 0
    error_count = 0

    for proposal in proposals_without_org:
        try:
            user_id = proposal.get("user_id")

            if not user_id:
                print(f"  ⚠ Proposal {proposal['_id']} has no user_id, skipping")
                skipped_count += 1
                continue

            # Convert string user_id to ObjectId if needed
            if isinstance(user_id, str):
                user_id = ObjectId(user_id)

            # Get user's current organization
            user = users_collection.find_one({"_id": user_id})

            if not user:
                print(f"  ⚠ User {user_id} not found for proposal {proposal['_id']}, skipping")
                skipped_count += 1
                continue

            # Get organization_id from user
            org_id = user.get("current_organization_id")

            # Fallback to old single-org model
            if not org_id:
                org_id = user.get("organization_id")

            if not org_id:
                print(f"  ⚠ User {user_id} has no organization for proposal {proposal['_id']}, skipping")
                skipped_count += 1
                continue

            # Update proposal with organization_id
            proposals_collection.update_one(
                {"_id": proposal["_id"]},
                {
                    "$set": {
                        "organization_id": org_id,
                        "visibility": "private",
                        "shared_with": []
                    }
                }
            )

            print(f"  ✓ Migrated proposal {proposal['_id']} to organization {org_id}")
            migrated_count += 1

        except Exception as e:
            print(f"  ✗ Error migrating proposal {proposal.get('_id')}: {str(e)}")
            error_count += 1

    print(f"\n✅ Migration complete!")
    print(f"   Migrated: {migrated_count} proposals")
    print(f"   Skipped: {skipped_count} proposals")
    print(f"   Errors: {error_count} proposals")


if __name__ == "__main__":
    migrate_proposals_to_organizations()
