"""
CRUD operations for capability profiles.

One profile per organization. The RFP Radar daily scanner reads these to know
what NAICS / agencies / set-asides / keywords to filter SAM.gov by, so they're
the central piece of state for the whole feature.

Storage shape matches `models.capability_profile.CapabilityProfileResponse`.
The auto-built source dataclass (`client.capability_profile_builder.CapabilityProfile`)
gets converted here before persistence.

Sync singleton, same pattern as `utils/proposals.py`. Thread-safe via RLock.
"""

import logging
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from pymongo import ReturnDocument

from auth.database import get_mongodb_client
from client.capability_profile_builder import CapabilityProfile

logger = logging.getLogger(__name__)


def _coerce_org_id(organization_id: Any) -> ObjectId:
    """Accept either a hex string or a bson ObjectId — return ObjectId."""
    if isinstance(organization_id, ObjectId):
        return organization_id
    return ObjectId(str(organization_id))


def _parse_iso(ts: Any) -> Optional[datetime]:
    """Tolerate ISO strings (from the builder) and datetime objects alike."""
    if ts is None or isinstance(ts, datetime):
        return ts
    if isinstance(ts, str):
        # builder emits with a `+00:00` suffix; the legacy `Z` form is also handled
        cleaned = ts.replace("Z", "+00:00") if ts.endswith("Z") else ts
        try:
            return datetime.fromisoformat(cleaned)
        except ValueError:
            return None
    return None


class CapabilityProfileCRUD:
    """
    Capability profile CRUD with MongoDB (sync singleton).

    Multi-tenant — every method requires an organization_id. v1 enforces
    one-profile-per-org via a unique index.
    """

    def __init__(self):
        mongodb = get_mongodb_client()
        self.db = mongodb.get_database()
        self.collection = self.db["capability_profiles"]

        # Idempotent — `create_index` is a no-op on existing indexes with the
        # same spec.
        try:
            self.collection.create_index(
                [("organization_id", 1)], unique=True, name="organization_id_unique"
            )
            self.collection.create_index([("uei", 1)], name="uei_lookup")
        except Exception as e:
            logger.warning(f"capability_profiles index creation skipped: {e}")

    # ----- create / update from builder -----

    def save_from_builder(
        self,
        organization_id: Any,
        profile: CapabilityProfile,
    ) -> dict:
        """
        Persist a freshly built CapabilityProfile dataclass.

        Upserts by organization_id:
          - First save → INSERT, rebuilt_count = 0, last_edited_at = None
          - Subsequent saves (rebuild) → UPDATE, rebuilt_count += 1,
            last_edited_at reset to None (rebuild overwrites edits per design)

        Returns the persisted Mongo document.
        """
        oid = _coerce_org_id(organization_id)
        now = datetime.now(timezone.utc)

        # Build the storage doc from the dataclass's `to_dict()`. Drop the
        # `source` audit string — it's a code-internal label, not user data.
        payload = profile.to_dict()
        payload.pop("source", None)
        payload["built_at"] = _parse_iso(payload.get("built_at")) or now
        payload["organization_id"] = oid
        payload["updated_at"] = now
        payload["last_edited_at"] = None  # rebuild resets the edit pointer

        existing = self.collection.find_one({"organization_id": oid})
        if existing is None:
            payload["created_at"] = now
            payload["rebuilt_count"] = 0
            result = self.collection.insert_one(payload)
            return self.collection.find_one({"_id": result.inserted_id})

        # Rebuild — preserve created_at, bump rebuilt_count
        payload["created_at"] = existing.get("created_at", now)
        payload["rebuilt_count"] = (existing.get("rebuilt_count") or 0) + 1
        self.collection.update_one(
            {"organization_id": oid}, {"$set": payload}
        )
        return self.collection.find_one({"organization_id": oid})

    # ----- read -----

    def get_by_org(self, organization_id: Any) -> Optional[dict]:
        """Return this org's profile, or None if they haven't built one yet."""
        oid = _coerce_org_id(organization_id)
        return self.collection.find_one({"organization_id": oid})

    # ----- partial user edit -----

    def update(self, organization_id: Any, updates: dict) -> Optional[dict]:
        """
        Apply user edits — PATCH semantics.

        Only the keys present in `updates` are written. Always stamps
        `updated_at` and `last_edited_at`. Returns the updated document, or
        None if no profile exists for this org.
        """
        if not updates:
            return self.get_by_org(organization_id)

        oid = _coerce_org_id(organization_id)
        now = datetime.now(timezone.utc)
        payload = {**updates, "updated_at": now, "last_edited_at": now}
        return self.collection.find_one_and_update(
            {"organization_id": oid},
            {"$set": payload},
            return_document=ReturnDocument.AFTER,
        )

    # ----- delete -----

    def delete(self, organization_id: Any) -> bool:
        """Remove this org's profile. Returns True if a doc was deleted."""
        oid = _coerce_org_id(organization_id)
        result = self.collection.delete_one({"organization_id": oid})
        return result.deleted_count > 0


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_crud_instance: Optional[CapabilityProfileCRUD] = None
_crud_lock = threading.RLock()


def get_capability_profile_crud() -> CapabilityProfileCRUD:
    """Get the singleton CapabilityProfileCRUD."""
    global _crud_instance
    with _crud_lock:
        if _crud_instance is None:
            _crud_instance = CapabilityProfileCRUD()
        return _crud_instance
