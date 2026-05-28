"""
CRUD for chat messages — one document per user→assistant turn.

Schema mirrors what `PricingChatPanel` renders so loading a past chat is a
straight projection back into the UI: user_query, assistant content, blocks
(ordered text+tool artifacts), tool_calls, reasoning_steps, plus pause/approval
state and future-use feedback flags.

Hard-delete is supported but currently only used by the soft-delete-by-status
flow in chat_conversations; individual message deletion isn't exposed via API.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId

from auth.database import get_mongodb_client

logger = logging.getLogger(__name__)


class ChatMessageCRUD:
    """MongoDB CRUD for chat_messages."""

    def __init__(self) -> None:
        mongodb = get_mongodb_client()
        self.db = mongodb.get_database()
        self.collection = self.db["chat_messages"]

        try:
            # Single compound index covers the only read pattern: "give me
            # all messages for a conversation in order."
            self.collection.create_index([
                ("conversation_id", 1),
                ("created_at", 1),
            ])
            # Lookup by paused_run_id when /resume needs to find the turn to
            # update post-approval.
            self.collection.create_index([
                ("conversation_id", 1),
                ("paused_run_id", 1),
            ])
        except Exception:  # noqa: BLE001
            pass

    # ─── Writes ──────────────────────────────────────────────────────

    def insert(
        self,
        *,
        conversation_id: str,
        user_query: str,
        content: str = "",
        blocks: Optional[List[Dict[str, Any]]] = None,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        reasoning_steps: Optional[List[Dict[str, Any]]] = None,
        paused_run_id: Optional[str] = None,
        confirmed: Optional[bool] = None,
        streaming_error: bool = False,
    ) -> Dict[str, Any]:
        """
        Insert one turn. Called from the background persistence task at
        stream-end so it never blocks the SSE response.
        """
        conv_oid = ObjectId(conversation_id) if ObjectId.is_valid(conversation_id) else conversation_id
        doc = {
            "conversation_id": conv_oid,
            "user_query": user_query,
            "content": content,
            "blocks": blocks or [],
            "tool_calls": tool_calls or [],
            "reasoning_steps": reasoning_steps or [],
            "paused_run_id": paused_run_id,
            "confirmed": confirmed,
            "streaming_error": streaming_error,
            # Reserved for future feedback UI; default false so we don't have
            # to handle missing fields client-side.
            "is_liked": False,
            "is_disliked": False,
            "is_flagged": False,
            "created_at": datetime.utcnow(),
        }
        result = self.collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._serialize(doc)

    def update_paused_message(
        self,
        *,
        conversation_id: str,
        paused_run_id: str,
        confirmed: bool,
        appended_content: str = "",
        updated_blocks: Optional[List[Dict[str, Any]]] = None,
        updated_tool_calls: Optional[List[Dict[str, Any]]] = None,
        updated_reasoning_steps: Optional[List[Dict[str, Any]]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Finalize a paused turn after /resume. Updates the same row created
        when the turn first paused — we don't insert a second row for the
        continuation.

        `appended_content` is concatenated to the existing content (the
        post-approval text the agent emitted). Block / tool_call / reasoning
        lists, if provided, REPLACE the prior versions because they now
        reflect the full post-continuation state.
        """
        conv_oid = ObjectId(conversation_id) if ObjectId.is_valid(conversation_id) else conversation_id

        update: Dict[str, Any] = {"$set": {"confirmed": confirmed}}
        if appended_content:
            # Use $set on content with the new value rather than $concat
            # (Mongo doesn't have an atomic string append op pre-aggregation
            # pipelines). The caller computes the final string.
            update["$set"]["content"] = appended_content
        if updated_blocks is not None:
            update["$set"]["blocks"] = updated_blocks
        if updated_tool_calls is not None:
            update["$set"]["tool_calls"] = updated_tool_calls
        if updated_reasoning_steps is not None:
            update["$set"]["reasoning_steps"] = updated_reasoning_steps

        result = self.collection.find_one_and_update(
            {"conversation_id": conv_oid, "paused_run_id": paused_run_id},
            update,
            return_document=True,
        )
        return self._serialize(result) if result else None

    # ─── Reads ───────────────────────────────────────────────────────

    def list_for_conversation(
        self,
        *,
        conversation_id: str,
        limit: int = 500,
    ) -> List[Dict[str, Any]]:
        """All messages for a conversation, oldest first (chat-render order)."""
        conv_oid = ObjectId(conversation_id) if ObjectId.is_valid(conversation_id) else conversation_id
        cursor = (
            self.collection.find({"conversation_id": conv_oid})
            .sort("created_at", 1)
            .limit(max(1, min(limit, 2000)))
        )
        return [self._serialize(doc) for doc in cursor]

    def count_for_conversation(self, conversation_id: str) -> int:
        """Used by the conversation-list endpoint for the message_count column."""
        conv_oid = ObjectId(conversation_id) if ObjectId.is_valid(conversation_id) else conversation_id
        return self.collection.count_documents({"conversation_id": conv_oid})

    def last_for_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """Last message — used to compute `last_message_preview` for the sidebar."""
        conv_oid = ObjectId(conversation_id) if ObjectId.is_valid(conversation_id) else conversation_id
        doc = self.collection.find_one(
            {"conversation_id": conv_oid},
            sort=[("created_at", -1)],
        )
        return self._serialize(doc) if doc else None

    # ─── Serialization ──────────────────────────────────────────────

    @staticmethod
    def _serialize(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if doc is None:
            return None
        out = dict(doc)
        out["id"] = str(out.pop("_id"))
        if isinstance(out.get("conversation_id"), ObjectId):
            out["conversation_id"] = str(out["conversation_id"])
        if isinstance(out.get("created_at"), datetime):
            out["created_at"] = out["created_at"].isoformat()
        return out


# ─── Singleton ───────────────────────────────────────────────────────

_instance: Optional[ChatMessageCRUD] = None
_lock = threading.Lock()


def get_chat_message_crud() -> ChatMessageCRUD:
    global _instance
    if _instance is None:
        with _lock:
            if _instance is None:
                _instance = ChatMessageCRUD()
    return _instance
