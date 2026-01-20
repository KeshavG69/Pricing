"""
Migration script to add email verification fields to existing users.

This script:
1. Adds email_verified=True to all existing users
2. Adds verified_at=createdAt for existing users
3. Adds status="active" for existing users
4. Creates indexes for email_verifications collection

Run once after deploying email verification feature.
"""

import sys
from pathlib import Path

# Add parent directory to Python path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from datetime import datetime
from auth.database import get_mongodb_client


def migrate_existing_users():
    """Add email verification fields to existing users"""
    mongodb = get_mongodb_client()
    users_collection = mongodb.get_users_collection()
    db = mongodb.get_database()

    print("Starting email verification migration...")

    # Get count of users needing migration
    users_needing_migration = users_collection.count_documents({
        "email_verified": {"$exists": False}
    })

    if users_needing_migration == 0:
        print("✅ No users need migration. All users already have email_verified field.")
        return

    print(f"Found {users_needing_migration} users needing migration...")

    # Update all existing users without email_verified field
    result = users_collection.update_many(
        {"email_verified": {"$exists": False}},
        [{
            "$set": {
                "email_verified": True,  # Existing users are grandfathered in as verified
                "verified_at": "$createdAt",  # Use creation date as verification date
                "status": {
                    "$cond": {
                        "if": {"$ifNull": ["$status", None]},
                        "then": "$status",
                        "else": "active"
                    }
                },
                "updatedAt": datetime.utcnow()
            }
        }]
    )

    print(f"✅ Updated {result.modified_count} users with email_verified=True")

    # Create indexes for email_verifications collection
    create_verification_indexes(db)

    print("✅ Email verification migration completed successfully!")


def create_verification_indexes(db):
    """Create indexes for email_verifications collection"""
    verifications_collection = db["email_verifications"]

    print("Creating indexes for email_verifications collection...")

    # Index on token_hash for fast token lookup (unique)
    verifications_collection.create_index(
        "token_hash",
        unique=True,
        name="token_hash_unique"
    )
    print("  ✓ Created unique index on token_hash")

    # Index on user_id for user lookup
    verifications_collection.create_index(
        "user_id",
        name="user_id_idx"
    )
    print("  ✓ Created index on user_id")

    # Index on email for resend lookup
    verifications_collection.create_index(
        "email",
        name="email_idx"
    )
    print("  ✓ Created index on email")

    # Compound index on status and expires_at for cleanup queries
    verifications_collection.create_index(
        [("status", 1), ("expires_at", 1)],
        name="status_expires_idx"
    )
    print("  ✓ Created compound index on status + expires_at")

    # TTL index to auto-delete expired verifications after 30 days
    verifications_collection.create_index(
        "expires_at",
        expireAfterSeconds=2592000,  # 30 days in seconds
        name="expires_at_ttl"
    )
    print("  ✓ Created TTL index on expires_at (30 days)")


def verify_migration():
    """Verify migration was successful"""
    mongodb = get_mongodb_client()
    users_collection = mongodb.get_users_collection()

    # Count users with email_verified
    verified_count = users_collection.count_documents({
        "email_verified": True
    })

    unverified_count = users_collection.count_documents({
        "email_verified": {"$exists": False}
    })

    total_users = users_collection.count_documents({})

    print("\n=== Migration Verification ===")
    print(f"Total users: {total_users}")
    print(f"Users with email_verified=True: {verified_count}")
    print(f"Users without email_verified field: {unverified_count}")

    if unverified_count == 0:
        print("✅ All users have email_verified field!")
    else:
        print(f"⚠️  {unverified_count} users still need migration")


if __name__ == "__main__":
    print("=" * 60)
    print("EMAIL VERIFICATION MIGRATION")
    print("=" * 60)
    print()

    try:
        migrate_existing_users()
        verify_migration()

        print()
        print("=" * 60)
        print("MIGRATION COMPLETE")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        raise
