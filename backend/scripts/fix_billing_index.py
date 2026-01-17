"""Fix billing stripe_event_id index to be sparse (allow multiple nulls)"""
from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "oews_data")

def fix_index():
    client = MongoClient(MONGODB_URL)
    db = client[MONGODB_DATABASE]
    billing = db["billing"]
    
    print(f"Connected to database: {MONGODB_DATABASE}")
    
    # Check existing indexes
    print("\nExisting indexes on billing collection:")
    for idx in billing.list_indexes():
        print(f"  - {idx['name']}: {idx.get('key')}, sparse={idx.get('sparse', False)}, unique={idx.get('unique', False)}")
    
    # Drop the old index if it exists
    try:
        billing.drop_index("stripe_event_idempotency")
        print("\n✓ Dropped old stripe_event_idempotency index")
    except Exception as e:
        print(f"\n⚠ Could not drop index (may not exist): {e}")
    
    # Create new sparse index
    billing.create_index(
        "stripe_event_id",
        unique=True,
        sparse=True,  # This allows multiple null values
        name="stripe_event_idempotency"
    )
    print("✓ Created new sparse index: stripe_event_idempotency")
    
    # Verify
    print("\nVerified indexes:")
    for idx in billing.list_indexes():
        if idx['name'] == 'stripe_event_idempotency':
            print(f"  - {idx['name']}: sparse={idx.get('sparse', False)}, unique={idx.get('unique', False)}")
    
    print("\n✅ Done! You can now create billing records with null stripe_event_id")

if __name__ == "__main__":
    fix_index()
