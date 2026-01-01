"""
One-time migration script to add terms acceptance fields to existing users.
Sets all existing users to current terms version with grandfathered timestamp.
"""

from pymongo import MongoClient
from datetime import datetime
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from auth import config
from auth.database import get_mongodb_client


def migrate_existing_users():
    """
    Add terms acceptance fields to all existing users.
    Sets them to current version with createdAt timestamp (grandfathered).
    """
    print(f"🚀 Starting terms acceptance migration...")
    print(f"📌 Current terms version: {config.CURRENT_TERMS_VERSION}")

    users_collection = get_mongodb_client().get_users_collection()

    # Find users without terms acceptance fields
    users_to_migrate = users_collection.count_documents({
        "terms_accepted_version": {"$exists": False}
    })

    print(f"📊 Found {users_to_migrate} users to migrate")

    if users_to_migrate == 0:
        print("✅ No users need migration. All done!")
        return

    # Update all users without terms fields
    # Use createdAt as acceptance timestamp (grandfather them in)
    result = users_collection.update_many(
        {"terms_accepted_version": {"$exists": False}},
        [
            {
                "$set": {
                    "terms_accepted_version": config.CURRENT_TERMS_VERSION,
                    # Use existing createdAt field, or current time if missing
                    "terms_accepted_at": {
                        "$ifNull": ["$createdAt", datetime.utcnow()]
                    }
                }
            }
        ]
    )

    print(f"✅ Successfully migrated {result.modified_count} users")
    print(f"📝 All users now have terms_accepted_version = {config.CURRENT_TERMS_VERSION}")
    print(f"🎉 Migration complete!")


if __name__ == "__main__":
    try:
        migrate_existing_users()
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
