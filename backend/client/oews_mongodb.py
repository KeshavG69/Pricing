"""
MongoDB-based OEWS wage lookup for scalable web applications (Async).
Queries wage data from MongoDB instead of local files.

Uses Motor (AsyncIOMotorClient) for async MongoDB operations.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, Dict, Any, List
import asyncio
import math

from app.settings import settings


class OEWSMongoLookup:
    """Query OEWS wage data from MongoDB (Async)."""

    def __init__(self):
        """Initialize MongoDB connection (lazy initialization)."""
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None

    async def _ensure_initialized(self):
        """Ensure MongoDB connection is initialized (lazy initialization)"""
        if self.db is None:
            # Create Motor async client
            # Connection pool tuning for Railway MongoDB proxy
            self.client = AsyncIOMotorClient(
                settings.MONGODB_URL,
                maxPoolSize=50,
                minPoolSize=0,           # Don't keep warm connections (Railway proxy issue)
                maxIdleTimeMS=300000,    # 5min idle timeout
                socketTimeoutMS=30000,
                connectTimeoutMS=20000,
                serverSelectionTimeoutMS=20000,
                retryWrites=True,
                retryReads=True,
                heartbeatFrequencyMS=120000,  # Check every 2min instead of default 10s
            )
            self.db = self.client[settings.MONGODB_DATABASE]

    async def search_areas(self, keyword: str) -> List[Dict[str, str]]:
        """
        Search areas by keyword using MongoDB text search (async).

        Args:
            keyword: Area name keyword (e.g., "California", "San Francisco")

        Returns:
            List of dicts with area_code and area_name
        """
        await self._ensure_initialized()

        # MongoDB text search on area_name field
        # Case-insensitive partial match
        cursor = self.db.areas.find(
            {"area_name": {"$regex": keyword, "$options": "i"}},
            {"_id": 0, "area_code": 1, "area_name": 1}
        ).limit(20)  # Limit to 20 results

        return await cursor.to_list(length=None)

    async def get_area_code(self, area_name: str) -> Optional[str]:
        """
        Convert area name to area code (async).

        NOTE: @lru_cache removed - Redis caching will be implemented in next optimization phase.

        Args:
            area_name: Area name (e.g., "California", "National")

        Returns:
            Area code (7-digit string) or None if not found
        """
        await self._ensure_initialized()

        # Try exact match first (case-insensitive)
        exact_match = await self.db.areas.find_one(
            {"area_name": {"$regex": f"^{area_name}$", "$options": "i"}},
            {"_id": 0, "area_code": 1}
        )

        if exact_match:
            return exact_match["area_code"]

        # Try partial match
        cursor = self.db.areas.find(
            {"area_name": {"$regex": area_name, "$options": "i"}},
            {"_id": 0, "area_code": 1, "area_name": 1}
        ).limit(2)

        partial_matches = await cursor.to_list(length=None)

        if len(partial_matches) == 1:
            # Only one match found
            return partial_matches[0]["area_code"]
        elif len(partial_matches) > 1:
            # Multiple matches - return first and warn
            print(f"⚠️  Multiple matches for '{area_name}', using: {partial_matches[0]['area_name']}")
            return partial_matches[0]["area_code"]

        # No matches found
        return None

    async def get_wage_by_soc(
        self,
        soc_code: str,
        area: str = "National",
    ) -> Optional[Dict[str, Any]]:
        """
        Get wage data for a SOC code in a specific area (async).

        NOTE: @lru_cache removed - Redis caching will be implemented in next optimization phase.

        Args:
            soc_code: SOC code (e.g., "15-1252" or "151252")
            area: Area name (e.g., "National", "California", "San Francisco")

        Returns:
            Dictionary with 5 wage percentiles or None if not found
        """
        await self._ensure_initialized()

        print(f"\n{'='*60}")
        print(f"🔍 get_wage_by_soc called")
        print(f"{'='*60}")
        print(f"  Input SOC Code: {soc_code}")
        print(f"  Input Area: {area}")

        # Clean SOC code (remove hyphens)
        soc_clean = soc_code.replace("-", "")
        print(f"  Cleaned SOC: {soc_clean}")

        # Convert area name to area code
        area_code = area
        if not (area.isdigit() and len(area) == 7):
            # Not a 7-digit code, treat as name
            print(f"  Converting area name to code...")
            area_code = await self.get_area_code(area)
            if area_code is None:
                print(f"  ❌ Area '{area}' not found in database")
                return None
            print(f"  ✓ Area code: {area_code}")
        else:
            print(f"  Using provided area code: {area_code}")

        # Determine series prefix based on area code
        # OEUN = National, OEUS = State, OEUM = Metro/City
        if area_code == "0000000":
            series_prefix = "OEUN"  # National data
            area_type = "National"
        elif area_code.endswith("00000") and area_code != "0000000":
            series_prefix = "OEUS"  # State data (e.g., 0600000 = California)
            area_type = "State"
        else:
            series_prefix = "OEUM"  # Metro/City data
            area_type = "Metro"

        print(f"  Series prefix: {series_prefix} ({area_type})")

        # Build MongoDB query for wage data
        # Series ID format: {prefix}{area}{industry}{occupation}{datatype}
        # We want: {prefix}{area}000000{occupation}{datatype}
        # Example: OEUN000000000000015125212 (National, Software Devs, 50th percentile)

        # Query for all series matching this pattern
        series_pattern = f"^{series_prefix}{area_code}000000{soc_clean}"
        print(f"  MongoDB query pattern: {series_pattern}")

        cursor = self.db.wage_data.find(
            {"series_id": {"$regex": series_pattern}},
            {"_id": 0, "series_id": 1, "value": 1}
        )

        wage_records = await cursor.to_list(length=None)

        print(f"  Found {len(wage_records)} wage records")

        if not wage_records:
            print(f"  ❌ No wage data found for SOC {soc_code} in area {area}")

            # Try National fallback if this wasn't already a National query
            if area.lower() != "national" and area_code != "0000000":
                print(f"  🔄 Attempting fallback to National data...")
                print(f"{'='*60}\n")

                # Recursively call with National area
                national_result = await self.get_wage_by_soc(soc_code, "National")

                if national_result:
                    # Add a note that this is fallback data
                    national_result["area"] = f"{national_result['area']} (fallback for {area})"
                    print(f"  ✅ Using National data as fallback for {area}")
                    return national_result
                else:
                    print(f"  ❌ No National data available either")
                    print(f"{'='*60}\n")
                    return None

            print(f"{'='*60}\n")
            return None

        # Log first few records for debugging
        if len(wage_records) > 0:
            print(f"  Sample records:")
            for i, rec in enumerate(wage_records[:3]):
                print(f"    {i+1}. {rec['series_id'].strip()} = {rec['value']}")

        # Get occupation name and description from occupations collection
        occ_doc = await self.db.occupations.find_one(
            {"occupation_code": soc_clean},
            {"_id": 0, "occupation_name": 1, "occupation_description": 1}
        )
        occ_name = occ_doc["occupation_name"] if occ_doc else None
        occ_description = occ_doc["occupation_description"] if occ_doc and "occupation_description" in occ_doc else None

        # Get area name for display
        area_doc = await self.db.areas.find_one(
            {"area_code": area_code},
            {"_id": 0, "area_name": 1}
        )
        area_name = area_doc["area_name"] if area_doc else area_code

        # Extract wage percentiles from series IDs
        # Datatype codes: 11=10th, 12=25th, 13=50th/median, 14=75th, 15=90th
        # These are annual wages
        wages = {
            "10th": None,
            "25th": None,
            "50th": None,  # median
            "75th": None,
            "90th": None,
        }

        # Map datatype codes to wage keys
        datatype_map = {
            "11": "10th",   # Annual 10th percentile
            "12": "25th",   # Annual 25th percentile
            "13": "50th",   # Annual median (50th percentile)
            "14": "75th",   # Annual 75th percentile
            "15": "90th",   # Annual 90th percentile
        }

        print(f"  Extracting wage percentiles...")
        for record in wage_records:
            series_id = record["series_id"].strip()  # Remove trailing spaces
            # Extract datatype from last 2 characters
            # After stripping, series ID is 25 chars, datatype is last 2
            datatype = series_id[-2:]

            if datatype in datatype_map:
                wage_key = datatype_map[datatype]
                wage_value = record["value"]

                # Convert NaN to None (BLS suppresses data for confidentiality)
                if isinstance(wage_value, float) and math.isnan(wage_value):
                    wage_value = None
                    print(f"    {wage_key}: [SUPPRESSED - Data not available]")
                else:
                    print(f"    {wage_key}: ${wage_value}")

                wages[wage_key] = wage_value

        print(f"\n  ✓ Result:")
        print(f"    SOC Code: {soc_code}")
        print(f"    Occupation: {occ_name}")
        print(f"    Area: {area_name}")
        print(f"    Wages: {wages}")
        print(f"{'='*60}\n")

        # Return result with BLS occupation description
        return {
            "soc_code": soc_code,
            "occupation_name": occ_name,
            "bls_occupation_description": occ_description,
            "area": area_name,
            "wages": wages
        }

    async def close(self):
        """Close MongoDB connection (async)."""
        if self.client:
            self.client.close()


# Global singleton instance with thread-safe lazy initialization
_oews_mongo_client: Optional[OEWSMongoLookup] = None
_client_lock = None  # Will be initialized when needed


def get_oews_mongo_client() -> OEWSMongoLookup:
    """
    Get or create OEWS MongoDB client (singleton pattern).

    Thread-safe synchronous getter. The client itself uses async methods
    with lazy initialization via _ensure_initialized().

    Returns:
        OEWSMongoLookup instance
    """
    global _oews_mongo_client, _client_lock

    # Initialize lock on first call
    if _client_lock is None:
        import threading
        _client_lock = threading.Lock()

    with _client_lock:
        if _oews_mongo_client is None:
            _oews_mongo_client = OEWSMongoLookup()
        return _oews_mongo_client
