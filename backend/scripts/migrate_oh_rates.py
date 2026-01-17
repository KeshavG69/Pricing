"""
Migration: Split 'oh' into 'oh_onsite' and 'oh_offsite'

This script migrates existing data to support separate overhead rates for on-site and off-site positions.

Changes:
- Organizations: Rename 'oh' to 'oh_onsite' and add 'oh_offsite' in settings.default_rates
- Proposals: Migrate 'oh' to 'oh_onsite' and 'oh_offsite' in rates field
- Proposals: Migrate 'oh' to 'oh_onsite' and 'oh_offsite' in spreadsheet_data.rates field

Usage:
    cd backend
    uv run python scripts/migrate_oh_rates.py
"""

from auth.database import get_mongodb_client
from datetime import datetime


def migrate_organizations():
    """Migrate organization default_rates from 'oh' to 'oh_onsite' and 'oh_offsite'"""
    print("\n=== Migrating Organizations ===")

    mongodb = get_mongodb_client()
    db = mongodb.get_database()
    orgs = db["organizations"]

    # Find organizations with old 'oh' field
    cursor = orgs.find({"settings.default_rates.oh": {"$exists": True}})
    count = 0

    for org in cursor:
        old_oh = org["settings"]["default_rates"]["oh"]

        print(f"Migrating organization: {org['name']} (oh={old_oh})")

        orgs.update_one(
            {"_id": org["_id"]},
            {
                "$set": {
                    "settings.default_rates.oh_onsite": old_oh,
                    "settings.default_rates.oh_offsite": old_oh,
                    "updated_at": datetime.utcnow()
                },
                "$unset": {"settings.default_rates.oh": ""}
            }
        )
        count += 1

    print(f"✓ Migrated {count} organizations")


def migrate_proposals_rates():
    """Migrate proposal.rates from 'oh' to 'oh_onsite' and 'oh_offsite'"""
    print("\n=== Migrating Proposal Rates ===")

    mongodb = get_mongodb_client()
    db = mongodb.get_database()
    proposals = db["proposals"]

    # Find proposals with old 'oh' field in rates
    cursor = proposals.find({"rates.oh": {"$exists": True}})
    count = 0

    for prop in cursor:
        old_oh = prop["rates"]["oh"]

        print(f"Migrating proposal rates: {prop.get('name', 'Unnamed')} (oh={old_oh})")

        proposals.update_one(
            {"_id": prop["_id"]},
            {
                "$set": {
                    "rates.oh_onsite": old_oh,
                    "rates.oh_offsite": old_oh,
                },
                "$unset": {"rates.oh": ""}
            }
        )
        count += 1

    print(f"✓ Migrated {count} proposal rates")


def migrate_proposals_spreadsheet_data():
    """Migrate proposal.spreadsheet_data.rates from 'oh' to 'oh_onsite' and 'oh_offsite'"""
    print("\n=== Migrating Proposal Spreadsheet Data Rates ===")

    mongodb = get_mongodb_client()
    db = mongodb.get_database()
    proposals = db["proposals"]

    # Find proposals with old 'oh' field in spreadsheet_data.rates
    cursor = proposals.find({"spreadsheet_data.rates.oh": {"$exists": True}})
    count = 0

    for prop in cursor:
        old_oh = prop["spreadsheet_data"]["rates"]["oh"]

        print(f"Migrating proposal spreadsheet data: {prop.get('name', 'Unnamed')} (oh={old_oh})")

        proposals.update_one(
            {"_id": prop["_id"]},
            {
                "$set": {
                    "spreadsheet_data.rates.oh_onsite": old_oh,
                    "spreadsheet_data.rates.oh_offsite": old_oh,
                },
                "$unset": {"spreadsheet_data.rates.oh": ""}
            }
        )
        count += 1

    print(f"✓ Migrated {count} proposal spreadsheet data rates")


def migrate_rate_presets():
    """Migrate rate presets from 'oh' to 'oh_onsite' and 'oh_offsite'"""
    print("\n=== Migrating Rate Presets ===")

    mongodb = get_mongodb_client()
    db = mongodb.get_database()
    orgs = db["organizations"]

    # Find organizations with rate presets containing old 'oh' field
    cursor = orgs.find({"settings.rate_presets": {"$exists": True, "$ne": []}})
    orgs_updated = 0
    presets_migrated = 0

    for org in cursor:
        presets = org.get("settings", {}).get("rate_presets", [])
        updated_presets = []
        org_needs_update = False

        for preset in presets:
            if "oh" in preset:
                old_oh = preset["oh"]
                print(f"Migrating preset: {preset['name']} in {org['name']} (oh={old_oh})")

                # Create updated preset
                updated_preset = {**preset}
                updated_preset["oh_onsite"] = old_oh
                updated_preset["oh_offsite"] = old_oh
                del updated_preset["oh"]

                updated_presets.append(updated_preset)
                org_needs_update = True
                presets_migrated += 1
            else:
                updated_presets.append(preset)

        if org_needs_update:
            orgs.update_one(
                {"_id": org["_id"]},
                {
                    "$set": {
                        "settings.rate_presets": updated_presets,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            orgs_updated += 1

    print(f"✓ Migrated {presets_migrated} rate presets across {orgs_updated} organizations")


if __name__ == "__main__":
    print("=" * 60)
    print("OH Rate Migration Script")
    print("=" * 60)
    print("\nThis script will migrate 'oh' to 'oh_onsite' and 'oh_offsite'")
    print("for all organizations and proposals in the database.")
    print("\nPress Enter to continue or Ctrl+C to cancel...")
    input()

    try:
        migrate_organizations()
        migrate_proposals_rates()
        migrate_proposals_spreadsheet_data()
        migrate_rate_presets()

        print("\n" + "=" * 60)
        print("✓ Migration completed successfully!")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        raise
