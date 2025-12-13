"""
Remove fte_threshold from all organization settings in MongoDB
"""

from pymongo import MongoClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "oews_data")

def remove_fte_threshold():
    """Remove fte_threshold field from all organizations"""
    client = MongoClient(MONGODB_URL)
    db = client[MONGODB_DATABASE]
    organizations = db["organizations"]
    
    # Remove fte_threshold from settings
    result = organizations.update_many(
        {"settings.fte_threshold": {"$exists": True}},
        {"$unset": {"settings.fte_threshold": ""}}
    )
    
    print(f"✅ Removed fte_threshold from {result.modified_count} organizations")
    
    # Verify
    count_with_threshold = organizations.count_documents({"settings.fte_threshold": {"$exists": True}})
    print(f"📊 Organizations still with fte_threshold: {count_with_threshold}")
    
    client.close()

if __name__ == "__main__":
    remove_fte_threshold()
