"""
Migration script to add organization support to existing database.

This script:
1. Creates an organization for each existing user (user becomes owner/admin)
2. Updates users with organization_id and role='admin'
3. Updates proposals with organization_id, visibility, and shared_with fields
4. Creates necessary indexes

**IMPORTANT**: Backup your database before running this migration!

Usage:
    python -m scripts.migrate_to_organizations
    python -m scripts.migrate_to_organizations --dry-run  # Preview changes without committing
"""

import sys
from bson import ObjectId
from datetime import datetime
from auth.database import MongoDB


def migrate_to_organizations(dry_run=False):
    """
    Migrate existing users and proposals to organization system.

    Args:
        dry_run: If True, preview changes without committing to database
    """
    db = MongoDB.get_database()

    mode = "DRY RUN" if dry_run else "LIVE MIGRATION"

    print("=" * 70)
    print(f"MIGRATION: Adding Organization Support ({mode})")
    print("=" * 70)

    if dry_run:
        print("\n⚠️  DRY RUN MODE - No changes will be made to the database\n")
    else:
        print("\n⚠️  LIVE MODE - Changes will be permanent!")
        confirm = input("Type 'yes' to confirm migration: ")
        if confirm.lower() != "yes":
            print("Migration cancelled.")
            return
        print()

    user_org_mapping = {}
    stats = {
        "users_processed": 0,
        "users_skipped": 0,
        "organizations_created": 0,
        "proposals_processed": 0,
        "proposals_skipped": 0
    }

    # ========================================================================
    # STEP 1: Process existing users
    # ========================================================================
    print("[1/4] Processing existing users...")
    print("-" * 70)

    users = list(db.users.find({}))
    print(f"Found {len(users)} users")

    for user in users:
        user_id = user["_id"]
        email = user.get("email", "unknown")

        # Skip if already has organization_id
        if "organization_id" in user:
            print(f"  ⏭️  User {email} already has organization")
            user_org_mapping[user_id] = user["organization_id"]
            stats["users_skipped"] += 1
            continue

        # Create organization for user
        org_name = f"{user.get('firstName', 'User')} {user.get('lastName', '')}'s Organization".strip()

        org = {
            "_id": ObjectId(),
            "name": org_name,
            "slug": f"org-{user_id}",
            "owner_id": user_id,
            "created_at": user.get("createdAt", datetime.utcnow()),
            "updated_at": datetime.utcnow(),
            "status": "active",
            "settings": {
                "default_rates": {
                    "fringe": 0.247,
                    "oh": 0.0711,
                    "ga": 0.2243,
                    "fee": 0.07,
                    "smh": 0.065,
                    "sub_fee": 0.05,
                    "ga_passthrough": 0.025,
                    "ga_adder": 0.0243
                },
                "default_escalation_rates": {},
                "fte_threshold": 1920,
                "allow_user_rate_override": True
            },
            "subscription": {
                "plan": "free",
                "seats": 5,
                "expires_at": None
            }
        }

        org_id = org["_id"]
        user_org_mapping[user_id] = org_id

        if not dry_run:
            db.organizations.insert_one(org)

        print(f"  ✅ Created org '{org_name}' for {email}")
        stats["organizations_created"] += 1
        stats["users_processed"] += 1

    # ========================================================================
    # STEP 2: Update users with organization_id and role
    # ========================================================================
    print(f"\n[2/4] Updating {stats['users_processed']} users with organization data...")
    print("-" * 70)

    for user_id, org_id in user_org_mapping.items():
        # Skip if user already had organization
        user = db.users.find_one({"_id": user_id})
        if user and "organization_id" in user:
            continue

        update_data = {
            "organization_id": org_id,
            "role": "admin",  # Existing users become admins of their orgs
            "status": "active",
            "updatedAt": datetime.utcnow()
        }

        if not dry_run:
            db.users.update_one(
                {"_id": user_id},
                {"$set": update_data}
            )

        print(f"  ✅ Updated user {user_id}")

    # ========================================================================
    # STEP 3: Update proposals with organization_id
    # ========================================================================
    print(f"\n[3/4] Processing proposals...")
    print("-" * 70)

    proposals = list(db.proposals.find({}))
    print(f"Found {len(proposals)} proposals")

    for proposal in proposals:
        proposal_id = proposal["_id"]

        # Skip if already has organization_id
        if "organization_id" in proposal:
            print(f"  ⏭️  Proposal {proposal_id} already migrated")
            stats["proposals_skipped"] += 1
            continue

        user_id = proposal.get("user_id")

        # Handle string user_id (old system) vs ObjectId (new system)
        if isinstance(user_id, str):
            try:
                user_id_obj = ObjectId(user_id)
            except:
                user_id_obj = user_id  # Keep as string if not valid ObjectId
        else:
            user_id_obj = user_id

        # Get organization_id from mapping
        if user_id_obj not in user_org_mapping:
            print(f"  ⚠️  Proposal {proposal_id} has unknown user_id {user_id}, skipping")
            stats["proposals_skipped"] += 1
            continue

        org_id = user_org_mapping[user_id_obj]

        update_data = {
            "organization_id": org_id,
            "visibility": "private",
            "shared_with": [],
            "updated_at": datetime.utcnow()
        }

        if not dry_run:
            db.proposals.update_one(
                {"_id": proposal_id},
                {"$set": update_data}
            )

        print(f"  ✅ Updated proposal {proposal_id}")
        stats["proposals_processed"] += 1

    # ========================================================================
    # STEP 4: Create indexes
    # ========================================================================
    print(f"\n[4/4] Creating indexes...")
    print("-" * 70)

    if not dry_run:
        from scripts.create_indexes import create_indexes
        try:
            create_indexes()
        except Exception as e:
            print(f"  ⚠️  Index creation warning: {e}")
            print("  You can manually run: python -m scripts.create_indexes")
    else:
        print("  ⏭️  Skipping index creation in dry-run mode")

    # ========================================================================
    # SUMMARY
    # ========================================================================
    print("\n" + "=" * 70)
    print(f"MIGRATION {'PREVIEW' if dry_run else 'COMPLETED'}")
    print("=" * 70)
    print(f"  Organizations created: {stats['organizations_created']}")
    print(f"  Users updated:         {stats['users_processed']}")
    print(f"  Users skipped:         {stats['users_skipped']}")
    print(f"  Proposals updated:     {stats['proposals_processed']}")
    print(f"  Proposals skipped:     {stats['proposals_skipped']}")
    print("=" * 70)

    if dry_run:
        print("\n✅ Dry run complete. Re-run without --dry-run to apply changes.")
    else:
        print("\n✅ Migration complete!")
        print("\n⚠️  IMPORTANT: Update your JWT token creation to handle organization_id")
        print("   Existing sessions may need to be refreshed.")

    return stats


def rollback_migration():
    """
    Rollback organization migration (use with caution!).

    Removes organization-related fields from users and proposals.
    Does NOT delete organization documents.
    """
    db = MongoDB.get_database()

    print("\n⚠️  WARNING: Rolling back organization migration...")
    confirm = input("This will remove organization fields. Type 'yes' to confirm: ")

    if confirm.lower() != "yes":
        print("Rollback cancelled.")
        return

    print("\nRemoving organization fields from users...")
    result = db.users.update_many(
        {},
        {"$unset": {"organization_id": "", "role": "", "status": ""}}
    )
    print(f"  Updated {result.modified_count} users")

    print("\nRemoving organization fields from proposals...")
    result = db.proposals.update_many(
        {},
        {"$unset": {"organization_id": "", "visibility": "", "shared_with": ""}}
    )
    print(f"  Updated {result.modified_count} proposals")

    print("\n✅ Rollback complete")
    print("⚠️  Note: Organization documents were NOT deleted")


if __name__ == "__main__":
    # Check for command-line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--dry-run":
            migrate_to_organizations(dry_run=True)
        elif sys.argv[1] == "--rollback":
            rollback_migration()
        else:
            print("Usage:")
            print("  python -m scripts.migrate_to_organizations          # Run migration")
            print("  python -m scripts.migrate_to_organizations --dry-run  # Preview changes")
            print("  python -m scripts.migrate_to_organizations --rollback # Rollback migration")
    else:
        # Run migration
        try:
            migrate_to_organizations(dry_run=False)
        except Exception as e:
            print(f"\n❌ MIGRATION FAILED: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
