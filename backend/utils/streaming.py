"""
Streaming utilities for SSE (Server-Sent Events) responses.
"""

import asyncio
import json
import logging
from contextlib import suppress
from typing import Any, AsyncIterator, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)


def extract_text(content: Any) -> Optional[str]:
    """Best-effort extraction of textual content from heterogeneous payloads."""

    if content is None:
        return None

    if isinstance(content, str):
        return content

    if isinstance(content, dict):
        if "text" in content and isinstance(content["text"], str):
            return content["text"]
        if "content" in content and isinstance(content["content"], str):
            return content["content"]
        return extract_text(content.get("value")) or extract_text(content.get("output"))

    if isinstance(content, Iterable) and not isinstance(content, (bytes, bytearray)):
        fragments: List[str] = []
        for item in content:
            piece = extract_text(item)
            if piece:
                fragments.append(piece)
        if fragments:
            return "".join(fragments)

    return None


def sanitize_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure payload is JSON-serializable without mutating the original dict."""

    try:
        json.dumps(data)
        return data
    except TypeError:

        def _coerce(value: Any) -> Any:
            if isinstance(value, dict):
                return {k: _coerce(v) for k, v in value.items()}
            if isinstance(value, list):
                return [_coerce(v) for v in value]
            try:
                json.dumps(value)
                return value
            except TypeError:
                return str(value)

        return {k: _coerce(v) for k, v in data.items()}


def create_sse_event_stream(
    events: AsyncIterator[Dict[str, Any]],
) -> AsyncIterator[str]:
    """Convert structured events into SSE frames with keepalive heartbeats."""

    async def _run():
        iterator = events.__aiter__()
        pending = asyncio.create_task(iterator.__anext__())
        event_id = 0
        keepalive_interval = 300  # seconds

        try:
            while True:
                try:
                    # Wait for next event with timeout for keepalive
                    event = await asyncio.wait_for(pending, timeout=keepalive_interval)
                except asyncio.TimeoutError:
                    # Send keepalive comment to maintain connection
                    yield ": keepalive\n\n"
                    # Continue waiting for the actual event
                    continue
                except StopAsyncIteration:
                    yield "data: [DONE]\n\n"
                    break
                except Exception as exc:
                    event_id += 1
                    fallback = {
                        "event": "error",
                        "error": str(exc),
                        "error_type": "StreamingError",
                    }
                    data = json.dumps(fallback, ensure_ascii=False, default=str)
                    yield f"id: {event_id}\nevent: error\ndata: {data}\n\n"
                    yield "data: [DONE]\n\n"
                    break
                else:
                    event_id += 1
                    payload = {k: v for k, v in event.items() if k != "event"}
                    data = json.dumps(payload, ensure_ascii=False, default=str)
                    event_name = event.get("event", "message.delta")
                    yield f"id: {event_id}\nevent: {event_name}\ndata: {data}\n\n"
                    pending = asyncio.create_task(iterator.__anext__())
        finally:
            if not pending.done():
                pending.cancel()
                with suppress(asyncio.CancelledError):
                    await pending
            else:
                with suppress(asyncio.CancelledError, StopAsyncIteration):
                    pending.result()

    return _run()
