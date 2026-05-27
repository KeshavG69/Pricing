"""
Background persistence for Q chat history.

Wraps the existing SSE stream with a small MessageTracker that observes the
same events the frontend renders (deltas, tool calls, reasoning, pauses,
errors). When the stream ends, fires a fire-and-forget asyncio task to write
the turn into `chat_conversations` + `chat_messages`.

Zero impact on user-perceived latency — the stream itself never awaits a DB
write. If the persistence task fails (network blip, schema mismatch), it's
logged and dropped; the user already got their answer.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncGenerator, Awaitable, Callable, Dict, List, Optional

from utils.chat_conversations import get_chat_conversation_crud
from utils.chat_messages import get_chat_message_crud
from utils.chat_title_generator import (
    generate_title,
    is_generation_worthwhile,
)

logger = logging.getLogger(__name__)

# Tool names whose output renders as a reasoning step (collapsible "thinking")
# in the panel rather than a tool-call pill. Keep in sync with
# REASONING_TOOL_NAMES on the frontend.
_REASONING_TOOL_NAMES = {"think", "analyze"}

# Tool names that produce an inline body artifact (chart, file download,
# search result). These get an entry in `blocks` so the artifact renders at
# the right spot in the message body when we replay later. Keep in sync with
# ARTIFACT_TOOL_NAMES on the frontend.
_ARTIFACT_TOOL_NAMES = {
    "chart_tool",
    "s3_upload_tool",
    "exa",
    "search_exa",
    "exa_search",
    "web_search",
    "exa_answer",
    "get_contents_exa",
}


class MessageTracker:
    """
    Observes SSE events as they flow through `stream_agent_response` /
    `stream_agent_continuation` and accumulates the per-turn fields that
    `chat_messages` needs.

    Render-shape mirrors PricingChatPanel so replaying a saved turn looks
    identical to the original.
    """

    def __init__(self) -> None:
        self.final_content: str = ""
        self.blocks: List[Dict[str, Any]] = []
        self.tool_calls: List[Dict[str, Any]] = []
        self.reasoning_steps: List[Dict[str, Any]] = []
        self.paused_run_id: Optional[str] = None
        self.streaming_error: bool = False

    def observe(self, event: Dict[str, Any]) -> None:
        et = event.get("event")
        if not et:
            return

        if et == "message.delta":
            text = event.get("content") or ""
            if not text:
                return
            self.final_content += text
            # Extend the trailing text block, or open a new one if the last
            # block is a tool marker. Mirrors the frontend's block-stream
            # logic so charts/files end up sandwiched between text exactly
            # as they originally streamed.
            if self.blocks and self.blocks[-1].get("kind") == "text":
                self.blocks[-1]["text"] = self.blocks[-1].get("text", "") + text
            else:
                self.blocks.append({"kind": "text", "text": text})
            return

        if et == "message.completed":
            # Prefer the provider's final content (cleaner formatting) over
            # accumulated deltas if both arrive.
            final = event.get("content")
            if final:
                self.final_content = final
            return

        if et == "tool.started":
            tool_name = event.get("tool_name") or ""
            tool_call_id = event.get("tool_call_id")
            tool_args = event.get("tool_args")
            if tool_name in _REASONING_TOOL_NAMES:
                self.reasoning_steps.append({
                    "id": tool_call_id,
                    "name": tool_name,
                    "args": tool_args,
                    "running": True,
                })
            else:
                self.tool_calls.append({
                    "id": tool_call_id,
                    "name": tool_name,
                    "args": tool_args,
                    "status": "running",
                })
                # Body artifacts get an inline block so they render between
                # text chunks at their original position.
                if tool_name in _ARTIFACT_TOOL_NAMES:
                    self.blocks.append({
                        "kind": "tool",
                        "tool_call_id": tool_call_id,
                    })
            return

        if et == "tool.completed":
            tool_name = event.get("tool_name") or ""
            tool_call_id = event.get("tool_call_id")
            result = event.get("result")
            error = event.get("error")
            args = event.get("tool_args")

            if tool_name in _REASONING_TOOL_NAMES:
                # Find the matching started reasoning step and finalize it.
                step = self._find_step(self.reasoning_steps, tool_call_id)
                if step is not None:
                    step["args"] = args if args is not None else step.get("args")
                    step["result"] = result
                    step["error"] = error
                    step["running"] = False
                else:
                    # Missed the start event — append as already-completed
                    self.reasoning_steps.append({
                        "id": tool_call_id,
                        "name": tool_name,
                        "args": args,
                        "result": result,
                        "error": error,
                        "running": False,
                    })
            else:
                call = self._find_step(self.tool_calls, tool_call_id)
                if call is not None:
                    # Merge args (started → completed may add extra fields).
                    if args is not None:
                        merged_args = {**(call.get("args") or {}), **(args or {})}
                        call["args"] = merged_args
                    call["result"] = result
                    call["status"] = "error" if error else "completed"
                    if error:
                        call["error"] = error
                else:
                    self.tool_calls.append({
                        "id": tool_call_id,
                        "name": tool_name,
                        "args": args,
                        "result": result,
                        "status": "error" if error else "completed",
                        "error": error if error else None,
                    })
            return

        if et == "run.paused":
            self.paused_run_id = event.get("run_id")
            return

        if et == "error":
            self.streaming_error = True
            return

    @staticmethod
    def _find_step(items: List[Dict[str, Any]], tool_call_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """Locate the most recent item with the matching tool_call_id."""
        if not tool_call_id:
            # Fallback: last "running" entry (best-effort if id missing)
            for it in reversed(items):
                if it.get("status") == "running" or it.get("running"):
                    return it
            return None
        for it in reversed(items):
            if it.get("id") == tool_call_id:
                return it
        return None


# ─── Stream wrapping ─────────────────────────────────────────────────

async def stream_with_tracking(
    event_stream: AsyncGenerator[Dict[str, Any], None],
    on_complete: Callable[["MessageTracker"], Awaitable[None]],
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Yields events from `event_stream` as-is while a MessageTracker quietly
    observes them. When the upstream generator is exhausted (or aborted),
    schedules `on_complete(tracker)` as a fire-and-forget background task.

    The callback NEVER blocks the SSE response — `asyncio.create_task` returns
    immediately. Use this to wrap both `stream_agent_response` and
    `stream_agent_continuation` in the chat router.
    """
    tracker = MessageTracker()
    try:
        async for event in event_stream:
            tracker.observe(event)
            yield event
    finally:
        # Schedule persistence outside the streaming pipeline. The task runs
        # on the same event loop and survives the SSE response closing.
        try:
            asyncio.create_task(_safe_persist(on_complete, tracker))
        except RuntimeError:
            # Event loop gone (shouldn't happen in a normal request). Log
            # so we know if it ever bites in prod.
            logger.warning("[chat-history] event loop closed — persistence skipped")


async def _safe_persist(
    on_complete: Callable[["MessageTracker"], Awaitable[None]],
    tracker: "MessageTracker",
) -> None:
    """Wrap the persistence callback in a swallowing try/except."""
    try:
        await on_complete(tracker)
    except Exception as exc:  # noqa: BLE001
        logger.error(
            f"[chat-history] persistence callback raised: {exc}",
            exc_info=True,
        )


# ─── Persistence callbacks ───────────────────────────────────────────

async def persist_turn(
    *,
    session_id: str,
    user_id: str,
    organization_id: str,
    proposal_id: str,
    proposal_name: Optional[str],
    user_query: str,
    tracker: MessageTracker,
) -> None:
    """
    Background-task body for /ask:
      1. Upsert the chat_conversations row (no-op on repeat calls)
      2. Insert one chat_messages row for this turn
      3. Touch updated_at on the conversation (so sidebar resorts)
      4. If this was the FIRST turn of the conversation, fire an async
         title-generation task so the sidebar gets a real title instead
         of the truncated first-message fallback.

    All MongoDB ops are sync — fast (~5-15ms each), run inside the
    background task on the event loop.
    """
    cc = get_chat_conversation_crud()
    cm = get_chat_message_crud()

    conv = cc.upsert(
        session_id=session_id,
        user_id=user_id,
        organization_id=organization_id,
        proposal_id=proposal_id,
        proposal_name=proposal_name,
        default_chat_name=user_query,
    )

    cm.insert(
        conversation_id=conv["id"],
        user_query=user_query,
        content=tracker.final_content,
        blocks=tracker.blocks,
        tool_calls=tracker.tool_calls,
        reasoning_steps=tracker.reasoning_steps,
        paused_run_id=tracker.paused_run_id,
        confirmed=None,
        streaming_error=tracker.streaming_error,
    )

    cc.touch(session_id)

    # ── First-turn title upgrade ─────────────────────────────────
    # If this was the conversation's first persisted message, schedule
    # an LLM call to upgrade the auto-derived chat_name into a real
    # scannable title. Fire-and-forget; user already has their answer.
    # Skipped if the conversation already has a custom name (defensive
    # against the rare case where rename ran before first persist).
    try:
        if cm.count_for_conversation(conv["id"]) == 1 and not conv.get("title_is_custom"):
            if is_generation_worthwhile(user_query):
                asyncio.create_task(
                    _safe_generate_title(
                        conversation_id=conv["id"],
                        user_id=user_id,
                        user_query=user_query,
                    )
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[chat-history] failed to schedule title-gen: {exc}")


async def _safe_generate_title(
    *,
    conversation_id: str,
    user_id: str,
    user_query: str,
) -> None:
    """
    Background-task body for first-turn title upgrade. Always swallows
    errors — title gen is non-essential; never block the chat UX.
    """
    try:
        title = generate_title(user_query)
        cc = get_chat_conversation_crud()
        cc.set_generated_title(
            conversation_id=conversation_id,
            user_id=user_id,
            new_name=title,
            force=False,  # never overwrite a user rename
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            f"[chat-history] title-gen failed for conv={conversation_id}: {exc}"
        )


async def persist_continuation(
    *,
    session_id: str,
    paused_run_id: str,
    confirmed: bool,
    tracker: MessageTracker,
) -> None:
    """
    Background-task body for /resume:
      1. Find the paused message in chat_messages by (session_id, paused_run_id)
      2. Append the continuation content + merge blocks/tool_calls/reasoning
      3. Set `confirmed` = the user's decision
      4. Touch the parent conversation's updated_at

    If no matching paused message is found (race condition / stale resume),
    log and exit — we don't want to insert a phantom row.
    """
    cc = get_chat_conversation_crud()
    cm = get_chat_message_crud()

    conv = cc.get_by_session(session_id=session_id)
    if not conv:
        logger.warning(
            f"[chat-history] resume: no conversation for session_id={session_id}"
        )
        return

    conversation_id = conv["id"]

    # Pull the original paused message so we can merge into it cleanly.
    existing_msgs = cm.list_for_conversation(conversation_id=conversation_id)
    paused_msg = next(
        (m for m in existing_msgs if m.get("paused_run_id") == paused_run_id),
        None,
    )

    if not paused_msg:
        logger.warning(
            f"[chat-history] resume: no paused message found "
            f"(session={session_id}, run={paused_run_id})"
        )
        return

    # Merge: continuation deltas append to existing content; tool_calls list
    # is rebuilt from a union (matching status from continuation overrides).
    appended_content = (paused_msg.get("content") or "") + tracker.final_content

    merged_blocks = list(paused_msg.get("blocks") or [])
    merged_blocks.extend(tracker.blocks)

    merged_tool_calls = _merge_by_id(
        paused_msg.get("tool_calls") or [],
        tracker.tool_calls,
    )
    merged_reasoning = _merge_by_id(
        paused_msg.get("reasoning_steps") or [],
        tracker.reasoning_steps,
    )

    cm.update_paused_message(
        conversation_id=conversation_id,
        paused_run_id=paused_run_id,
        confirmed=confirmed,
        appended_content=appended_content,
        updated_blocks=merged_blocks,
        updated_tool_calls=merged_tool_calls,
        updated_reasoning_steps=merged_reasoning,
    )

    cc.touch(session_id)


def _merge_by_id(
    existing: List[Dict[str, Any]],
    incoming: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Merge two ordered lists of {id, ...} dicts so that incoming entries
    replace existing ones by id, and new incoming entries are appended.
    Stable order — existing-first, then new.
    """
    by_id = {it.get("id"): it for it in existing if it.get("id")}
    for it in incoming:
        tid = it.get("id")
        if tid and tid in by_id:
            by_id[tid] = it
        else:
            existing.append(it)
            if tid:
                by_id[tid] = it
    # Reconstruct preserving original order; replaced entries take new value
    out: List[Dict[str, Any]] = []
    seen_ids = set()
    for it in existing:
        tid = it.get("id")
        if tid and tid in seen_ids:
            continue
        if tid:
            out.append(by_id.get(tid, it))
            seen_ids.add(tid)
        else:
            out.append(it)
    return out
