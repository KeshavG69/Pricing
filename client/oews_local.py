"""
Local OEWS wage lookup from downloaded BLS data (no API needed!).
"""

import pandas as pd
from pathlib import Path
from typing import Optional, Dict, Any
import threading

DATA_DIR = Path("data/oews")


class OEWSLocalLookup:
    """Query OEWS wage data from local files."""

    def __init__(self):
        """Initialize with local data files."""
        self._lock = threading.RLock()
        self.occupations = self._load_occupations()
        self.datatypes = self._load_datatypes()
        self.areas = self._load_areas()
        self.wage_data = None  # Lazy load when needed

    def _load_occupations(self) -> pd.DataFrame:
        """Load occupation codes."""
        df = pd.read_csv(
            DATA_DIR / "oe.occupation",
            sep="\t",
            header=0,
            dtype=str,
        )
        df.columns = df.columns.str.strip()
        df["occupation_code"] = df["occupation_code"].str.strip()
        df["occupation_name"] = df["occupation_name"].str.strip()
        return df

    def _load_datatypes(self) -> pd.DataFrame:
        """Load data type codes."""
        df = pd.read_csv(
            DATA_DIR / "oe.datatype",
            sep="\t",
            header=0,
            dtype=str,
        )
        df.columns = df.columns.str.strip()
        df["datatype_code"] = df["datatype_code"].str.strip()
        df["datatype_name"] = df["datatype_name"].str.strip()
        return df

    def _load_areas(self) -> pd.DataFrame:
        """Load area codes."""
        df = pd.read_csv(
            DATA_DIR / "oe.area",
            sep="\t",
            header=0,
            dtype=str,
        )
        df.columns = df.columns.str.strip()
        df["area_code"] = df["area_code"].str.strip()
        df["area_name"] = df["area_name"].str.strip()
        return df

    def _load_wage_data_lazy(self):
        """Load wage data only when needed (it's large)."""
        with self._lock:
            if self.wage_data is None:
                print("Loading wage data (first time only)...")
                self.wage_data = pd.read_csv(
                    DATA_DIR / "oe.data.0.Current",
                    sep="\t",
                    header=0,
                    dtype=str,
                )
                self.wage_data.columns = self.wage_data.columns.str.strip()
                self.wage_data["year"] = pd.to_numeric(self.wage_data["year"], errors="coerce")
                self.wage_data["value"] = pd.to_numeric(self.wage_data["value"], errors="coerce")
                print(f"  ✓ Loaded {len(self.wage_data):,} wage records")

    def get_occupation_name(self, occ_code: str) -> Optional[str]:
        """Get occupation name from code."""
        matches = self.occupations[self.occupations["occupation_code"] == occ_code.strip()]
        return matches.iloc[0]["occupation_name"] if len(matches) > 0 else None

    def search_occupations(self, keyword: str) -> pd.DataFrame:
        """Search occupations by keyword."""
        mask = self.occupations["occupation_name"].str.contains(keyword, case=False, na=False)
        return self.occupations[mask]

    def search_areas(self, keyword: str) -> pd.DataFrame:
        """Search areas by keyword."""
        mask = self.areas["area_name"].str.contains(keyword, case=False, na=False)
        return self.areas[mask]

    def get_area_code(self, area_name: str) -> Optional[str]:
        """
        Get area code from area name.

        Args:
            area_name: Area name (e.g., "California", "National", "San Francisco")

        Returns:
            Area code or None if not found
        """
        # Exact match first
        exact_matches = self.areas[
            self.areas["area_name"].str.lower() == area_name.lower()
        ]
        if len(exact_matches) > 0:
            return exact_matches.iloc[0]["area_code"]

        # Partial match
        partial_matches = self.areas[
            self.areas["area_name"].str.contains(area_name, case=False, na=False)
        ]
        if len(partial_matches) == 1:
            return partial_matches.iloc[0]["area_code"]
        elif len(partial_matches) > 1:
            # Multiple matches - return first but warn
            print(f"⚠️  Multiple matches for '{area_name}', using: {partial_matches.iloc[0]['area_name']}")
            return partial_matches.iloc[0]["area_code"]

        return None

    def get_wage_by_soc(
        self,
        soc_code: str,
        area: str = "National",
        year: int = 2024,
    ) -> Optional[Dict[str, Any]]:
        """
        Get wage data for a SOC code.

        Args:
            soc_code: SOC code (e.g., "15-1252")
            area: Area name or code (default: "National")
                  Examples: "National", "California", "0000000"
            year: Year

        Returns:
            Dictionary with wage data or None
        """
        self._load_wage_data_lazy()

        # Format SOC code (remove hyphens)
        soc_clean = soc_code.replace("-", "")

        # Convert area name to code if needed
        area_code = area
        if not (area.isdigit() and len(area) == 7):
            # Not a 7-digit code, treat as name
            area_code = self.get_area_code(area)
            if area_code is None:
                print(f"❌ Area '{area}' not found. Use search_areas() to find valid areas.")
                return None

        # OEWS series ID format (26 chars):
        # OEUN 000000 000000 151252 04
        # Type Area   Ind    Occ    DT

        # For national: OEUN000000000000{occupation}{datatype}
        # Occupation is positions 19-24 (6 digits)
        # Datatype is positions 25-26 (2 digits)

        # Filter by national area and occupation
        matches = self.wage_data[
            (self.wage_data["series_id"].str.startswith("OEUN", na=False)) &
            (self.wage_data["series_id"].str.contains(soc_clean, na=False)) &
            (self.wage_data["year"] == year)
        ]

        if len(matches) == 0:
            return None

        # Get occupation name
        occ_name = self.get_occupation_name(soc_clean)

        # Get area name for display
        area_name_display = None
        area_matches = self.areas[self.areas["area_code"] == area_code]
        if len(area_matches) > 0:
            area_name_display = area_matches.iloc[0]["area_name"]

        # Initialize result with complete structure (all percentiles)
        result = {
            "soc_code": soc_code,
            "occupation_name": occ_name,
            "area": area_name_display or area_code,
            "area_code": area_code,
            "year": year,
            "employment": None,
            "wages": {
                "Annual mean wage": None,
                "Annual median wage": None,
                "Annual 10th percentile wage": None,
                "Annual 25th percentile wage": None,
                "Annual 75th percentile wage": None,
                "Annual 90th percentile wage": None,
                "Hourly mean wage": None,
                "Hourly median wage": None,
                "Hourly 10th percentile wage": None,
                "Hourly 25th percentile wage": None,
                "Hourly 75th percentile wage": None,
                "Hourly 90th percentile wage": None,
            }
        }

        # Fill in actual values from data
        for _, row in matches.iterrows():
            series_id = row["series_id"].strip()
            # Extract datatype from series ID (last 2 digits)
            datatype = series_id[-2:].strip()

            # Get datatype name
            dt_matches = self.datatypes[self.datatypes["datatype_code"] == datatype]
            dt_name = dt_matches.iloc[0]["datatype_name"] if len(dt_matches) > 0 else datatype

            value = row["value"]

            # Store employment separately
            if datatype == "01":
                result["employment"] = value
            elif dt_name in result["wages"]:
                # Only update if it's one of our expected wage types
                result["wages"][dt_name] = value

        return result


# Global OEWS lookup client (singleton pattern)
_oews_client: Optional[OEWSLocalLookup] = None
_client_lock = threading.RLock()


def get_oews_lookup_client() -> OEWSLocalLookup:
    """
    Get or create OEWS lookup client (singleton pattern)

    Returns:
        OEWSLocalLookup instance
    """
    global _oews_client
    with _client_lock:
        if _oews_client is None:
            _oews_client = OEWSLocalLookup()
        return _oews_client
