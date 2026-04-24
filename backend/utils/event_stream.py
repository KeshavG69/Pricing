"""
Per-proposal event log for streaming parser progress to the browser.

Design:
- Two collections: `proposal_events` (event docs) and `proposal_event_counters`
  (one counter doc per proposal_id).
- `_next_seq` uses MongoDB `$inc` with upsert, which is atomic server-side.
  That keeps seq numbers monotonic and collision-free even when two Celery
  worker threads publish for different proposals simultaneously, and even
  when a single run's streaming loop rapidly publishes multiple events.
- Events are isolated by `proposal_id`. Two concurrent ingestions never
  mix: each has its own counter doc and its own seq sequence.
- Frontend polls `?since=<last_seq>`; backend returns events ordered by seq.
- On terminal state (completed / error / timeout), the worker calls
  `cleanup(proposal_id)` to drop the events + counter. A TTL index on `ts`
  is a backstop for crashed workers that never cleaned up.

Uses sync pymongo (matches every other CRUD module in this codebase) so it
works cleanly in the Celery thread-pool worker without any event-loop
binding issues.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
import threading

from pymongo import ReturnDocument

from auth.database import get_mongodb_client


EVENTS_TTL_SECONDS = 3600  # 1 hour backstop if cleanup never runs


class EventStream:
    """Per-proposal event log with atomic sequence numbers."""

    def __init__(self):
        mongodb = get_mongodb_client()
        self.db = mongodb.get_database()
        self.events = self.db["proposal_events"]
        self.counters = self.db["proposal_event_counters"]

        try:
            self.events.create_index([("proposal_id", 1), ("seq", 1)])
            self.events.create_index("ts", expireAfterSeconds=EVENTS_TTL_SECONDS)
        except Exception:
            # Index creation is best-effort; server may already have equivalent indexes.
            pass

    def _next_seq(self, proposal_id: str) -> int:
        """Atomic per-proposal sequence counter. Safe under concurrent publishers."""
        doc = self.counters.find_one_and_update(
            {"_id": proposal_id},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return int(doc["seq"])

    def publish(self, proposal_id: str, event: str, payload: Optional[Dict[str, Any]] = None) -> int:
        """Append an event for a proposal. Returns the assigned seq."""
        seq = self._next_seq(proposal_id)
        self.events.insert_one({
            "proposal_id": proposal_id,
            "seq": seq,
            "event": event,
            "payload": payload or {},
            "ts": datetime.utcnow(),
        })
        return seq

    def get_since(self, proposal_id: str, since: int, limit: int = 500) -> List[Dict[str, Any]]:
        """Return events for a proposal with seq > `since`, ordered by seq."""
        cursor = (
            self.events.find(
                {"proposal_id": proposal_id, "seq": {"$gt": since}},
                {"_id": 0},
            )
            .sort("seq", 1)
            .limit(limit)
        )
        out = []
        for doc in cursor:
            ts = doc.get("ts")
            if isinstance(ts, datetime):
                doc["ts"] = ts.isoformat() + "Z"
            out.append(doc)
        return out

    def cleanup(self, proposal_id: str) -> None:
        """Drop all events + counter for a proposal. Called on terminal state."""
        self.events.delete_many({"proposal_id": proposal_id})
        self.counters.delete_one({"_id": proposal_id})


_stream: Optional[EventStream] = None
_stream_lock = threading.Lock()


def get_event_stream() -> EventStream:
    """Process-wide singleton. Uses sync pymongo so it's thread-safe."""
    global _stream
    if _stream is None:
        with _stream_lock:
            if _stream is None:
                _stream = EventStream()
    return _stream
