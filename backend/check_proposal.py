#!/usr/bin/env python3
"""Check proposal escalate flags in MongoDB"""

from auth.database import get_mongodb_client
from bson import ObjectId

# Get MongoDB connection
mongodb = get_mongodb_client()
db = mongodb.get_database()
proposals_collection = db['proposals']

# Query the proposal
proposal_id = "6959c65efd0a29c39050bbbd"
proposal = proposals_collection.find_one({"_id": ObjectId(proposal_id)})

if proposal:
    print(f"=== PROPOSAL: {proposal.get('name', 'Unnamed')} ===")
    print()

    # Check spreadsheet_data for travel and ODCs
    spreadsheet_data = proposal.get('spreadsheet_data', {})

    print("TRAVEL ITEMS:")
    travel_items = spreadsheet_data.get('travel', [])
    if travel_items:
        for idx, item in enumerate(travel_items, 1):
            print(f"\n  Travel Item {idx}:")
            print(f"    Description: {item.get('description', 'N/A')}")
            print(f"    Escalate: {item.get('escalate', 'NOT SET')}")

            amounts = item.get('amount_per_year', {})
            if amounts:
                print(f"    Amounts per year:")
                for year in sorted(amounts.keys(), key=lambda x: int(x)):
                    amount = amounts[year]
                    print(f"      Year {year}: ${amount:,.2f}")
    else:
        print("  No travel items found")

    print()
    print("ODC ITEMS:")
    odc_items = spreadsheet_data.get('odcs', [])
    if odc_items:
        for idx, item in enumerate(odc_items, 1):
            print(f"\n  ODC Item {idx}:")
            print(f"    Category: {item.get('category', 'N/A')}")
            print(f"    Description: {item.get('description', 'N/A')}")
            print(f"    Escalate: {item.get('escalate', 'NOT SET')}")

            amounts = item.get('amount_per_year', {})
            if amounts:
                print(f"    Amounts per year:")
                for year in sorted(amounts.keys(), key=lambda x: int(x)):
                    amount = amounts[year]
                    print(f"      Year {year}: ${amount:,.2f}")
    else:
        print("  No ODC items found")

    print()
    print("ESCALATION RATES:")
    escalation_rates = spreadsheet_data.get('escalation_rates', {})
    if escalation_rates:
        for key in sorted(escalation_rates.keys()):
            rate = escalation_rates[key]
            print(f"  {key}: {rate} ({rate*100:.2f}%)")
    else:
        print("  No escalation rates set")

    print()
    print("SUBCONTRACTOR DATA:")
    subcontractors = spreadsheet_data.get('subcontractors', [])
    if subcontractors:
        for idx, sub in enumerate(subcontractors, 1):
            print(f"\n  Subcontractor {idx}: {sub.get('name', 'N/A')}")

            positions = sub.get('positions', [])
            if positions:
                print(f"  Positions ({len(positions)} total):")
                for pos_idx, pos in enumerate(positions[:2], 1):  # Show first 2 positions only
                    print(f"\n    Position {pos_idx}:")
                    print(f"      Labor Category: {pos.get('labor_category', 'N/A')}")
                    print(f"      Has 'rate' field: {'rate' in pos}")
                    if 'rate' in pos:
                        print(f"      Rate: ${pos['rate']:,.2f}")

                    # Check for per-year rates
                    year_rates = {k: v for k, v in pos.items() if k.startswith('year_') and k.endswith('_rate')}
                    if year_rates:
                        print(f"      Per-year rates found:")
                        for year_key in sorted(year_rates.keys()):
                            print(f"        {year_key}: ${year_rates[year_key]:,.2f}")
                    else:
                        print(f"      No per-year rates found")

                    # Check hours structure
                    hours_per_year = pos.get('hours_per_year', {})
                    if hours_per_year:
                        print(f"      Hours per year:")
                        for year in sorted(hours_per_year.keys(), key=lambda x: int(x)):
                            print(f"        Year {year}: {hours_per_year[year]:.2f} hours")

                if len(positions) > 2:
                    print(f"\n    ... and {len(positions) - 2} more positions")
            else:
                print("    No positions found")
    else:
        print("  No subcontractors found")

else:
    print(f"Proposal with ID {proposal_id} not found")
