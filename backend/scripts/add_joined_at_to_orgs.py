"""
Migration script: Add joinedAt timestamps to existing organization memberships.

For users who are already in organizations but don't have a joinedAt field,
we'll use their account createdAt date as a fallback.
"""

from pymongo import MongoClient
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()


def add_joined_at_to_organizations():
    """Add joinedAt field to all organization memberships that are missing it"""

    # Connect to MongoDB
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    mongodb_database = os.getenv("MONGODB_DATABASE", "price-qastage01")

    client = MongoClient(
        mongodb_url,
        serverSelectionTimeoutMS=20000,
        connectTimeoutMS=20000,
        socketTimeoutMS=30000
    )
    db = client[mongodb_database]
    users_collection = db["users"]

    print("=" * 80)
    print("ADDING joinedAt TO ORGANIZATION MEMBERSHIPS")
    print("=" * 80)

    # Find all users with organizations array
    users = list(users_collection.find({"organizations": {"$exists": True}}))

    if not users:
        print("✅ No users with organizations found!")
        client.close()
        return

    print(f"\nFound {len(users)} users with organizations\n")

    updated = 0
    skipped = 0

    for user in users:
        email = user.get("email", "Unknown")
        organizations = user.get("organizations", [])
        created_at = user.get("createdAt", datetime.utcnow())

        needs_update = False

        # Check if any organization membership is missing joinedAt
        for org in organizations:
            if "joinedAt" not in org:
                needs_update = True
                # Use createdAt as fallback for joinedAt
                org["joinedAt"] = created_at

        if needs_update:
            # Update the user with new organizations array
            result = users_collection.update_one(
                {"_id": user["_id"]},
                {"$set": {"organizations": organizations}}
            )

            if result.modified_count > 0:
                print(f"  ✅ Updated {email} - added joinedAt to {len(organizations)} org(s)")
                updated += 1
            else:
                print(f"  ❌ Failed to update {email}")
        else:
            print(f"  ⏭  Skipped {email} - already has joinedAt")
            skipped += 1

    print("\n" + "=" * 80)
    print(f"MIGRATION COMPLETE")
    print(f"  Updated: {updated}")
    print(f"  Skipped: {skipped}")
    print("=" * 80)

    client.close()


if __name__ == "__main__":
    add_joined_at_to_organizations()
