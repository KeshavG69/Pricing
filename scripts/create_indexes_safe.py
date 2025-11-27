"""
Create indexes on MongoDB collections for improved query performance.
Safely handles existing indexes.
"""

import os
from pymongo import MongoClient, ASCENDING, DESCENDING, TEXT
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "oews_data")


def safe_create_index(collection, keys, **kwargs):
    """Safely create index, handling existing indexes."""
    try:
        collection.create_index(keys, **kwargs)
        return f"✓ Created: {kwargs.get('name', str(keys))}"
    except Exception as e:
        if "already exists" in str(e).lower():
            return f"⚠ Already exists: {kwargs.get('name', str(keys))}"
        else:
            return f"✗ Error: {str(e)[:100]}"


def create_indexes():
    """Create all necessary indexes."""
    print("Connecting to MongoDB...")
    client = MongoClient(MONGODB_URL)
    db = client[MONGODB_DATABASE]

    print(f"\nCreating indexes on database: {MONGODB_DATABASE}")
    print("=" * 70)

    # =====================================================================
    # PROPOSALS COLLECTION
    # =====================================================================
    print("\n📋 PROPOSALS Collection:")
    proposals = db.proposals

    print("  ", safe_create_index(proposals, [("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_proposals_by_date"))
    print("  ", safe_create_index(proposals, "status", name="status_index"))
    print("  ", safe_create_index(proposals, [("user_id", ASCENDING), ("status", ASCENDING)], name="user_status_index"))
    print("  ", safe_create_index(proposals, [("_id", ASCENDING), ("user_id", ASCENDING)], name="id_user_index"))

    # =====================================================================
    # WAGE_DATA COLLECTION (6M+ records - CRITICAL)
    # =====================================================================
    print("\n💵 WAGE_DATA Collection (6M+ records):")
    wage_data = db.wage_data

    print("  ", safe_create_index(wage_data, "series_id", name="series_id_index"))
    print("     ⚡ This index is CRITICAL for fast wage lookups!")

    # =====================================================================
    # AREAS COLLECTION
    # =====================================================================
    print("\n🌍 AREAS Collection:")
    areas = db.areas

    print("  ", safe_create_index(areas, "area_code", name="area_code_index"))
    print("  ", safe_create_index(areas, "area_name", name="area_name_index"))
    print("  ", safe_create_index(areas, [("area_name", TEXT)], name="area_name_text"))

    # =====================================================================
    # OCCUPATIONS COLLECTION
    # =====================================================================
    print("\n👔 OCCUPATIONS Collection:")
    occupations = db.occupations

    print("  ", safe_create_index(occupations, "occupation_code", name="occupation_code_index"))
    print("  ", safe_create_index(occupations, "occupation_name", name="occupation_name_index"))

    # =====================================================================
    # USERS COLLECTION
    # =====================================================================
    print("\n👤 USERS Collection:")
    users = db.users

    print("  ", safe_create_index(users, "email", unique=True, name="email_unique_index"))
    print("  ", safe_create_index(users, "google_id", sparse=True, name="google_id_index"))

    # =====================================================================
    # TOKEN_BLACKLIST COLLECTION
    # =====================================================================
    print("\n🔒 TOKEN_BLACKLIST Collection:")
    token_blacklist = db.token_blacklist

    print("  ", safe_create_index(token_blacklist, "token", unique=True, name="token_unique_index"))
    print("  ", safe_create_index(token_blacklist, "created_at", expireAfterSeconds=86400, name="token_ttl_index"))
    print("     ⏱️  TTL index: Tokens auto-expire after 24 hours")

    # =====================================================================
    # SUMMARY
    # =====================================================================
    print("\n" + "=" * 70)
    print("📊 INDEX SUMMARY:")
    print("=" * 70)

    collections = {
        "proposals": proposals,
        "wage_data": wage_data,
        "areas": areas,
        "occupations": occupations,
        "users": users,
        "token_blacklist": token_blacklist
    }

    for coll_name, coll in collections.items():
        indexes = list(coll.list_indexes())
        print(f"\n{coll_name.upper()} ({len(indexes)} indexes):")
        for idx in indexes:
            key_str = ", ".join([f"{k}: {v}" for k, v in idx.get('key', {}).items()])
            print(f"  - {idx['name']}: {key_str}")
            if 'unique' in idx and idx['unique']:
                print(f"    └─ UNIQUE")
            if 'expireAfterSeconds' in idx:
                print(f"    └─ TTL: {idx['expireAfterSeconds']}s")

    print("\n" + "=" * 70)
    print("✅ Index creation completed!")
    print("=" * 70)

    client.close()


if __name__ == "__main__":
    create_indexes()
