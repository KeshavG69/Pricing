"""
Script to create MongoDB indexes for refresh_tokens collection
Run this once after implementing cookie-based authentication
"""

import os
from pymongo import MongoClient, ASCENDING, DESCENDING
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "oews_data")

def create_refresh_token_indexes():
    """Create indexes for refresh_tokens collection"""
    try:
        # Connect to MongoDB
        client = MongoClient(MONGODB_URL)
        db = client[MONGODB_DATABASE]
        collection = db["refresh_tokens"]

        print("Creating indexes for refresh_tokens collection...")

        # 1. Compound index on user_email + token_family_id (for queries)
        collection.create_index(
            [("user_email", ASCENDING), ("token_family_id", ASCENDING)],
            name="user_email_token_family_idx"
        )
        print("✅ Created compound index: user_email + token_family_id")

        # 2. Index on expires_at for TTL (automatic cleanup of expired tokens)
        # TTL index will automatically delete documents after they expire
        collection.create_index(
            [("expires_at", ASCENDING)],
            name="expires_at_ttl_idx",
            expireAfterSeconds=0  # Delete immediately after expires_at time
        )
        print("✅ Created TTL index: expires_at (auto-deletes expired tokens)")

        # 3. Index on is_revoked (for faster queries)
        collection.create_index(
            [("is_revoked", ASCENDING)],
            name="is_revoked_idx"
        )
        print("✅ Created index: is_revoked")

        # 4. Index on token_id (for lookups)
        collection.create_index(
            [("token_id", ASCENDING)],
            name="token_id_idx",
            unique=True  # Each token_id must be unique
        )
        print("✅ Created unique index: token_id")

        # List all indexes
        print("\n📋 All indexes on refresh_tokens collection:")
        for index in collection.list_indexes():
            print(f"  - {index['name']}: {index.get('key', {})}")

        print("\n✅ Successfully created all indexes!")
        print("\n💡 The TTL index will automatically delete expired tokens from MongoDB")

        client.close()

    except Exception as e:
        print(f"❌ Error creating indexes: {e}")
        raise


if __name__ == "__main__":
    create_refresh_token_indexes()
