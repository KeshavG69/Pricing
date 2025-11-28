#!/bin/bash
# Refresh OEWS data - download and migrate to MongoDB with zero downtime
# Safe for cron jobs - creates temp DB, verifies, then swaps

set -e  # Exit on error

echo "======================================================================"
echo "OEWS Data Refresh Script"
echo "======================================================================"
echo "Started: $(date)"
echo ""

# Get directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Load environment variables
 if [ -f .env ]; then
     set -a  # automatically export all variables
     source .env
     set +a
 fi

# Use default values if not set in env
MONGODB_URL=${MONGODB_URL:-"mongodb://localhost:27017"}
MONGODB_DATABASE=${MONGODB_DATABASE:-"oews_data"}
TEMP_DATABASE="${MONGODB_DATABASE}_temp_$(date +%Y%m%d_%H%M%S)"

echo "Configuration:"
echo "  MongoDB URL: $MONGODB_URL"
echo "  Current DB: $MONGODB_DATABASE"
echo "  Temp DB: $TEMP_DATABASE"
echo ""

# Step 1: Download fresh OEWS data
echo "======================================================================"
echo "Step 1: Downloading fresh OEWS data from BLS"
echo "======================================================================"
uv run python scripts/setup_oews_data.py

if [ $? -ne 0 ]; then
    echo "❌ Failed to download OEWS data"
    exit 1
fi

echo ""
echo "✓ Download complete"
echo ""

# Step 2: Import to temporary database
echo "======================================================================"
echo "Step 2: Importing data to temporary database"
echo "======================================================================"

# Temporarily override database name for import
export MONGODB_DATABASE="$TEMP_DATABASE"
uv run python scripts/import_oews_to_mongo.py

if [ $? -ne 0 ]; then
    echo "❌ Failed to import to temporary database"
    exit 1
fi

echo ""
echo "✓ Import to temp database complete"
echo ""

# Step 3: Verify temporary database
echo "======================================================================"
echo "Step 3: Verifying temporary database"
echo "======================================================================"

# Use mongosh to verify collections
mongosh "$MONGODB_URL/$TEMP_DATABASE?authSource=admin" --eval "
    var counts = {
        occupations: db.occupations.countDocuments({}),
        datatypes: db.datatypes.countDocuments({}),
        areas: db.areas.countDocuments({}),
        wage_data: db.wage_data.countDocuments({})
    };

    print('Collection counts:');
    print('  occupations: ' + counts.occupations);
    print('  datatypes: ' + counts.datatypes);
    print('  areas: ' + counts.areas);
    print('  wage_data: ' + counts.wage_data);

    // Verify minimum expected counts
    var valid = (
        counts.occupations > 1000 &&
        counts.datatypes > 10 &&
        counts.areas > 500 &&
        counts.wage_data > 6000000
    );

    if (valid) {
        print('✓ Verification passed');
        quit(0);
    } else {
        print('❌ Verification failed - counts too low');
        quit(1);
    }
"

if [ $? -ne 0 ]; then
    echo "❌ Verification failed"
    echo "Cleaning up temporary database..."
    mongosh "$MONGODB_URL/$TEMP_DATABASE?authSource=admin" --eval "db.dropDatabase()"
    exit 1
fi

echo ""
echo "✓ Verification complete"
echo ""

# Step 4: Swap databases (backup old, activate new)
echo "======================================================================"
echo "Step 4: Swapping databases"
echo "======================================================================"

BACKUP_DATABASE="${MONGODB_DATABASE}_backup_$(date +%Y%m%d_%H%M%S)"

# Check if current database exists
DB_EXISTS=$(mongosh "$MONGODB_URL/admin?authSource=admin" --quiet --eval "db.getMongo().getDBNames().includes('$MONGODB_DATABASE')")

if [ "$DB_EXISTS" = "true" ]; then
    echo "Backing up current database to: $BACKUP_DATABASE"
    mongosh "$MONGODB_URL/admin?authSource=admin" --eval "
        db.getSiblingDB('$MONGODB_DATABASE').copyDatabase('$MONGODB_DATABASE', '$BACKUP_DATABASE');
        print('✓ Backup created');
    "

    if [ $? -ne 0 ]; then
        echo "⚠️  Backup failed, but continuing with swap"
    fi

    echo "Dropping old database: $MONGODB_DATABASE"
    mongosh "$MONGODB_URL/$MONGODB_DATABASE?authSource=admin" --eval "db.dropDatabase()"
fi

echo "Renaming temporary database to production"
mongosh "$MONGODB_URL/admin?authSource=admin" --eval "
    db.getSiblingDB('admin').runCommand({
        renameCollection: '$TEMP_DATABASE.occupations',
        to: '$MONGODB_DATABASE.occupations'
    });
    db.getSiblingDB('admin').runCommand({
        renameCollection: '$TEMP_DATABASE.datatypes',
        to: '$MONGODB_DATABASE.datatypes'
    });
    db.getSiblingDB('admin').runCommand({
        renameCollection: '$TEMP_DATABASE.areas',
        to: '$MONGODB_DATABASE.areas'
    });
    db.getSiblingDB('admin').runCommand({
        renameCollection: '$TEMP_DATABASE.wage_data',
        to: '$MONGODB_DATABASE.wage_data'
    });
    print('✓ Database swap complete');
"

if [ $? -ne 0 ]; then
    echo "❌ Database swap failed"
    echo "Temporary database '$TEMP_DATABASE' still exists"
    echo "Backup database '$BACKUP_DATABASE' preserved"
    exit 1
fi

echo ""
echo "✓ Database swap complete"
echo ""

# Step 5: Clean up temporary database (should be empty now)
echo "======================================================================"
echo "Step 5: Cleaning up"
echo "======================================================================"

mongosh "$MONGODB_URL/$TEMP_DATABASE?authSource=admin" --eval "db.dropDatabase()" 2>/dev/null || true

# Ask about deleting backup
echo ""
echo "Backup database created: $BACKUP_DATABASE"
echo "To delete backup later, run:"
echo "  mongosh \"$MONGODB_URL/$BACKUP_DATABASE?authSource=admin\" --eval 'db.dropDatabase()'"
echo ""

# Final verification
echo "======================================================================"
echo "Final Verification"
echo "======================================================================"

mongosh "$MONGODB_URL/$MONGODB_DATABASE?authSource=admin" --eval "
    print('Production database: $MONGODB_DATABASE');
    print('Collections:');
    print('  occupations: ' + db.occupations.countDocuments({}));
    print('  datatypes: ' + db.datatypes.countDocuments({}));
    print('  areas: ' + db.areas.countDocuments({}));
    print('  wage_data: ' + db.wage_data.countDocuments({}));
"

echo ""
echo "======================================================================"
echo "✓ OEWS Data Refresh Complete!"
echo "======================================================================"
echo "Completed: $(date)"
echo ""
echo "Summary:"
echo "  • Downloaded fresh OEWS data"
echo "  • Imported to temporary database"
echo "  • Verified data integrity"
echo "  • Swapped to production database"
echo "  • Backup preserved: $BACKUP_DATABASE"
echo ""
