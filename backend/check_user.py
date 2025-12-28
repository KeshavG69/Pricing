"""Quick script to check if a user exists in MongoDB"""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from auth.database import get_mongodb_client

email = "gargkeshav204@gmail.com"
org_id = "693acb814e428dd4d3f75e3f"

db = get_mongodb_client().get_database()

print(f"\n🔍 Checking for user: {email}\n")

# Check by email only
user = db.users.find_one({"email": email})

if user:
    print("✅ User FOUND in database:")
    print(f"   _id: {user.get('_id')}")
    print(f"   email: {user.get('email')}")
    print(f"   firstName: {user.get('firstName')}")
    print(f"   lastName: {user.get('lastName')}")
    print(f"   organization_id (legacy): {user.get('organization_id')}")
    print(f"   organizations: {user.get('organizations')}")

    # Check if in specific org
    orgs = user.get("organizations", [])
    in_org = any(o.get("organization_id") == org_id for o in orgs)
    print(f"\n   In org {org_id}? {'YES' if in_org else 'NO'}")
else:
    print("❌ User NOT found in database")

# Also check pending invitations
print(f"\n🔍 Checking for pending invitations to: {email}\n")
invitation = db.invitations.find_one({"email": email, "status": "pending"})
if invitation:
    print("✅ Pending invitation FOUND:")
    print(f"   organization_id: {invitation.get('organization_id')}")
    print(f"   status: {invitation.get('status')}")
else:
    print("❌ No pending invitation found")
