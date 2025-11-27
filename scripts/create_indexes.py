"""
Create indexes on MongoDB collections for improved query performance.

This script creates indexes on:
1. proposals collection - for user queries and status filtering
2. wage_data collection - for SOC code lookups
3. areas collection - for area name searches
4. occupations collection - for occupation code lookups
"""

import os
from pymongo import MongoClient, ASCENDING, DESCENDING
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "oews_data")


def create_indexes():
    """Create all necessary indexes."""
    print("Connecting to MongoDB...")
    client = MongoClient(MONGODB_URL)
    db = client[MONGODB_DATABASE]

    print(f"\nCreating indexes on database: {MONGODB_DATABASE}")
    print("=" * 60)

    # =====================================================================
    # PROPOSALS COLLECTION
    # =====================================================================
    print("\n1. PROPOSALS Collection:")
    proposals = db.proposals

    # Index for user_id + created_at (list user proposals sorted by date)
    try:
        proposals.create_index(
            [("user_id", ASCENDING), ("created_at", DESCENDING)],
            name="user_proposals_by_date"
        )
        print("   ✓ Created: user_id + created_at (descending)")
    except Exception as e:
        if "already exists" in str(e):
            print("   ⚠ Already exists: user_id + created_at")
        else:
            print(f"   ✗ Error: {e}")

    # Index for status (filter by processing/completed/error)
    proposals.create_index("status", name="status_index")
    print("   ✓ Created: status")

    # Compound index for user_id + status (common query pattern)
    proposals.create_index(
        [("user_id", ASCENDING), ("status", ASCENDING)],
        name="user_status_index"
    )
    print("   ✓ Created: user_id + status")

    # Index for _id + user_id (authorization checks)
    proposals.create_index(
        [("_id", ASCENDING), ("user_id", ASCENDING)],
        name="id_user_index"
    )
    print("   ✓ Created: _id + user_id")

    # =====================================================================
    # WAGE_DATA COLLECTION (6M+ records - most critical for performance)
    # =====================================================================
    print("\n2. WAGE_DATA Collection:")
    wage_data = db.wage_data

    # Index for series_id (primary query field)
    # This is critical for regex queries like "^OEUN0000000000000151252"
    wage_data.create_index("series_id", name="series_id_index")
    print("   ✓ Created: series_id")

    # Text index for full-text search (if needed)
    # Note: Text indexes can be large, only create if you need full-text search
    # wage_data.create_index([("series_id", "text")], name="series_id_text")
    # print("   ✓ Created: series_id (text index)")

    # =====================================================================
    # AREAS COLLECTION
    # =====================================================================
    print("\n3. AREAS Collection:")
    areas = db.areas

    # Index for area_code (exact lookups)
    areas.create_index("area_code", name="area_code_index")
    print("   ✓ Created: area_code")

    # Index for area_name (for regex searches)
    areas.create_index("area_name", name="area_name_index")
    print("   ✓ Created: area_name")

    # Text index for area_name (for full-text search)
    try:
        areas.create_index([("area_name", "text")], name="area_name_text")
        print("   ✓ Created: area_name (text index)")
    except Exception as e:
        if "already exists" in str(e):
            print("   ⚠ Text index already exists")
        else:
            print(f"   ⚠ Could not create text index: {e}")

    # =====================================================================
    # OCCUPATIONS COLLECTION
    # =====================================================================
    print("\n4. OCCUPATIONS Collection:")
    occupations = db.occupations

    # Index for occupation_code (exact lookups)
    occupations.create_index("occupation_code", name="occupation_code_index")
    print("   ✓ Created: occupation_code")

    # Index for occupation_name (for searches)
    occupations.create_index("occupation_name", name="occupation_name_index")
    print("   ✓ Created: occupation_name")

    # =====================================================================
    # USERS COLLECTION
    # =====================================================================
    print("\n5. USERS Collection:")
    users = db.users

    # Index for email (unique, for login)
    users.create_index("email", unique=True, name="email_unique_index")
    print("   ✓ Created: email (unique)")

    # Index for google_id (for Google OAuth)
    users.create_index("google_id", sparse=True, name="google_id_index")
    print("   ✓ Created: google_id (sparse)")

    # =====================================================================
    # TOKEN_BLACKLIST COLLECTION
    # =====================================================================
    print("\n6. TOKEN_BLACKLIST Collection:")
    token_blacklist = db.token_blacklist

    # Index for token (unique, for logout)
    token_blacklist.create_index("token", unique=True, name="token_unique_index")
    print("   ✓ Created: token (unique)")

    # TTL index to auto-delete expired tokens after 24 hours
    token_blacklist.create_index(
        "created_at",
        expireAfterSeconds=86400,  # 24 hours
        name="token_ttl_index"
    )
    print("   ✓ Created: created_at (TTL - expires after 24h)")

    # =====================================================================
    # SUMMARY
    # =====================================================================
    print("\n" + "=" * 60)
    print("Index Creation Summary:")
    print("=" * 60)

    # List all indexes per collection
    collections = ["proposals", "wage_data", "areas", "occupations", "users", "token_blacklist"]
    for coll_name in collections:
        coll = db[coll_name]
        indexes = list(coll.list_indexes())
        print(f"\n{coll_name.upper()}:")
        for idx in indexes:
            print(f"  - {idx['name']}: {idx.get('key', {})}")

    print("\n" + "=" * 60)
    print("✓ All indexes created successfully!")
    print("=" * 60)

    client.close()


if __name__ == "__main__":
    create_indexes()
