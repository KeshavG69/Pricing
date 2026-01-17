"""Migration: Add business_status to existing proposals."""
from pymongo import MongoClient
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


def migrate_business_status():
    """
    Add business_status field to all completed proposals.

    Sets business_status = "active" for all completed proposals that don't have one yet.
    Also creates necessary database indexes.
    """
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    database_name = os.getenv("MONGODB_DATABASE", "oews_data")
    client = MongoClient(mongodb_url)
    db = client.get_database(database_name)
    proposals = db["proposals"]

    print("Starting business_status migration...")

    # Set business_status = "active" for completed proposals
    result = proposals.update_many(
        {"status": "completed", "business_status": {"$exists": False}},
        {"$set": {"business_status": "active", "updated_at": datetime.now(timezone.utc)}}
    )

    print(f"Updated {result.modified_count} proposals with business_status='active'")

    # Create indexes
    print("Creating indexes...")
    proposals.create_index("business_status")
    proposals.create_index([
        ("organization_id", 1),
        ("business_status", 1),
        ("created_at", -1)
    ])
    print("Indexes created successfully")

    print("Migration complete!")


if __name__ == "__main__":
    migrate_business_status()
