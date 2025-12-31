"""Check what's actually stored in MongoDB for this proposal."""

from auth.database import get_mongodb_client
from bson import ObjectId

# Connect to MongoDB
mongodb = get_mongodb_client()
db = mongodb.get_database()

# Find the proposal
proposal_id = ObjectId("6952bf5befd4ee452bc6c3f1")  # Fresh upload
proposal = db.proposals.find_one({"_id": proposal_id})

if not proposal:
    print(f"Proposal {proposal_id} not found!")
    exit(1)

print("=" * 80)
print("CHECKING MONGODB DATA")
print("=" * 80)

# Check if we have positions or jobs
if proposal.get("spreadsheet_data", {}).get("positions"):
    positions = proposal["spreadsheet_data"]["positions"]
    source = "spreadsheet_data.positions"
elif proposal.get("jobs"):
    positions = proposal["jobs"]
    source = "jobs"
else:
    print("No positions found!")
    exit(1)

print(f"\nData source: {source}")
print(f"Total positions: {len(positions)}")

# Find AI/ML Analyst positions
aiml_positions = [p for p in positions if 'Artificial Intelligence' in p.get('labor_category', '')]
print(f"\n" + "=" * 80)
print(f"AI/ML Analyst: Found {len(aiml_positions)} positions")
print("=" * 80)

for i, pos in enumerate(aiml_positions, 1):
    print(f"\nPosition {i}:")
    print(f"  Labor Category: {pos.get('labor_category')}")
    print(f"  hours_per_year: {pos.get('hours_per_year', 'NOT SET')}")
    if pos.get('hours_per_year'):
        total = sum(pos['hours_per_year'].values())
        print(f"  Total hours: {total}")

# Find Systems Administrator (Windows) positions
sysadmin_positions = [p for p in positions if p.get('labor_category') == 'Systems Administrator (Windows)']
print(f"\n" + "=" * 80)
print(f"Systems Administrator (Windows): Found {len(sysadmin_positions)} positions")
print("=" * 80)

if len(sysadmin_positions) > 0:
    print(f"\nShowing first 3 positions:")
    for i, pos in enumerate(sysadmin_positions[:3], 1):
        print(f"\n  Position {i}:")
        print(f"    hours_per_year: {pos.get('hours_per_year', 'NOT SET')}")
        if pos.get('hours_per_year'):
            total = sum(pos['hours_per_year'].values())
            print(f"    Total hours: {total}")

    if len(sysadmin_positions) > 3:
        print(f"\n  Last position:")
        pos = sysadmin_positions[-1]
        print(f"    hours_per_year: {pos.get('hours_per_year', 'NOT SET')}")
        if pos.get('hours_per_year'):
            total = sum(pos['hours_per_year'].values())
            print(f"    Total hours: {total}")

# Check subcontractors
subs = proposal.get("spreadsheet_data", {}).get("subcontractors", [])
print(f"\n" + "=" * 80)
print(f"SUBCONTRACTORS: {len(subs)} found")
print("=" * 80)

for sub in subs:
    print(f"\n{sub.get('name', 'Unknown')}:")
    print(f"  Workshare: {sub.get('worksharePercent', 0)}%")
    print(f"  Positions: {len(sub.get('positions', []))}")

    # Check first Systems Admin position
    sysadmin_sub = [p for p in sub.get('positions', []) if 'Systems Administrator' in p.get('labor_category', '')]
    if sysadmin_sub:
        pos = sysadmin_sub[0]
        print(f"\n  Sample: {pos.get('labor_category')}")
        print(f"    Rate: ${pos.get('rate', 0):.2f}/hr")
        print(f"    hours_per_year: {pos.get('hours_per_year', 'NOT SET')}")
