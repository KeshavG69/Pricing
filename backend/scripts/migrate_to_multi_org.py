"""
Migrate users to support multiple organizations
"""

from pymongo import MongoClient
import os
from dotenv import load_dotenv
from bson import ObjectId

# Load environment variables
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "oews_data")

def migrate_users():
    """Convert single organization_id to organizations array"""
    client = MongoClient(MONGODB_URL)
    db = client[MONGODB_DATABASE]
    users = db["users"]
    
    # Find all users with organization_id
    users_to_migrate = list(users.find({"organization_id": {"$exists": True}}))
    
    print(f"Found {len(users_to_migrate)} users to migrate")
    
    updated_count = 0
    for user in users_to_migrate:
        org_id = user.get("organization_id")
        role = user.get("role", "user")
        status = user.get("status", "active")
        
        # Create organizations array
        organizations = [{
            "organization_id": org_id,
            "role": role,
            "status": status
        }]
        
        # Update user
        users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "organizations": organizations,
                    "current_organization_id": org_id
                },
                "$unset": {
                    "organization_id": "",
                    "role": "",
                    "status": ""
                }
            }
        )
        updated_count += 1
        print(f"  Migrated {user.get('email', 'Unknown')}")
    
    print(f"\n✅ Migrated {updated_count} users to multi-org model")
    
    # Verify
    count_with_old = users.count_documents({"organization_id": {"$exists": True}})
    count_with_new = users.count_documents({"organizations": {"$exists": True}})
    print(f"📊 Users with old model: {count_with_old}")
    print(f"📊 Users with new model: {count_with_new}")
    
    client.close()

if __name__ == "__main__":
    migrate_users()
