"""
Import OEWS data from local files into MongoDB.
Run this once to populate the database.
"""

import sys
from pathlib import Path

# Add parent directory to path to import settings
sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
from pymongo import MongoClient, ASCENDING, TEXT
from pymongo.database import Database
from typing import Dict, Tuple
import time

from app.settings import settings

DATA_DIR = Path("data/oews")


def create_mongo_client() -> Tuple[MongoClient, Database]:
    """Create MongoDB client and return client + database."""
    print(f"Connecting to MongoDB at {settings.MONGODB_URL}...")
    client = MongoClient(settings.MONGODB_URL)
    # Test connection
    client.server_info()
    print("  ✓ Connected to MongoDB")

    db = client[settings.MONGODB_DATABASE]
    print(f"  ✓ Using database: {settings.MONGODB_DATABASE}")

    return client, db


def import_occupations(db: Database) -> int:
    """Import occupation codes."""
    print("\n1. Importing occupations...")

    df = pd.read_csv(
        DATA_DIR / "oe.occupation",
        sep="\t",
        header=0,
        dtype=str,
    )
    df.columns = df.columns.str.strip()
    df = df.fillna("")

    records = df.to_dict("records")

    db.occupations.drop()
    db.occupations.insert_many(records)

    db.occupations.create_index([("occupation_code", ASCENDING)])
    db.occupations.create_index([("occupation_name", TEXT)])

    print(f"  ✓ Imported {len(records):,} occupations")
    return len(records)


def import_datatypes(db: Database) -> int:
    """Import data type codes."""
    print("\n2. Importing data types...")

    df = pd.read_csv(
        DATA_DIR / "oe.datatype",
        sep="\t",
        header=0,
        dtype=str,
    )
    df.columns = df.columns.str.strip()
    df = df.fillna("")

    records = df.to_dict("records")

    db.datatypes.drop()
    db.datatypes.insert_many(records)
    db.datatypes.create_index([("datatype_code", ASCENDING)])

    print(f"  ✓ Imported {len(records):,} data types")
    return len(records)


def import_areas(db: Database) -> int:
    """Import area codes."""
    print("\n3. Importing geographic areas...")

    df = pd.read_csv(
        DATA_DIR / "oe.area",
        sep="\t",
        header=0,
        dtype=str,
    )
    df.columns = df.columns.str.strip()
    df = df.fillna("")

    records = df.to_dict("records")

    db.areas.drop()
    db.areas.insert_many(records)

    db.areas.create_index([("area_code", ASCENDING)])
    db.areas.create_index([("area_name", TEXT)])

    print(f"  ✓ Imported {len(records):,} areas")
    return len(records)


def import_wage_data(db: Database, batch_size: int = 50000) -> int:
    """Import wage data in batches (large file)."""
    print("\n4. Importing wage data (this may take 2-5 minutes)...")

    db.wage_data.drop()

    total_records = 0
    chunk_iter = pd.read_csv(
        DATA_DIR / "oe.data.0.Current",
        sep="\t",
        header=0,
        dtype=str,
        chunksize=batch_size,
    )

    start_time = time.time()

    for i, chunk in enumerate(chunk_iter, 1):
        chunk.columns = chunk.columns.str.strip()
        chunk = chunk.fillna("")

        chunk["year"] = pd.to_numeric(chunk["year"], errors="coerce")
        chunk["value"] = pd.to_numeric(chunk["value"], errors="coerce")

        records = chunk.to_dict("records")
        db.wage_data.insert_many(records)

        total_records += len(records)
        elapsed = time.time() - start_time
        print(f"  Batch {i}: {total_records:,} records ({elapsed:.1f}s elapsed)")

    print("\n  Creating indexes (this may take 1-2 minutes)...")
    db.wage_data.create_index([("series_id", ASCENDING), ("year", ASCENDING)])
    db.wage_data.create_index([("year", ASCENDING)])

    elapsed = time.time() - start_time
    print(f"  ✓ Imported {total_records:,} wage records in {elapsed:.1f}s")
    return total_records


def verify_import(db: Database) -> Dict[str, int]:
    """Verify data was imported correctly."""
    print("\n" + "=" * 60)
    print("Verifying Import")
    print("=" * 60)

    counts = {
        "occupations": db.occupations.count_documents({}),
        "datatypes": db.datatypes.count_documents({}),
        "areas": db.areas.count_documents({}),
        "wage_data": db.wage_data.count_documents({}),
    }

    for collection, count in counts.items():
        print(f"  {collection}: {count:,} documents")

    print("\n  Testing query for Software Developers (151252)...")
    test_result = db.wage_data.find_one({
        "series_id": {"$regex": "^OEUN.*151252"},
        "year": 2024
    })

    if test_result:
        print(f"  ✓ Test query successful: {test_result['series_id']}")
    else:
        print("  ⚠️  Test query returned no results")

    return counts


def main():
    """Main import function."""
    print("=" * 60)
    print("OEWS Data Import to MongoDB")
    print("=" * 60)

    # Check data files exist
    required_files = [
        "oe.occupation",
        "oe.datatype",
        "oe.area",
        "oe.data.0.Current",
    ]

    for filename in required_files:
        filepath = DATA_DIR / filename
        if not filepath.exists():
            print(f"❌ Missing file: {filepath}")
            print("\nRun setup_oews_data.py first to download data files.")
            return

    # Connect to MongoDB
    try:
        client, db = create_mongo_client()
    except Exception as e:
        print(f"\n❌ MongoDB connection failed: {e}")
        print("\nMake sure MongoDB is running:")
        print("  - Install: brew install mongodb-community")
        print("  - Start: brew services start mongodb-community")
        return

    # Import data
    start_time = time.time()

    try:
        import_occupations(db)
        import_datatypes(db)
        import_areas(db)
        import_wage_data(db)

        counts = verify_import(db)

        elapsed = time.time() - start_time

        print("\n" + "=" * 60)
        print("✓ Import Complete!")
        print("=" * 60)
        print(f"\nTotal time: {elapsed:.1f}s")
        print(f"Database: {settings.MONGODB_DATABASE}")
        print(f"Total documents: {sum(counts.values()):,}")
        print("\nYou can now use the MongoDB-based wage lookup client.")

    except Exception as e:
        print(f"\n❌ Import failed: {e}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    main()
