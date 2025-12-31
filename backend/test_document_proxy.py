"""
Test script to verify backend proxy for document preview works.

1. Connect to MongoDB and fetch a proposal with documents
2. Generate fresh presigned URL using IDriveStorage
3. Fetch via httpx to verify proxy approach
"""

import os
from dotenv import load_dotenv
from pymongo import MongoClient
import httpx

# Load environment variables
load_dotenv()

# Get MongoDB config from environment
MONGODB_URL = os.getenv("MONGODB_URL")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE")

print(f"Database: {MONGODB_DATABASE}")

# Connect to MongoDB
client = MongoClient(MONGODB_URL)
db = client[MONGODB_DATABASE]
proposals = db["proposals"]

# Find a proposal with documents that have idrive_key
proposal = proposals.find_one(
    {"documents": {"$elemMatch": {"idrive_key": {"$exists": True, "$ne": None}}}}
)

if not proposal:
    print("❌ No proposals found with documents that have idrive_key")
    exit(1)

print(f"✅ Found proposal: {proposal.get('name', 'Unnamed')}")

# Get first document with idrive_key
doc = None
for d in proposal.get("documents", []):
    if d.get("idrive_key"):
        doc = d
        break

if not doc:
    print("❌ No document with idrive_key found")
    exit(1)

print(f"✅ Found document: {doc.get('filename', 'Unknown')}")
print(f"   IDrive Key: {doc['idrive_key']}")

# Generate fresh presigned URL
print("\n🔑 Generating fresh presigned URL...")

from client.idrive_storage import get_idrive_storage

storage = get_idrive_storage()
fresh_url = storage.get_presigned_url(doc["idrive_key"])
print(f"   Fresh URL: {fresh_url[:100]}...")

# Test fetching the URL via httpx
print("\n📡 Testing fetch via httpx...")

try:
    with httpx.Client(timeout=30.0) as http_client:
        response = http_client.get(fresh_url, follow_redirects=True)

        print(f"   Status: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('content-type', 'N/A')}")
        content_length = response.headers.get('content-length', 'N/A')
        print(f"   Content-Length: {content_length} bytes")

        # Check for X-Frame-Options header
        x_frame = response.headers.get("x-frame-options")
        if x_frame:
            print(f"   X-Frame-Options: {x_frame} (this blocks iframe)")
        else:
            print("   X-Frame-Options: Not set ✅")

        if response.status_code == 200:
            content_type = response.headers.get('content-type', '')

            # Check if it's actually a PDF (not HTML login page)
            if 'application/pdf' in content_type or response.content[:4] == b'%PDF':
                print(f"\n✅ SUCCESS! Got actual PDF content.")
                print(f"   Document size: {len(response.content)} bytes")
                print(f"   First 50 bytes: {response.content[:50]}")
                print("\n🎉 Backend proxy approach WILL work!")
            elif 'text/html' in content_type:
                print(f"\n❌ Got HTML instead of document (likely login/error page)")
                print(f"   First 200 chars: {response.text[:200]}")
            else:
                print(f"\n✅ Got content with type: {content_type}")
                print(f"   Document size: {len(response.content)} bytes")
        else:
            print(f"\n❌ Failed to fetch document: HTTP {response.status_code}")

except Exception as e:
    print(f"\n❌ Error fetching document: {e}")
