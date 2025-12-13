"""
Check proposal and user data to debug workspace switching issue.
"""

from auth.database import MongoDB
from bson import ObjectId


def check_proposals_and_users():
    """Check proposals and users data."""
    db = MongoDB.get_database()
    proposals_collection = db["proposals"]
    users_collection = db["users"]

    print("=" * 60)
    print("CHECKING USERS")
    print("=" * 60)

    users = users_collection.find()
    for user in users:
        print(f"\nUser: {user.get('email')}")
        print(f"  _id: {user['_id']}")
        print(f"  current_organization_id: {user.get('current_organization_id')}")
        print(f"  organizations: {user.get('organizations', [])}")
        print(f"  Old organization_id: {user.get('organization_id')}")
        print(f"  role: {user.get('role')}")

    print("\n" + "=" * 60)
    print("CHECKING PROPOSALS")
    print("=" * 60)

    proposals = proposals_collection.find()
    proposal_count = 0
    for proposal in proposals:
        proposal_count += 1
        print(f"\nProposal: {proposal.get('name')}")
        print(f"  _id: {proposal['_id']}")
        print(f"  user_id: {proposal.get('user_id')} (type: {type(proposal.get('user_id'))})")
        print(f"  organization_id: {proposal.get('organization_id')}")
        print(f"  status: {proposal.get('status')}")

    print(f"\nTotal proposals: {proposal_count}")


if __name__ == "__main__":
    check_proposals_and_users()
