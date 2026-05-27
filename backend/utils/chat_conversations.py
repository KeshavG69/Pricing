"""
CRUD for chat conversations — the sidebar-metadata layer of Q's chat history.

One `chat_conversations` document per chat session (1:1 with agno's
`agent_sessions.session_id`). Stores only metadata: title, owner, proposal
link, status. Messages live in the separate `chat_messages` collection.

Soft-delete only — `status` flips between "active" and "deleted"; rows are
never dropped from this collection.

Thread-safe via the singleton pattern matching utils/proposals.py.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId

from auth.database import get_mongodb_client

logger = logging.getLogger(__name__)


class ChatConversationCRUD:
    """
    MongoDB CRUD for chat_conversations. Sync — fast enough for the
    background-task path; switching to motor would force everything to async
    for no real win at this volume.
    """

    def __init__(self) -> None:
        mongodb = get_mongodb_client()
        self.db = mongodb.get_database()
        self.collection = self.db["chat_conversations"]

        # Indexes — idempotent. The session_id unique index is the safety net
        # that prevents duplicate rows if two background tasks race on the
        # same session.
        try:
            self.collection.create_index("session_id", unique=True)
            self.collection.create_index([
                ("user_id", 1),
                ("organization_id", 1),
                ("status", 1),
                ("updated_at", -1),
            ])
            self.collection.create_index([
                ("proposal_id", 1),
                ("status", 1),
                ("updated_at", -1),
            ])
        except Exception:  # noqa: BLE001 — index creation is best-effort
            pass

    # ─── Writes ──────────────────────────────────────────────────────

    def upsert(
        self,
        *,
        session_id: str,
        user_id: str,
        organization_id: str,
        proposal_id: str,
        proposal_name: Optional[str],
        default_chat_name: str,
    ) -> Dict[str, Any]:
        """
        Find-or-create the conversation row for this session.

        Called from the background task on every /ask. First call creates the
        row (with `default_chat_name` as the title); subsequent calls are
        no-ops on the title but refresh updated_at.

        Returns the conversation document with `_id` coerced to string `id`.
        """
        now = datetime.utcnow()

        # Coerce ids — frontend sends strings, we want ObjectId in Mongo for
        # cross-collection joins.
        org_oid = ObjectId(organization_id) if ObjectId.is_valid(organization_id) else organization_id
        proposal_oid = ObjectId(proposal_id) if ObjectId.is_valid(proposal_id) else proposal_id

        # $setOnInsert keeps fields fixed at create time; $set always runs
        # so updated_at refreshes on every turn (sidebar sorts by it).
        # `title_is_custom: False` on insert means "auto-derived from first
        # query" — generate_title() may overwrite it. Once the user explicitly
        # renames, we flip it to True and freeze the name.
        result = self.collection.find_one_and_update(
            {"session_id": session_id},
            {
                "$setOnInsert": {
                    "session_id": session_id,
                    "chat_name": (default_chat_name or "New chat")[:60].strip() or "New chat",
                    "title_is_custom": False,
                    "user_id": user_id,
                    "organization_id": org_oid,
                    "proposal_id": proposal_oid,
                    "proposal_name": proposal_name,
                    "status": "active",
                    "created_at": now,
                },
                "$set": {
                    "updated_at": now,
                },
            },
            upsert=True,
            return_document=True,
        )
        return self._serialize(result)

    def touch(self, session_id: str) -> None:
        """Bump updated_at — called after every message write."""
        self.collection.update_one(
            {"session_id": session_id},
            {"$set": {"updated_at": datetime.utcnow()}},
        )

    def rename(
        self,
        *,
        conversation_id: str,
        user_id: str,
        new_name: str,
    ) -> Optional[Dict[str, Any]]:
        """
        User-initiated rename. Sets `title_is_custom=True` so the LLM
        title generator won't subsequently overwrite the user's choice.
        Returns updated doc or None if not found/owned.
        """
        if not new_name or not new_name.strip():
            return None
        oid = ObjectId(conversation_id) if ObjectId.is_valid(conversation_id) else None
        if not oid:
            return None
        result = self.collection.find_one_and_update(
            {"_id": oid, "user_id": user_id},
            {
                "$set": {
                    "chat_name": new_name.strip()[:200],
                    "title_is_custom": True,
                    "updated_at": datetime.utcnow(),
                }
            },
            return_document=True,
        )
        return self._serialize(result) if result else None

    def set_generated_title(
        self,
        *,
        conversation_id: str,
        user_id: str,
        new_name: str,
        force: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """
        Programmatic rename from the LLM title generator. Respects
        `title_is_custom=True` (user already renamed manually) unless
        `force=True`. Does NOT flip `title_is_custom` — successive
        generations remain allowed.

        Returns the updated doc, OR the existing doc unchanged if the
        title is custom and not forced, OR None if not found/owned.
        """
        if not new_name or not new_name.strip():
            return None
        oid = ObjectId(conversation_id) if ObjectId.is_valid(conversation_id) else None
        if not oid:
            return None

        query: Dict[str, Any] = {"_id": oid, "user_id": user_id}
        if not force:
            # Only overwrite when title_is_custom is False or missing
            query["$or"] = [
                {"title_is_custom": False},
                {"title_is_custom": {"$exists": False}},
            ]

        updated = self.collection.find_one_and_update(
            query,
            {
                "$set": {
                    "chat_name": new_name.strip()[:200],
                    "updated_at": datetime.utcnow(),
                }
            },
            return_document=True,
        )
        if updated:
            return self._serialize(updated)

        # Either not owned / not found, OR title is custom and not forced —
        # return the existing doc so caller knows there's nothing to update.
        existing = self.collection.find_one({"_id": oid, "user_id": user_id})
        return self._serialize(existing) if existing else None

    def soft_delete(
        self,
        *,
        conversation_id: str,
        user_id: str,
    ) -> bool:
        """Move to trash. Returns True on success."""
        oid = ObjectId(conversation_id) if ObjectId.is_valid(conversation_id) else None
        if not oid:
            return False
        result = self.collection.update_one(
            {"_id": oid, "user_id": user_id},
            {"$set": {"status": "deleted", "updated_at": datetime.utcnow()}},
        )
        return result.modified_count > 0

    # ─── Reads ───────────────────────────────────────────────────────

    def list(
        self,
        *,
        user_id: str,
        organization_id: str,
        proposal_id: Optional[str] = None,
        status: str = "active",
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """List conversations, most-recently-updated first. Owner-scoped."""
        org_oid = ObjectId(organization_id) if ObjectId.is_valid(organization_id) else organization_id
        query: Dict[str, Any] = {
            "user_id": user_id,
            "organization_id": org_oid,
            "status": status,
        }
        if proposal_id:
            query["proposal_id"] = (
                ObjectId(proposal_id) if ObjectId.is_valid(proposal_id) else proposal_id
            )

        cursor = (
            self.collection.find(query)
            .sort("updated_at", -1)
            .skip(max(0, offset))
            .limit(max(1, min(limit, 200)))
        )
        return [self._serialize(doc) for doc in cursor]

    def get(
        self,
        *,
        conversation_id: str,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Fetch one conversation. Returns None if not found or not owned."""
        oid = ObjectId(conversation_id) if ObjectId.is_valid(conversation_id) else None
        if not oid:
            return None
        doc = self.collection.find_one({"_id": oid, "user_id": user_id})
        return self._serialize(doc) if doc else None

    def get_by_session(
        self,
        *,
        session_id: str,
        user_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Lookup by session_id (used internally by the persistence path so
        message writes don't need the conversation's _id ahead of time).
        """
        query: Dict[str, Any] = {"session_id": session_id}
        if user_id:
            query["user_id"] = user_id
        doc = self.collection.find_one(query)
        return self._serialize(doc) if doc else None

    # ─── Serialization ──────────────────────────────────────────────

    @staticmethod
    def _serialize(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Mongo doc → JSON-friendly dict. None → None passthrough."""
        if doc is None:
            return None
        out = dict(doc)
        out["id"] = str(out.pop("_id"))
        if isinstance(out.get("organization_id"), ObjectId):
            out["organization_id"] = str(out["organization_id"])
        if isinstance(out.get("proposal_id"), ObjectId):
            out["proposal_id"] = str(out["proposal_id"])
        for ts_field in ("created_at", "updated_at"):
            if isinstance(out.get(ts_field), datetime):
                out[ts_field] = out[ts_field].isoformat()
        return out


# ─── Singleton ───────────────────────────────────────────────────────

_instance: Optional[ChatConversationCRUD] = None
_lock = threading.Lock()


def get_chat_conversation_crud() -> ChatConversationCRUD:
    """Lazy singleton — matches the pattern in utils/proposals.py."""
    global _instance
    if _instance is None:
        with _lock:
            if _instance is None:
                _instance = ChatConversationCRUD()
    return _instance
