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


def safe_create_index(collection, keys, name, **kwargs):
    """Create index with error handling for existing indexes."""
    try:
        collection.create_index(keys, name=name, **kwargs)
        return True
    except Exception as e:
        error_msg = str(e).lower()
        if "already exists" in error_msg or "index already" in error_msg:
            return False  # Index already exists
        else:
            # Real error - re-raise
            raise


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
    if safe_create_index(proposals, [("user_id", ASCENDING), ("created_at", DESCENDING)], "user_proposals_by_date"):
        print("   ✓ Created: user_id + created_at (descending)")
    else:
        print("   ⚠ Already exists: user_id + created_at")

    # Index for status (filter by processing/completed/error)
    if safe_create_index(proposals, "status", "status_index"):
        print("   ✓ Created: status")
    else:
        print("   ⚠ Already exists: status")

    # Compound index for user_id + status (common query pattern)
    if safe_create_index(proposals, [("user_id", ASCENDING), ("status", ASCENDING)], "user_status_index"):
        print("   ✓ Created: user_id + status")
    else:
        print("   ⚠ Already exists: user_id + status")

    # Index for _id + user_id (authorization checks)
    if safe_create_index(proposals, [("_id", ASCENDING), ("user_id", ASCENDING)], "id_user_index"):
        print("   ✓ Created: _id + user_id")
    else:
        print("   ⚠ Already exists: _id + user_id")

    # Organization-related indexes
    if safe_create_index(proposals, [("organization_id", ASCENDING), ("created_at", DESCENDING)], "org_created_at_index"):
        print("   ✓ Created: organization_id + created_at")
    else:
        print("   ⚠ Already exists: organization_id + created_at")

    if safe_create_index(proposals, [("organization_id", ASCENDING), ("visibility", ASCENDING)], "org_visibility_index"):
        print("   ✓ Created: organization_id + visibility")
    else:
        print("   ⚠ Already exists: organization_id + visibility")

    if safe_create_index(proposals, "shared_with", "shared_with_index"):
        print("   ✓ Created: shared_with")
    else:
        print("   ⚠ Already exists: shared_with")

    # =====================================================================
    # WAGE_DATA COLLECTION (6M+ records - most critical for performance)
    # =====================================================================
    print("\n2. WAGE_DATA Collection:")
    wage_data = db.wage_data

    # Index for series_id (primary query field)
    if safe_create_index(wage_data, "series_id", "series_id_index"):
        print("   ✓ Created: series_id")
    else:
        print("   ⚠ Already exists: series_id")

    # =====================================================================
    # AREAS COLLECTION
    # =====================================================================
    print("\n3. AREAS Collection:")
    areas = db.areas

    # Index for area_code (exact lookups)
    if safe_create_index(areas, "area_code", "area_code_index"):
        print("   ✓ Created: area_code")
    else:
        print("   ⚠ Already exists: area_code")

    # Index for area_name (for regex searches)
    if safe_create_index(areas, "area_name", "area_name_index"):
        print("   ✓ Created: area_name")
    else:
        print("   ⚠ Already exists: area_name")

    # Text index for area_name (for full-text search)
    if safe_create_index(areas, [("area_name", "text")], "area_name_text"):
        print("   ✓ Created: area_name (text index)")
    else:
        print("   ⚠ Already exists: area_name (text index)")

    # =====================================================================
    # OCCUPATIONS COLLECTION
    # =====================================================================
    print("\n4. OCCUPATIONS Collection:")
    occupations = db.occupations

    # Index for occupation_code (exact lookups)
    if safe_create_index(occupations, "occupation_code", "occupation_code_index"):
        print("   ✓ Created: occupation_code")
    else:
        print("   ⚠ Already exists: occupation_code")

    # Index for occupation_name (for searches)
    if safe_create_index(occupations, "occupation_name", "occupation_name_index"):
        print("   ✓ Created: occupation_name")
    else:
        print("   ⚠ Already exists: occupation_name")

    # =====================================================================
    # USERS COLLECTION
    # =====================================================================
    print("\n5. USERS Collection:")
    users = db.users

    # Index for email (unique, for login)
    if safe_create_index(users, "email", "email_unique_index", unique=True):
        print("   ✓ Created: email (unique)")
    else:
        print("   ⚠ Already exists: email (unique)")

    # Index for google_id (for Google OAuth)
    if safe_create_index(users, "google_id", "google_id_index", sparse=True):
        print("   ✓ Created: google_id (sparse)")
    else:
        print("   ⚠ Already exists: google_id (sparse)")

    # Organization-related indexes
    if safe_create_index(users, [("organization_id", ASCENDING), ("role", ASCENDING)], "org_role_index"):
        print("   ✓ Created: organization_id + role")
    else:
        print("   ⚠ Already exists: organization_id + role")

    if safe_create_index(users, [("organization_id", ASCENDING), ("status", ASCENDING)], "org_status_index"):
        print("   ✓ Created: organization_id + status")
    else:
        print("   ⚠ Already exists: organization_id + status")

    # =====================================================================
    # ORGANIZATIONS COLLECTION
    # =====================================================================
    print("\n6. ORGANIZATIONS Collection:")
    organizations = db.organizations

    # Slug (unique) - for URL-friendly org lookups
    if safe_create_index(organizations, "slug", "slug_unique_index", unique=True):
        print("   ✓ Created: slug (unique)")
    else:
        print("   ⚠ Already exists: slug (unique)")

    # Owner ID - for finding orgs owned by user
    if safe_create_index(organizations, "owner_id", "owner_id_index"):
        print("   ✓ Created: owner_id")
    else:
        print("   ⚠ Already exists: owner_id")

    # Status - for filtering active orgs
    if safe_create_index(organizations, "status", "org_status_index"):
        print("   ✓ Created: status")
    else:
        print("   ⚠ Already exists: status")

    # =====================================================================
    # INVITATIONS COLLECTION
    # =====================================================================
    print("\n7. INVITATIONS Collection:")
    invitations = db.invitations

    # Token Hash (unique) - for invitation validation
    if safe_create_index(invitations, "token_hash", "token_hash_unique_index", unique=True):
        print("   ✓ Created: token_hash (unique)")
    else:
        print("   ⚠ Already exists: token_hash (unique)")

    # Organization + Status - for listing org invitations
    if safe_create_index(invitations, [("organization_id", ASCENDING), ("status", ASCENDING)], "inv_org_status_index"):
        print("   ✓ Created: organization_id + status")
    else:
        print("   ⚠ Already exists: organization_id + status")

    # Email + Status - for checking duplicate invitations
    if safe_create_index(invitations, [("email", ASCENDING), ("status", ASCENDING)], "email_status_index"):
        print("   ✓ Created: email + status")
    else:
        print("   ⚠ Already exists: email + status")

    # Expires At (TTL) - auto-delete expired invitations after 30 days
    if safe_create_index(invitations, "expires_at", "expires_at_ttl_index", expireAfterSeconds=2592000):
        print("   ✓ Created: expires_at (TTL - auto-deletes after 30 days)")
    else:
        print("   ⚠ Already exists: expires_at (TTL)")

    # =====================================================================
    # TOKEN_BLACKLIST COLLECTION
    # =====================================================================
    print("\n8. TOKEN_BLACKLIST Collection:")
    token_blacklist = db.token_blacklist

    # Index for token (unique, for logout)
    if safe_create_index(token_blacklist, "token", "token_unique_index", unique=True):
        print("   ✓ Created: token (unique)")
    else:
        print("   ⚠ Already exists: token (unique)")

    # TTL index to auto-delete expired tokens after 24 hours
    if safe_create_index(token_blacklist, "created_at", "token_ttl_index", expireAfterSeconds=86400):
        print("   ✓ Created: created_at (TTL - expires after 24h)")
    else:
        print("   ⚠ Already exists: created_at (TTL)")

    # =====================================================================
    # SUMMARY
    # =====================================================================
    print("\n" + "=" * 60)
    print("Index Creation Summary:")
    print("=" * 60)

    # List all indexes per collection
    collections = ["proposals", "wage_data", "areas", "occupations", "users", "organizations", "invitations", "token_blacklist"]
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
