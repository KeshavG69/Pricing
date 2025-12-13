"""
Migration script: Convert users from single-org to multi-org model.

OLD MODEL:
{
  organization_id: ObjectId,
  role: "admin",
  status: "active"
}

NEW MODEL:
{
  organizations: [{organization_id: ObjectId, role: "admin", status: "active"}],
  current_organization_id: ObjectId
}
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()


async def migrate_users():
    """Migrate all users to multi-organization model"""

    # Connect to MongoDB
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    mongodb_database = os.getenv("MONGODB_DATABASE", "price-qastage01")

    client = AsyncIOMotorClient(
        mongodb_url,
        serverSelectionTimeoutMS=20000,
        connectTimeoutMS=20000
    )
    db = client[mongodb_database]
    users_collection = db["users"]

    print("=" * 80)
    print("MIGRATING USERS TO MULTI-ORGANIZATION MODEL")
    print("=" * 80)

    # Find all users that have the old model (organization_id field but no organizations array)
    cursor = users_collection.find({
        "organization_id": {"$exists": True},
        "organizations": {"$exists": False}
    })

    users_to_migrate = await cursor.to_list(length=None)

    if not users_to_migrate:
        print("✅ No users need migration - all users already on new model!")
        client.close()
        return

    print(f"Found {len(users_to_migrate)} users to migrate\n")

    migrated = 0
    skipped = 0

    for user in users_to_migrate:
        email = user.get("email", "Unknown")
        org_id = user.get("organization_id")
        role = user.get("role")
        status = user.get("status", "active")

        # Skip users without organization (they're fine)
        if not org_id:
            print(f"  ⏭  Skipping {email} - no organization")
            skipped += 1
            continue

        # Create organizations array from old fields
        organizations = [{
            "organization_id": org_id,
            "role": role if role else "user",
            "status": status
        }]

        # Update user
        result = await users_collection.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "organizations": organizations,
                    "current_organization_id": org_id
                },
                "$unset": {
                    "organization_id": "",
                    "role": "",
                    "status": ""
                }
            }
        )

        if result.modified_count > 0:
            print(f"  ✅ Migrated {email} (org: {org_id}, role: {role})")
            migrated += 1
        else:
            print(f"  ❌ Failed to migrate {email}")

    print("\n" + "=" * 80)
    print(f"MIGRATION COMPLETE")
    print(f"  Migrated: {migrated}")
    print(f"  Skipped: {skipped}")
    print("=" * 80)

    client.close()


if __name__ == "__main__":
    asyncio.run(migrate_users())
