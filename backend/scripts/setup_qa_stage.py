"""
Setup QA Stage Database

This script:
1. Clones 'priceiq' database to 'price-qastage01'
2. Runs organization migration on 'price-qastage01'
3. Leaves original 'priceiq' unchanged (rolled back)
"""

import os
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId
from datetime import datetime, timedelta
import secrets
import hashlib

# Load environment variables
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
SOURCE_DB = "priceiq"
TARGET_DB = "price-qastage01"


def clone_database():
    """Clone entire database with all collections and data."""
    print("=" * 70)
    print(f"STEP 1: CLONING DATABASE")
    print("=" * 70)
    print(f"Source: {SOURCE_DB}")
    print(f"Target: {TARGET_DB}")

    # Connect to MongoDB
    print(f"\nConnecting to MongoDB...")
    client = MongoClient(MONGODB_URL)

    # Get source and target databases
    source_db = client[SOURCE_DB]
    target_db = client[TARGET_DB]

    # Get all collection names from source
    collections = source_db.list_collection_names()
    print(f"\nFound {len(collections)} collections:")
    for coll in collections:
        count = source_db[coll].count_documents({})
        print(f"  - {coll}: {count} documents")

    print(f"\nCopying to {TARGET_DB}...")
    print("-" * 70)

    total_copied = 0

    for collection_name in collections:
        source_collection = source_db[collection_name]
        target_collection = target_db[collection_name]

        # Get all documents from source
        documents = list(source_collection.find({}))

        if documents:
            # Drop target collection if exists
            target_collection.drop()

            # Insert all documents
            target_collection.insert_many(documents)

            print(f"  ✅ {collection_name}: {len(documents)} documents")
            total_copied += len(documents)
        else:
            print(f"  ⏭️  {collection_name}: empty")

    print(f"\n✅ Cloned {total_copied} documents to {TARGET_DB}")

    # Copy indexes
    print(f"\nCopying indexes...")
    for collection_name in collections:
        source_collection = source_db[collection_name]
        target_collection = target_db[collection_name]

        indexes = source_collection.list_indexes()
        for index in indexes:
            if index['name'] == '_id_':
                continue

            keys = list(index['key'].items())
            options = {k: v for k, v in index.items()
                      if k not in ['v', 'key', 'ns']}

            try:
                target_collection.create_index(keys, **options)
            except:
                pass

    print(f"✅ Indexes copied")

    return client


def migrate_qa_database(client):
    """Run organization migration on QA database."""
    print("\n" + "=" * 70)
    print(f"STEP 2: MIGRATING QA DATABASE ({TARGET_DB})")
    print("=" * 70)

    db = client[TARGET_DB]

    user_org_mapping = {}
    stats = {
        "users_processed": 0,
        "organizations_created": 0,
        "proposals_processed": 0,
    }

    # Process users
    print("\n[1/3] Processing users...")
    print("-" * 70)

    users = list(db.users.find({}))
    print(f"Found {len(users)} users")

    for user in users:
        user_id = user["_id"]
        email = user.get("email", "unknown")

        # Create organization for user
        org_name = f"{user.get('firstName', 'User')} {user.get('lastName', '')}'s Organization".strip()

        org = {
            "_id": ObjectId(),
            "name": org_name,
            "slug": f"org-{user_id}",
            "owner_id": user_id,
            "created_at": user.get("createdAt", datetime.utcnow()),
            "updated_at": datetime.utcnow(),
            "status": "active",
            "settings": {
                "default_rates": {
                    "fringe": 0.247,
                    "oh": 0.0711,
                    "ga": 0.2243,
                    "fee": 0.07,
                    "smh": 0.065,
                    "sub_fee": 0.05,
                    "ga_passthrough": 0.025,
                    "ga_adder": 0.0243
                },
                "default_escalation_rates": {},
                "fte_threshold": 1920,
                "allow_user_rate_override": True
            },
            "subscription": {
                "plan": "free",
                "seats": 5,
                "expires_at": None
            }
        }

        org_id = org["_id"]
        user_org_mapping[user_id] = org_id

        db.organizations.insert_one(org)
        print(f"  ✅ Created org for {email}")
        stats["organizations_created"] += 1

    # Update users
    print(f"\n[2/3] Updating users...")
    print("-" * 70)

    for user_id, org_id in user_org_mapping.items():
        db.users.update_one(
            {"_id": user_id},
            {"$set": {
                "organization_id": org_id,
                "role": "admin",
                "status": "active",
                "updatedAt": datetime.utcnow()
            }}
        )
        stats["users_processed"] += 1

    print(f"  ✅ Updated {stats['users_processed']} users")

    # Update proposals
    print(f"\n[3/3] Updating proposals...")
    print("-" * 70)

    proposals = list(db.proposals.find({}))
    print(f"Found {len(proposals)} proposals")

    for proposal in proposals:
        user_id = proposal.get("user_id")

        # Handle string user_id
        if isinstance(user_id, str):
            try:
                user_id = ObjectId(user_id)
            except:
                pass

        if user_id not in user_org_mapping:
            continue

        org_id = user_org_mapping[user_id]

        db.proposals.update_one(
            {"_id": proposal["_id"]},
            {"$set": {
                "organization_id": org_id,
                "visibility": "private",
                "shared_with": [],
                "updated_at": datetime.utcnow()
            }}
        )
        stats["proposals_processed"] += 1

    print(f"  ✅ Updated {stats['proposals_processed']} proposals")

    # Create indexes
    print(f"\n[4/3] Creating organization indexes...")
    print("-" * 70)

    from scripts.create_indexes import safe_create_index
    from pymongo import ASCENDING, DESCENDING

    # Users indexes
    safe_create_index(db.users, [("organization_id", ASCENDING), ("role", ASCENDING)], "org_role_index")
    safe_create_index(db.users, [("organization_id", ASCENDING), ("status", ASCENDING)], "org_status_index")

    # Organizations indexes
    safe_create_index(db.organizations, "slug", "slug_unique_index", unique=True)
    safe_create_index(db.organizations, "owner_id", "owner_id_index")
    safe_create_index(db.organizations, "status", "org_status_index")

    # Proposals indexes
    safe_create_index(db.proposals, [("organization_id", ASCENDING), ("created_at", DESCENDING)], "org_created_at_index")
    safe_create_index(db.proposals, [("organization_id", ASCENDING), ("visibility", ASCENDING)], "org_visibility_index")
    safe_create_index(db.proposals, "shared_with", "shared_with_index")

    # Invitations indexes
    safe_create_index(db.invitations, "token_hash", "token_hash_unique_index", unique=True)
    safe_create_index(db.invitations, [("organization_id", ASCENDING), ("status", ASCENDING)], "inv_org_status_index")
    safe_create_index(db.invitations, [("email", ASCENDING), ("status", ASCENDING)], "email_status_index")
    safe_create_index(db.invitations, "expires_at", "expires_at_ttl_index", expireAfterSeconds=2592000)

    print(f"  ✅ Created organization indexes")

    return stats


def main():
    """Main execution."""
    print("\n🚀 SETTING UP QA STAGE DATABASE\n")

    # Clone database
    client = clone_database()

    # Migrate QA database
    stats = migrate_qa_database(client)

    # Summary
    print("\n" + "=" * 70)
    print("✅ QA STAGE SETUP COMPLETE")
    print("=" * 70)
    print(f"  Database: {TARGET_DB}")
    print(f"  Organizations: {stats['organizations_created']}")
    print(f"  Users migrated: {stats['users_processed']}")
    print(f"  Proposals migrated: {stats['proposals_processed']}")
    print("=" * 70)

    print(f"\n📝 NEXT STEPS:")
    print(f"1. Update your .env file:")
    print(f"   MONGODB_DATABASE={TARGET_DB}")
    print(f"\n2. Restart your server:")
    print(f"   uv run uvicorn app.server:app --reload --port 8000")
    print(f"\n3. Original '{SOURCE_DB}' database remains unchanged (rolled back)")

    client.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
