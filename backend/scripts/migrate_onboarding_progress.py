"""Migration: Update onboarding progress for existing users based on completed actions."""
from pymongo import MongoClient
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


def migrate_onboarding_progress():
    """
    Update onboarding progress for existing users based on actual completed actions:
    - rates_configured: Check if organization has custom rates
    - payment_added: Check if organization has Stripe customer_id
    - team_invited: Check if organization has multiple users or sent invitations
    - first_proposal_uploaded: Check if user has any proposals
    """
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    database_name = os.getenv("MONGODB_DATABASE", "oews_data")
    client = MongoClient(mongodb_url)
    db = client.get_database(database_name)

    users_collection = db["users"]
    organizations_collection = db["organizations"]
    proposals_collection = db["proposals"]
    invitations_collection = db["invitations"]
    onboarding_collection = db["onboarding_progress"]

    print("Starting onboarding progress migration...")

    # Get all users
    users = list(users_collection.find({}))
    print(f"Found {len(users)} users to process")

    updated_count = 0

    for user in users:
        user_id = user["_id"]
        org_id = user.get("organization_id")
        role = user.get("role", "user")

        print(f"\nProcessing user: {user.get('email')} (role: {role})")

        # Get or create onboarding progress
        progress = onboarding_collection.find_one({"user_id": user_id})

        if not progress:
            # Create new progress document
            progress = {
                "user_id": user_id,
                "organization_id": org_id,
                "tour_completed": False,
                "tour_skipped": False,
                "tour_last_step": 0,
                "tour_started_at": None,
                "tour_completed_at": None,
                "tasks": {
                    "first_proposal_uploaded": False,
                    "rates_configured": False,
                    "payment_added": False,
                    "team_invited": False,
                },
                "checklist_dismissed": False,
                "checklist_collapsed": False,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            print("  Created new onboarding progress")

        tasks = progress.get("tasks", {})
        tasks_updated = False

        # Check first_proposal_uploaded (for all users)
        if not tasks.get("first_proposal_uploaded"):
            proposal_count = proposals_collection.count_documents({"user_id": user_id})
            if proposal_count > 0:
                tasks["first_proposal_uploaded"] = True
                tasks_updated = True
                print(f"  ✓ first_proposal_uploaded (found {proposal_count} proposals)")

        # Admin-only tasks
        if role == "admin" and org_id:
            org = organizations_collection.find_one({"_id": org_id})

            if org:
                # Check rates_configured
                if not tasks.get("rates_configured"):
                    default_rates = org.get("default_rates", {})
                    # Check if rates are configured (not all zeros/defaults)
                    has_custom_rates = (
                        default_rates.get("fringe", 0) > 0 or
                        default_rates.get("oh_onsite", 0) > 0 or
                        default_rates.get("oh_offsite", 0) > 0 or
                        default_rates.get("ga", 0) > 0 or
                        default_rates.get("fee", 0) > 0
                    )
                    if has_custom_rates:
                        tasks["rates_configured"] = True
                        tasks_updated = True
                        print("  ✓ rates_configured (found custom rates)")

                # Check payment_added
                if not tasks.get("payment_added"):
                    stripe_customer_id = org.get("stripe_customer_id")
                    if stripe_customer_id:
                        tasks["payment_added"] = True
                        tasks_updated = True
                        print("  ✓ payment_added (found Stripe customer)")

                # Check team_invited
                if not tasks.get("team_invited"):
                    # Count users in organization (excluding current user)
                    other_users_count = users_collection.count_documents({
                        "organization_id": org_id,
                        "_id": {"$ne": user_id}
                    })

                    # Or check if any invitations were sent
                    invitations_count = invitations_collection.count_documents({
                        "organization_id": org_id
                    })

                    if other_users_count > 0 or invitations_count > 0:
                        tasks["team_invited"] = True
                        tasks_updated = True
                        print(f"  ✓ team_invited (found {other_users_count} users, {invitations_count} invitations)")

        # Calculate completion stats
        if role == "admin":
            # Admin sees all 4 tasks
            total_tasks = 4
            completed_tasks = sum([
                tasks.get("first_proposal_uploaded", False),
                tasks.get("rates_configured", False),
                tasks.get("payment_added", False),
                tasks.get("team_invited", False),
            ])
        else:
            # Regular user sees only 1 task
            total_tasks = 1
            completed_tasks = 1 if tasks.get("first_proposal_uploaded", False) else 0

        completion_percentage = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0

        progress["tasks"] = tasks
        progress["completion_stats"] = {
            "completed_count": completed_tasks,
            "total_count": total_tasks,
            "percentage": completion_percentage
        }
        progress["updated_at"] = datetime.now(timezone.utc)

        # Upsert the progress document
        if tasks_updated or not progress.get("_id"):
            onboarding_collection.update_one(
                {"user_id": user_id},
                {"$set": progress},
                upsert=True
            )
            updated_count += 1
            print(f"  Progress: {completed_tasks}/{total_tasks} tasks completed ({completion_percentage:.0f}%)")

    print(f"\n✅ Migration complete! Updated {updated_count} users")
    print(f"Total users processed: {len(users)}")


if __name__ == "__main__":
    migrate_onboarding_progress()
