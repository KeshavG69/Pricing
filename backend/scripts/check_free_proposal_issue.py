"""
Script to check free proposal billing issue.
"""

import os
from pymongo import MongoClient
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "oews_data")

def check_billing_issue():
    print("Connecting to MongoDB...")
    client = MongoClient(MONGODB_URL)
    db = client[MONGODB_DATABASE]

    # Find user with "rajesh" in email
    print("=" * 80)
    print("SEARCHING FOR USER WITH 'rajesh' IN EMAIL")
    print("=" * 80)

    users = list(db.users.find({"email": {"$regex": "rajesh", "$options": "i"}}))

    if not users:
        print("❌ No user found with 'rajesh' in email")
        return

    for user in users:
        print(f"\n✅ Found user: {user['email']}")
        print(f"   User ID: {user['_id']}")
        print(f"   Organization ID: {user.get('organization_id')}")
        print(f"   Role: {user.get('role')}")

        user_id = user['_id']

        # Check proposals by this user (even without org_id)
        print("\n" + "=" * 80)
        print(f"PROPOSALS FOR USER {user['email']}")
        print("=" * 80)

        proposals = list(db.proposals.find({"user_id": user_id}).sort("created_at", 1))
        print(f"   Total proposals: {len(proposals)}")

        for idx, proposal in enumerate(proposals, 1):
            print(f"\n   Proposal #{idx}:")
            print(f"   ID: {proposal['_id']}")
            print(f"   Name: {proposal.get('name', 'Untitled')}")
            print(f"   Created: {proposal.get('created_at')}")
            print(f"   User ID: {proposal.get('user_id')}")
            print(f"   Organization ID: {proposal.get('organization_id', 'None')}")
            print(f"   Billing Status: {proposal.get('billing_status', 'N/A')}")

        # Check billing records for this user
        print("\n" + "=" * 80)
        print("BILLING RECORDS (by user proposals)")
        print("=" * 80)

        proposal_ids = [str(p['_id']) for p in proposals]

        # Try both string and ObjectId formats
        from bson import ObjectId
        proposal_ids_obj = [p['_id'] for p in proposals]

        billing_records = list(db.billing.find({
            "$or": [
                {"proposal_id": {"$in": proposal_ids}},
                {"proposal_id": {"$in": proposal_ids_obj}}
            ]
        }).sort("created_at", 1))

        # Also check by organization_id if proposals have it
        org_ids = list(set([str(p['organization_id']) for p in proposals if p.get('organization_id')]))

        # ALWAYS check all billing records for the organization
        print(f"\n   ℹ️  Checking ALL billing records for organization(s): {org_ids}")
        all_org_billing = list(db.billing.find({
            "organization_id": {"$in": org_ids}
        }).sort("created_at", 1))

        if all_org_billing and not billing_records:
            billing_records = all_org_billing
        elif all_org_billing:
            print(f"   ℹ️  Found {len(all_org_billing)} total billing records for organization")
            if len(all_org_billing) > len(billing_records):
                print(f"   ⚠️  More billing records in org than linked to user's proposals!")
                billing_records = all_org_billing

        if not billing_records:
            print("   ℹ️  No billing records found")
        else:
            for idx, record in enumerate(billing_records, 1):
                print(f"\n   Billing Record #{idx}:")
                print(f"   ID: {record['_id']}")
                print(f"   Proposal ID: {record.get('proposal_id')}")
                print(f"   Organization ID: {record.get('organization_id')}")
                print(f"   Charge Type: {record.get('charge_type')}")
                print(f"   Amount: ${record.get('amount_cents', 0) / 100:.2f}")
                print(f"   Status: {record.get('status')}")
                print(f"   Description: {record.get('description')}")
                print(f"   Created: {record.get('created_at')}")
                print(f"   Stripe Payment Intent: {record.get('stripe_payment_intent_id', 'N/A')}")

        # Analysis for users without organization
        print("\n" + "=" * 80)
        print("ANALYSIS")
        print("=" * 80)

        if not user.get('organization_id'):
            print("   ⚠️  USER HAS NO ORGANIZATION (old account, pre-organization system)")
            print("   This user needs to be migrated to the organization system")

            # But check if proposals have organization_id
            if proposals and proposals[0].get('organization_id'):
                proposal_org_id = proposals[0].get('organization_id')
                print(f"\n   ℹ️  However, proposal HAS organization_id: {proposal_org_id}")
                print("   Checking that organization...")

                from bson import ObjectId
                org = db.organizations.find_one({"_id": ObjectId(proposal_org_id)})
                if org:
                    print(f"\n   Organization found:")
                    print(f"   Name: {org.get('name')}")
                    print(f"   Owner ID: {org.get('owner_id')}")
                    print(f"   First Proposal Used Flag: {org.get('first_proposal_used', False)}")
                    print(f"   Created: {org.get('created_at')}")

                    if org.get('first_proposal_used'):
                        print("\n   ❌ PROBLEM: Organization has 'first_proposal_used' = True")
                        print("   This means the free proposal was already marked as used")
                        print("   BUT this is the FIRST (and only) proposal for this user!")

            if billing_records:
                charged_records = [r for r in billing_records if r.get('amount_cents', 0) > 0 and r.get('status') == 'succeeded']
                free_records = [r for r in billing_records if r.get('amount_cents', 0) == 0]

                print(f"\n   Total billing records: {len(billing_records)}")
                print(f"   Charged records: {len(charged_records)}")
                print(f"   Free records: {len(free_records)}")

                if len(charged_records) > 0:
                    print("\n   ❌ ISSUE CONFIRMED: User was charged $100!")
                    print("   REASON: User account has no organization_id (pre-organization system)")
                    print("   OR organization's 'first_proposal_used' flag was incorrectly set to True")
                    print("\n   RECOMMENDED FIXES:")
                    print("   1. Refund the $100 charge via Stripe")
                    print("   2. Update user record to have organization_id")
                    print("   3. Reset organization's 'first_proposal_used' flag to False")

            continue

        org_id = user.get('organization_id')

        # Check organization settings
        print("\n" + "=" * 80)
        print(f"ORGANIZATION DETAILS (ID: {org_id})")
        print("=" * 80)

        org = db.organizations.find_one({"_id": org_id})
        if org:
            print(f"   Name: {org.get('name')}")
            print(f"   First Proposal Used Flag: {org.get('first_proposal_used', False)}")
            print(f"   Stripe Customer ID: {org.get('stripe_customer_id', 'None')}")
            print(f"   Default Payment Method: {org.get('default_payment_method_id', 'None')}")
            print(f"   Created: {org.get('created_at')}")
        else:
            print("   ❌ Organization not found")
            continue

        # Count proposals for this organization
        proposal_count = db.proposals.count_documents({"organization_id": org_id})
        print(f"   Total Proposals: {proposal_count}")

        # Get all proposals with creation dates
        print("\n" + "=" * 80)
        print("PROPOSALS")
        print("=" * 80)

        proposals = list(db.proposals.find(
            {"organization_id": org_id}
        ).sort("created_at", 1))

        for idx, proposal in enumerate(proposals, 1):
            print(f"\n   Proposal #{idx}:")
            print(f"   ID: {proposal['_id']}")
            print(f"   Name: {proposal.get('name', 'Untitled')}")
            print(f"   Created: {proposal.get('created_at')}")
            print(f"   Billing Status: {proposal.get('billing_status', 'N/A')}")

        # Check billing records
        print("\n" + "=" * 80)
        print("BILLING RECORDS")
        print("=" * 80)

        billing_records = list(db.billing.find(
            {"organization_id": str(org_id)}
        ).sort("created_at", 1))

        if not billing_records:
            print("   ℹ️  No billing records found")
        else:
            for idx, record in enumerate(billing_records, 1):
                print(f"\n   Billing Record #{idx}:")
                print(f"   ID: {record['_id']}")
                print(f"   Proposal ID: {record.get('proposal_id')}")
                print(f"   Charge Type: {record.get('charge_type')}")
                print(f"   Amount: ${record.get('amount_cents', 0) / 100:.2f}")
                print(f"   Status: {record.get('status')}")
                print(f"   Description: {record.get('description')}")
                print(f"   Created: {record.get('created_at')}")
                print(f"   Stripe Payment Intent: {record.get('stripe_payment_intent_id', 'N/A')}")

        # Analysis
        print("\n" + "=" * 80)
        print("ANALYSIS")
        print("=" * 80)

        first_proposal_used = org.get('first_proposal_used', False)
        has_payment_method = bool(org.get('stripe_customer_id') and org.get('default_payment_method_id'))

        print(f"   First proposal flag: {first_proposal_used}")
        print(f"   Has payment method: {has_payment_method}")
        print(f"   Total proposals: {proposal_count}")
        print(f"   Total billing records: {len(billing_records)}")

        if billing_records:
            charged_records = [r for r in billing_records if r.get('amount_cents', 0) > 0 and r.get('status') == 'succeeded']
            free_records = [r for r in billing_records if r.get('amount_cents', 0) == 0]

            print(f"   Charged records: {len(charged_records)}")
            print(f"   Free records: {len(free_records)}")

            if not first_proposal_used and len(charged_records) > 0:
                print("\n   ❌ ISSUE FOUND: User was charged but first_proposal_used flag is False!")
                print("   This means the first proposal should have been free.")
            elif first_proposal_used and len(free_records) > 0:
                print("\n   ✅ First proposal was free (as expected)")
            elif not first_proposal_used and proposal_count == 0:
                print("\n   ℹ️  No proposals created yet, first proposal will be free")
            elif first_proposal_used and len(charged_records) > 0:
                print("\n   ✅ User already used free proposal, subsequent proposals are charged")

if __name__ == "__main__":
    check_billing_issue()
