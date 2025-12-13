"""
Test script to verify proposal queries work correctly with organization filtering.
"""

from auth.database import MongoDB
from bson import ObjectId
from utils.proposals import get_proposal_crud


def test_proposal_queries():
    """Test that proposal queries work correctly."""
    db = MongoDB.get_database()
    users_collection = db["users"]

    # Get the test user
    user = users_collection.find_one({"email": "gargkeshav204@gmail.com"})

    if not user:
        print("❌ User not found")
        return

    print(f"\n✓ Found user: {user['email']}")
    print(f"  User ID: {user['_id']}")
    print(f"  Current org: {user.get('current_organization_id')}")
    print(f"  Role in current org: {user.get('role')}")

    # Get proposals using the CRUD method
    crud = get_proposal_crud(db["proposals"])

    user_id = str(user["_id"])
    org_id = user.get("current_organization_id")
    role = user.get("role", "user")

    print(f"\nQuerying proposals with:")
    print(f"  user_id: {user_id} (type: {type(user_id)})")
    print(f"  organization_id: {org_id} (type: {type(org_id)})")
    print(f"  role: {role}")

    proposals = crud.get_user_proposals_by_org(
        user_id=user_id,
        organization_id=org_id,
        role=role
    )

    print(f"\n✅ Found {len(proposals)} proposals:")
    for prop in proposals[:5]:  # Show first 5
        print(f"  - {prop.get('name')} (ID: {prop['_id']})")
        print(f"    user_id: {prop.get('user_id')}")
        print(f"    organization_id: {prop.get('organization_id')}")

    if len(proposals) > 5:
        print(f"  ... and {len(proposals) - 5} more")


if __name__ == "__main__":
    test_proposal_queries()
