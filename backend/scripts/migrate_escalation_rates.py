"""
Migrate default_escalation_rates (dict) to default_escalation_rate (single float)
"""

from pymongo import MongoClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "oews_data")

def migrate_escalation_rates():
    """Convert default_escalation_rates dict to default_escalation_rate float"""
    client = MongoClient(MONGODB_URL)
    db = client[MONGODB_DATABASE]
    organizations = db["organizations"]
    
    # Find all organizations with the old field
    orgs_with_old_field = list(organizations.find({"settings.default_escalation_rates": {"$exists": True}}))
    
    print(f"Found {len(orgs_with_old_field)} organizations to migrate")
    
    updated_count = 0
    for org in orgs_with_old_field:
        old_rates = org.get("settings", {}).get("default_escalation_rates", {})
        
        # Calculate average rate or use 3% default
        if old_rates and isinstance(old_rates, dict):
            # Get average of all rates
            rates = [v for v in old_rates.values() if isinstance(v, (int, float))]
            avg_rate = sum(rates) / len(rates) if rates else 0.03
        else:
            avg_rate = 0.03
        
        # Update the organization
        organizations.update_one(
            {"_id": org["_id"]},
            {
                "$set": {"settings.default_escalation_rate": avg_rate},
                "$unset": {"settings.default_escalation_rates": ""}
            }
        )
        updated_count += 1
        print(f"  Updated {org.get('name', 'Unknown')}: {avg_rate:.4f} ({avg_rate*100:.2f}%)")
    
    print(f"\n✅ Migrated {updated_count} organizations")
    
    # Verify
    count_with_old = organizations.count_documents({"settings.default_escalation_rates": {"$exists": True}})
    count_with_new = organizations.count_documents({"settings.default_escalation_rate": {"$exists": True}})
    print(f"📊 Organizations with old field: {count_with_old}")
    print(f"📊 Organizations with new field: {count_with_new}")
    
    client.close()

if __name__ == "__main__":
    migrate_escalation_rates()
