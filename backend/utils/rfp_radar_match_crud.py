"""
CRUD operations for RFP Radar daily matches.

Storage shape: one document per (organization, scan_date, rank) in the
`rfp_radar_matches` collection. The daily Celery scanner produces up to 10
matches per org per day; the dashboard reads them back partitioned by date
for the calendar view.

Sync singleton, same pattern as `utils/proposals.py`.
"""

import logging
import threading
from datetime import date, datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from auth.database import get_mongodb_client

logger = logging.getLogger(__name__)


def _coerce_org_id(organization_id: Any) -> ObjectId:
    """Accept a hex string or bson ObjectId."""
    if isinstance(organization_id, ObjectId):
        return organization_id
    return ObjectId(str(organization_id))


def _date_to_dt(d: Any) -> datetime:
    """
    Convert a date / datetime / ISO string to a UTC datetime suitable for
    MongoDB (BSON doesn't have a date-only type, so we store midnight UTC).
    """
    if isinstance(d, datetime):
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    if isinstance(d, date):
        return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
    if isinstance(d, str):
        # Accept "2026-06-09" or full ISO
        try:
            return datetime.fromisoformat(d.replace("Z", "+00:00")).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    raise ValueError(f"Cannot convert {d!r} to datetime")


class RFPRadarMatchCRUD:
    """
    CRUD for the rfp_radar_matches collection (sync singleton).

    Multi-tenant — every method requires an organization_id.
    """

    def __init__(self):
        mongodb = get_mongodb_client()
        self.db = mongodb.get_database()
        self.collection = self.db["rfp_radar_matches"]

        # Idempotent index creation
        try:
            # Calendar view query: "today's matches for this org, sorted by rank"
            self.collection.create_index(
                [("organization_id", ASCENDING), ("scan_date", DESCENDING),
                 ("rank", ASCENDING)],
                name="org_date_rank",
            )
            # Handoff lookup: "did this org match this notice?"
            self.collection.create_index(
                [("organization_id", ASCENDING), ("notice_id", ASCENDING)],
                name="org_notice",
            )
            # For deletion sweeps and history pruning
            self.collection.create_index(
                [("scan_date", ASCENDING)], name="scan_date"
            )
        except Exception as e:
            logger.warning(f"rfp_radar_matches index creation skipped: {e}")

    # ----- bulk write from a scan -----

    def bulk_save_for_scan(
        self,
        organization_id: Any,
        scan_date: Any,
        matches: list[dict],
    ) -> int:
        """
        Atomically replace this org's matches for the given date.

        Behavior: deletes any prior docs at (org_id, scan_date), then inserts
        the new ones. Safe to call multiple times in a day — a rerun cleanly
        replaces the prior run without leaving orphans.

        Args:
            organization_id: ObjectId or hex string.
            scan_date: date / datetime / ISO string for the partition key.
            matches: list of dicts. Each must include rank, match_score,
                notice_id, title, pws (dict), etc. organization_id, scan_date,
                and scanned_at are stamped here automatically — callers don't
                set them.

        Returns:
            Number of documents inserted.
        """
        if not matches:
            # Wipe the date anyway in case a prior run had results we want gone.
            self._delete_for_scan(organization_id, scan_date)
            return 0

        oid = _coerce_org_id(organization_id)
        scan_dt = _date_to_dt(scan_date)
        now = datetime.now(timezone.utc)

        # Stamp every doc with the partition keys + audit fields.
        prepared: list[dict] = []
        for m in matches:
            doc = dict(m)  # shallow copy — don't mutate caller's data
            doc["organization_id"] = oid
            doc["scan_date"] = scan_dt
            doc.setdefault("scanned_at", now)
            prepared.append(doc)

        # Atomic swap: delete then insert. MongoDB doesn't support true
        # transactions across these without a session, but for a single org+date
        # partition the race window is tiny and a rerun is idempotent anyway.
        self._delete_for_scan(oid, scan_dt)
        if prepared:
            self.collection.insert_many(prepared, ordered=False)
        return len(prepared)

    def _delete_for_scan(self, organization_id: Any, scan_date: Any) -> int:
        oid = _coerce_org_id(organization_id)
        scan_dt = _date_to_dt(scan_date)
        result = self.collection.delete_many(
            {"organization_id": oid, "scan_date": scan_dt}
        )
        return result.deleted_count

    # ----- dashboard reads -----

    def get_by_date(
        self,
        organization_id: Any,
        scan_date: Any,
    ) -> list[dict]:
        """Return all matches for one org+date, sorted by rank ascending."""
        oid = _coerce_org_id(organization_id)
        scan_dt = _date_to_dt(scan_date)
        cursor = (
            self.collection
            .find({"organization_id": oid, "scan_date": scan_dt})
            .sort("rank", ASCENDING)
        )
        return list(cursor)

    def list_scan_dates(
        self,
        organization_id: Any,
        start_date: Optional[Any] = None,
        end_date: Optional[Any] = None,
    ) -> list[date]:
        """
        Distinct scan_dates that have matches for this org, sorted desc.

        Used by the calendar view to render dots / availability indicators.
        """
        oid = _coerce_org_id(organization_id)
        query: dict[str, Any] = {"organization_id": oid}
        if start_date or end_date:
            dt_range: dict[str, datetime] = {}
            if start_date:
                dt_range["$gte"] = _date_to_dt(start_date)
            if end_date:
                dt_range["$lte"] = _date_to_dt(end_date)
            query["scan_date"] = dt_range
        raw = self.collection.distinct("scan_date", query)
        # Return as Python dates, newest first
        dates = sorted({(d.date() if isinstance(d, datetime) else d) for d in raw}, reverse=True)
        return dates

    # ----- handoff lookup -----

    def get_by_notice_id(
        self,
        organization_id: Any,
        notice_id: str,
    ) -> Optional[dict]:
        """
        Look up the most recent match this org has for a specific notice_id.

        Used by piece 6 ("Price this RFP") to fetch the saved PWS attachment
        metadata before kicking off the handoff to PriceIQ.
        """
        oid = _coerce_org_id(organization_id)
        return (
            self.collection
            .find({"organization_id": oid, "notice_id": notice_id})
            .sort("scan_date", DESCENDING)
            .limit(1)
            .next()
            if self.collection.count_documents(
                {"organization_id": oid, "notice_id": notice_id}
            ) > 0
            else None
        )

    # ----- maintenance -----

    def prune_older_than(self, organization_id: Any, before_date: Any) -> int:
        """
        Delete this org's matches with scan_date strictly before the cutoff.
        For retention policy enforcement.
        """
        oid = _coerce_org_id(organization_id)
        cutoff = _date_to_dt(before_date)
        result = self.collection.delete_many(
            {"organization_id": oid, "scan_date": {"$lt": cutoff}}
        )
        return result.deleted_count


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_crud_instance: Optional[RFPRadarMatchCRUD] = None
_crud_lock = threading.RLock()


def get_rfp_radar_match_crud() -> RFPRadarMatchCRUD:
    """Get the singleton RFPRadarMatchCRUD."""
    global _crud_instance
    with _crud_lock:
        if _crud_instance is None:
            _crud_instance = RFPRadarMatchCRUD()
        return _crud_instance
