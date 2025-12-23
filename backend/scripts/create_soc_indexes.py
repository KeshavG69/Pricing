#!/usr/bin/env python3
"""
Create MongoDB indexes for SOC (occupations) collection.

This script creates:
1. Text index on occupation_name for full-text search
2. Regular index on soc_code for regex searches (optional, performance boost)

Run this once after MongoDB setup:
    cd backend
    uv run python scripts/create_soc_indexes.py
"""

import sys
from pathlib import Path

# Add backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from pymongo import MongoClient
from app.settings import settings


def get_mongodb_connection():
    """Get synchronous MongoDB connection for this script."""
    client = MongoClient(
        settings.MONGODB_URL,
        serverSelectionTimeoutMS=20000
    )

    # Test connection
    client.admin.command("ping")

    return client[settings.MONGODB_DATABASE]


def create_soc_indexes():
    """Create indexes for occupations collection."""
    print("\n" + "="*70)
    print("Creating MongoDB Indexes for SOC Occupations Collection")
    print("="*70 + "\n")

    try:
        db = get_mongodb_connection()
        occupations = db["occupations"]

        # Get collection stats
        total_count = occupations.count_documents({})
        print(f"📊 Total occupations in collection: {total_count}")

        if total_count == 0:
            print("⚠️  WARNING: Occupations collection is empty!")
            print("   Please run occupation import script first.")
            return

        # ====================================================================
        # Index 1: Text Index on occupation_name (for job title search)
        # ====================================================================
        print("\n1️⃣  Creating text index on 'occupation_name'...")

        try:
            # Check if text index already exists
            existing_indexes = list(occupations.list_indexes())
            has_text_index = any(
                idx.get("key", {}).get("_fts") == "text"
                for idx in existing_indexes
            )

            if has_text_index:
                print("   ✅ Text index already exists!")
            else:
                # Create text index with custom settings
                occupations.create_index(
                    [("occupation_name", "text")],
                    name="occupation_name_text",
                    default_language="english",
                    weights={"occupation_name": 10}  # Boost relevance
                )
                print("   ✅ Text index created successfully!")

        except Exception as e:
            print(f"   ❌ Failed to create text index: {e}")
            print("   Note: Only one text index allowed per collection")

        # ====================================================================
        # Index 2: Regular Index on soc_code (for regex prefix searches)
        # ====================================================================
        print("\n2️⃣  Creating regular index on 'soc_code'...")

        try:
            # Check if index already exists
            existing_indexes = list(occupations.list_indexes())
            has_code_index = any(
                "soc_code" in idx.get("key", {})
                for idx in existing_indexes
                if idx.get("name") != "_id_"  # Skip default _id index
            )

            if has_code_index:
                print("   ✅ SOC code index already exists!")
            else:
                occupations.create_index(
                    [("soc_code", 1)],  # 1 = ascending
                    name="soc_code_index"
                )
                print("   ✅ SOC code index created successfully!")

        except Exception as e:
            print(f"   ❌ Failed to create soc_code index: {e}")

        # ====================================================================
        # Display all indexes
        # ====================================================================
        print("\n📋 All indexes on occupations collection:")
        print("-" * 70)

        for idx in occupations.list_indexes():
            name = idx.get("name", "unknown")
            key = idx.get("key", {})
            print(f"   • {name:30s} {key}")

        # ====================================================================
        # Test the indexes with sample queries
        # ====================================================================
        print("\n🧪 Testing indexes with sample queries...")
        print("-" * 70)

        # Test 1: Text search
        print("\n   Test 1: Text search for 'software'")
        try:
            result = occupations.find_one(
                {"$text": {"$search": "software"}},
                {"soc_code": 1, "occupation_name": 1, "_id": 0}
            )
            if result:
                print(f"   ✅ Found: {result['soc_code']} - {result['occupation_name']}")
            else:
                print("   ⚠️  No results found")
        except Exception as e:
            print(f"   ❌ Text search failed: {e}")

        # Test 2: Regex search on code
        print("\n   Test 2: Regex search for codes starting with '15-1'")
        try:
            result = occupations.find_one(
                {"soc_code": {"$regex": "^15-1", "$options": "i"}},
                {"soc_code": 1, "occupation_name": 1, "_id": 0}
            )
            if result:
                print(f"   ✅ Found: {result['soc_code']} - {result['occupation_name']}")
            else:
                print("   ⚠️  No results found")
        except Exception as e:
            print(f"   ❌ Regex search failed: {e}")

        print("\n" + "="*70)
        print("✅ Index creation completed!")
        print("="*70 + "\n")

        print("🚀 Next steps:")
        print("   1. Start your FastAPI server: uvicorn app.server:app --reload")
        print("   2. Test SOC search endpoints:")
        print("      - POST /api/soc/search-ai (FAISS vector search)")
        print("      - GET  /api/soc/all?skip=0&limit=20 (paginated list)")
        print("      - POST /api/soc/search (hybrid text/regex search)")
        print()

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    create_soc_indexes()
