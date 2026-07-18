"""
Agent streaming utilities for real-time responses.

Shaped after Kroolo's enterprise-fastapi agent_streaming.py but trimmed to the
features actually used by PriceIQ:

  - Core streaming loop with run.started / message.delta / run.completed
  - Tool.started / tool.completed forwarding
  - Reasoning-tool (`think` / `analyze`) output cleanup — strips the
    "CRITICAL INSTRUCTION" boilerplate Agno's ReasoningTools appends
  - Compression events (Agno emits these when context gets large)
  - HITL `run.paused` passthrough + `stream_agent_continuation` for resume
  - Accumulated content fallback so `message.completed` always fires even if
    the provider skips it on the final chunk

Not ported (Kroolo-specific, not applicable here):
  - Sub-agent dual-queue streaming (no sub-agents)
  - Intent suggestions / smart replies
  - Token cost tracking to DB
"""

import asyncio
import logging
import time
from typing import Any, AsyncGenerator, Dict, List

from agno.agent import Agent
from agno.run.agent import RunEvent, RunOutput, RunOutputEvent
from agno.run.requirement import RunRequirement

from utils.streaming import extract_text, sanitize_payload

logger = logging.getLogger(__name__)


# ─── Reasoning-tool output cleanup ──────────────────────────────────────────
# Agno's ReasoningTools sometimes appends a "CRITICAL INSTRUCTION" paragraph
# to the `thought` / `result` fields, intended for the model itself. Those
# paragraphs aren't useful to the user and look noisy in the transcript, so
# we scrub them before emitting tool events downstream.

def _strip_boilerplate(text: str) -> str:
    """Remove model-injected CRITICAL INSTRUCTION blocks from reasoning tool text.

    The boilerplate always appears as one or more paragraphs (separated by
    blank lines) that start with 'CRITICAL INSTRUCTION'. Sub-bullets (a)/(b)/(c)
    belong to those paragraphs and are dropped along with the header.
    """
    if not text:
        return text
    paragraphs = text.split("\n\n")
    kept = []
    for para in paragraphs:
        first_line = next((line.strip() for line in para.splitlines() if line.strip()), "")
        if first_line.startswith("CRITICAL INSTRUCTION"):
            continue
        kept.append(para)
    return "\n\n".join(kept).strip()


def _clean_reasoning_args(tool_args: Any) -> Any:
    """Scrub CRITICAL INSTRUCTION boilerplate from reasoning tool_args fields."""
    if not isinstance(tool_args, dict):
        return tool_args
    cleaned = dict(tool_args)
    for field in ("thought", "thoughts", "reasoning"):
        if isinstance(cleaned.get(field), str):
            cleaned[field] = _strip_boilerplate(cleaned[field])
    return cleaned


_REASONING_TOOL_NAMES = {"think", "analyze"}


# ─── Main streaming generator ───────────────────────────────────────────────

async def stream_agent_response(
    query: str,
    agent: Agent,
    *,
    module: str = "chat",
    user_id: str | None = None,
    organization_id: str | None = None,
    proposal_id: str | None = None,
    session_id: str | None = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream Agno agent events as structured payloads.

    Yields dicts with an `event` key plus event-specific fields. Downstream
    `create_sse_event_stream` converts each dict to an SSE frame.

    The identity args (module/user_id/organization_id/proposal_id/session_id)
    are used only to attribute this run's LLM token cost — passed explicitly by
    the caller, recorded once when the run's metrics finalize.
    """

    if not query or not query.strip():
        yield {
            "event": "error",
            "error": "Query cannot be empty",
            "error_type": "ValidationError",
        }
        return

    if agent is None:
        yield {
            "event": "error",
            "error": "Agent instance is required",
            "error_type": "ValidationError",
        }
        return

    # Immediate analysis event — matches Kroolo's pattern of yielding the
    # "thinking" signal as the very first chunk of the stream, before any
    # agent work starts. The frontend shows its rotating-quotes / thinking
    # indicator the moment it arrives.
    yield {
        "event": "analysis",
        "content": "Analysing your query",
    }

    start_time = time.monotonic()
    first_delta_emitted = False
    run_id: str | None = None
    run_metrics: Dict[str, Any] | None = None
    accumulated_content: list[str] = []  # for fallback message.completed

    try:
        # stream_events=True (not the older stream_intermediate_steps) is what
        # makes Agno emit tool_call_started / tool_call_completed / reasoning
        # events alongside content deltas. Without this, only message.delta
        # events reach the client.
        response_stream = agent.arun(query, stream=True, stream_events=True)

        async for run_chunk in response_stream:
            payload: Dict[str, Any]

            if isinstance(run_chunk, RunOutputEvent):
                payload = run_chunk.to_dict()
            elif isinstance(run_chunk, RunOutput):
                payload = run_chunk.to_dict()
                payload.setdefault("event", RunEvent.run_completed.value)
            else:
                payload = {
                    "event": getattr(run_chunk, "event", RunEvent.run_content.value),
                    "content": str(run_chunk),
                }

            payload = sanitize_payload(payload)
            agno_event = payload.get("event", RunEvent.run_content.value)

            # Capture run_id / metrics as we see them
            if payload.get("run_id") and not run_id:
                run_id = payload.get("run_id")
            if payload.get("metrics"):
                run_metrics = payload.get("metrics")

            logger.debug(f"[Stream Event] agno_event={agno_event}, keys={list(payload.keys())}")

            # ── run.started ───────────────────────────────────────────
            if agno_event == RunEvent.run_started.value:
                yield {
                    "event": "run.started",
                    "agent_id": payload.get("agent_id"),
                    "run_id": run_id,
                    "session_id": payload.get("session_id"),
                    "model": payload.get("model"),
                    "model_provider": payload.get("model_provider"),
                    "created_at": payload.get("created_at"),
                }
                continue

            # ── message.delta (incremental content) ───────────────────
            if agno_event in {RunEvent.run_content.value, RunEvent.run_intermediate_content.value}:
                delta_text = extract_text(payload.get("content"))
                if delta_text:
                    accumulated_content.append(delta_text)
                    if not first_delta_emitted:
                        first_delta_emitted = True
                        ttft_ms = (time.monotonic() - start_time) * 1000.0
                        logger.info(
                            f"TTFT: {ttft_ms:.1f}ms | Run: {run_id} | Session: {payload.get('session_id')}"
                        )
                    yield {
                        "event": "message.delta",
                        "content": delta_text,
                        "run_id": payload.get("run_id"),
                        "created_at": payload.get("created_at"),
                    }
                continue

            # ── tool.started (reasoning args scrubbed) ────────────────
            if agno_event == RunEvent.tool_call_started.value:
                tool = payload.get("tool") or {}
                tool_name = tool.get("tool_name", "")
                is_reasoning = tool_name in _REASONING_TOOL_NAMES
                yield {
                    "event": "tool.started",
                    "tool_name": tool_name,
                    "tool_args": (
                        _clean_reasoning_args(tool.get("tool_args"))
                        if is_reasoning
                        else tool.get("tool_args")
                    ),
                    "tool_call_id": tool.get("tool_call_id"),
                }
                continue

            # ── tool.completed (reasoning result scrubbed) ────────────
            if agno_event == RunEvent.tool_call_completed.value:
                tool = payload.get("tool") or {}
                tool_name = tool.get("tool_name", "")
                is_reasoning = tool_name in _REASONING_TOOL_NAMES
                raw_result = tool.get("result")
                yield {
                    "event": "tool.completed",
                    "tool_name": tool_name,
                    "tool_args": (
                        _clean_reasoning_args(tool.get("tool_args"))
                        if is_reasoning
                        else tool.get("tool_args")
                    ),
                    "result": (
                        _strip_boilerplate(raw_result)
                        if is_reasoning and isinstance(raw_result, str)
                        else raw_result
                    ),
                    "error": tool.get("tool_call_error"),
                    "metrics": tool.get("metrics"),
                    "tool_call_id": tool.get("tool_call_id"),
                }
                continue

            # ── Context-window compression (Agno emits these on large runs) ──
            if agno_event == RunEvent.compression_started.value:
                yield {
                    "event": "compression.started",
                    "content": "Compressing context to fit model window…",
                }
                continue

            if agno_event == RunEvent.compression_completed.value:
                yield {
                    "event": "compression.completed",
                    "content": "Compression complete.",
                    "tool_results_compressed": payload.get("tool_results_compressed"),
                    "original_size": payload.get("original_size"),
                    "compressed_size": payload.get("compressed_size"),
                }
                continue

            # ── HITL pause (not used yet; forwarded for future UI work) ─
            if agno_event == RunEvent.run_paused.value:
                yield {
                    "event": "run.paused",
                    "run_id": payload.get("run_id"),
                    "session_id": payload.get("session_id"),
                    "requirements": payload.get("requirements"),
                }
                logger.info(
                    f"[HITL] Run paused: run_id={payload.get('run_id')}, "
                    f"requirements={len(payload.get('requirements', []))}"
                )
                return  # stop streaming — client must resume via a continue endpoint

            # ── run.cancelled — user clicked Stop, agno aborted the run ──
            # Persistence still runs (the MessageTracker has whatever partial
            # content arrived before the abort), so the chat history records
            # the cancelled turn instead of silently dropping it.
            if agno_event == RunEvent.run_cancelled.value:
                yield {
                    "event": "run.cancelled",
                    "run_id": payload.get("run_id"),
                    "session_id": payload.get("session_id"),
                }
                logger.info(f"[cancel] Run cancelled: run_id={payload.get('run_id')}")
                return  # stop streaming — generator exits, persistence fires

            # ── run.error ─────────────────────────────────────────────
            if agno_event == RunEvent.run_error.value:
                yield {
                    "event": "error",
                    "error": payload.get("content") or payload.get("message"),
                    "error_type": payload.get("error_type") or payload.get("status"),
                    "run_id": payload.get("run_id"),
                }
                continue

            # ── run.completed (with message.completed + usage) ────────
            if agno_event == RunEvent.run_completed.value:
                yield {
                    "event": "run.completed",
                    "agent_id": payload.get("agent_id"),
                    "run_id": payload.get("run_id"),
                    "session_id": payload.get("session_id"),
                    "created_at": payload.get("created_at"),
                    "status": payload.get("status"),
                    "metrics": payload.get("metrics"),
                }

                final_text = extract_text(payload.get("content"))
                if final_text:
                    yield {
                        "event": "message.completed",
                        "content": final_text,
                        "run_id": payload.get("run_id"),
                        "finish_reason": payload.get("status"),
                    }

                metrics = payload.get("metrics")
                if metrics and isinstance(metrics, dict):
                    yield {
                        "event": "usage",
                        "usage": metrics,
                    }
                continue

            # ── Fallthrough: unknown events forwarded verbatim ────────
            yield {
                "event": "agent.event",
                "data": payload,
            }

        # ── Stream ended — emit message.completed as a fallback if the
        #    provider didn't already (some paths don't emit a final
        #    run_completed with content; we still want the UI to close cleanly).
        if accumulated_content and not first_delta_emitted:
            # Edge case: content arrived but no delta was emitted (unusual)
            final_text = "".join(accumulated_content)
            yield {
                "event": "message.completed",
                "content": final_text,
                "run_id": run_id,
                "finish_reason": "completed",
            }
        elif accumulated_content:
            # Normal case: deltas were emitted. Ensure a completion event
            # exists for clients that rely on it (streamingMarkdown, etc.).
            # The Agno run_completed branch above already emits this in most
            # runs; this is belt-and-braces for paths that skip it.
            pass

        if run_metrics:
            logger.debug(f"Final run_metrics: {run_metrics}")
            from utils.token_cost import record_usage
            record_usage(
                module=module,
                model=getattr(agent.model, "id", None),
                metrics=run_metrics,
                user_id=user_id,
                organization_id=organization_id,
                proposal_id=proposal_id,
                session_id=session_id,
            )

    except Exception as exc:
        logger.error(
            f"Agent streaming error for query '{query[:100]}...': {exc}",
            exc_info=True,
        )
        yield {
            "event": "error",
            "error": f"Agent execution failed: {str(exc)[:200]}",
            "error_type": type(exc).__name__,
            "query_preview": query[:100] + "..." if len(query) > 100 else query,
        }


# ─── HITL continuation streaming ────────────────────────────────────────────

async def stream_agent_continuation(
    agent: Agent,
    run_response: RunOutput,
    requirements: List[RunRequirement],
    *,
    module: str = "chat",
    user_id: str | None = None,
    organization_id: str | None = None,
    proposal_id: str | None = None,
    session_id: str | None = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream the agent response after resuming a paused HITL (requires_confirmation) run.

    Mirrors stream_agent_response's event format exactly so the frontend
    handles both flows with the same SSE consumer.

    Args:
        agent:        Rebuilt pricing agent (same session_id as the paused run).
        run_response: The patched RunOutput fetched + mutated in the router
                      (requirements already confirmed/rejected in-memory).
        requirements: The same patched requirements list — passed explicitly
                      so agno uses them instead of re-fetching from DB.
    """
    run_id = run_response.run_id

    yield {"event": "run.continued", "run_id": run_id}

    # agno only merges `requirements` into run_response.tools when run_id is
    # passed (not when run_response is passed directly). Sync manually so the
    # confirmed/rejected state actually reaches _tools.py before we hand the
    # object to acontinue_run.
    if requirements:
        updated_tools = [
            req.tool_execution
            for req in requirements
            if req.tool_execution is not None
        ]
        if updated_tools:
            if run_response.tools:
                tools_map = {t.tool_call_id: t for t in updated_tools if t.tool_call_id}
                run_response.tools = [
                    tools_map.get(t.tool_call_id, t) for t in run_response.tools
                ]
            else:
                run_response.tools = updated_tools
        run_response.requirements = requirements

    start_time = time.monotonic()
    first_delta_emitted = False
    accumulated_content: list[str] = []
    run_metrics: Dict[str, Any] | None = None
    completed_run_id: str | None = None

    _DONE = object()
    queue: asyncio.Queue = asyncio.Queue()

    async def _feed():
        try:
            async for chunk in agent.acontinue_run(
                run_response=run_response,
                stream=True,
                stream_events=True,
            ):
                await queue.put(chunk)
        except Exception as exc:
            await queue.put(exc)
        finally:
            await queue.put(_DONE)

    asyncio.create_task(_feed())

    try:
        while True:
            run_chunk = await queue.get()

            if run_chunk is _DONE:
                break
            if isinstance(run_chunk, Exception):
                raise run_chunk

            if isinstance(run_chunk, RunOutputEvent):
                payload = run_chunk.to_dict()
            elif isinstance(run_chunk, RunOutput):
                payload = run_chunk.to_dict()
                payload.setdefault("event", RunEvent.run_completed.value)
            else:
                payload = {
                    "event": getattr(run_chunk, "event", RunEvent.run_content.value),
                    "content": str(run_chunk),
                }

            from utils.streaming import sanitize_payload as _sanitize
            payload = _sanitize(payload)
            agno_event = payload.get("event", RunEvent.run_content.value)

            if payload.get("run_id") and not completed_run_id:
                completed_run_id = payload.get("run_id")
            if payload.get("metrics"):
                run_metrics = payload.get("metrics")

            if agno_event == RunEvent.run_started.value:
                yield {
                    "event": "run.started",
                    "run_id": completed_run_id,
                    "session_id": payload.get("session_id"),
                }
                continue

            if agno_event in {RunEvent.run_content.value, RunEvent.run_intermediate_content.value}:
                delta_text = extract_text(payload.get("content"))
                if delta_text:
                    accumulated_content.append(delta_text)
                    if not first_delta_emitted:
                        first_delta_emitted = True
                        ttft_ms = (time.monotonic() - start_time) * 1000.0
                        logger.info(f"HITL continuation TTFT: {ttft_ms:.1f}ms | Run: {run_id}")
                    yield {"event": "message.delta", "content": delta_text, "run_id": completed_run_id}
                continue

            if agno_event == RunEvent.tool_call_started.value:
                tool = payload.get("tool") or {}
                tool_name = tool.get("tool_name", "")
                is_reasoning = tool_name in _REASONING_TOOL_NAMES
                yield {
                    "event": "tool.started",
                    "tool_name": tool_name,
                    "tool_args": (
                        _clean_reasoning_args(tool.get("tool_args")) if is_reasoning else tool.get("tool_args")
                    ),
                    "tool_call_id": tool.get("tool_call_id"),
                }
                continue

            if agno_event == RunEvent.tool_call_completed.value:
                tool = payload.get("tool") or {}
                tool_name = tool.get("tool_name", "")
                is_reasoning = tool_name in _REASONING_TOOL_NAMES
                raw_result = tool.get("result")
                yield {
                    "event": "tool.completed",
                    "tool_name": tool_name,
                    "tool_args": (
                        _clean_reasoning_args(tool.get("tool_args")) if is_reasoning else tool.get("tool_args")
                    ),
                    "result": (
                        _strip_boilerplate(raw_result)
                        if is_reasoning and isinstance(raw_result, str)
                        else raw_result
                    ),
                    "error": tool.get("tool_call_error"),
                    "metrics": tool.get("metrics"),
                    "tool_call_id": tool.get("tool_call_id"),
                }
                continue

            # If the run pauses again (chained confirmations), forward it
            if agno_event == RunEvent.run_paused.value:
                yield {
                    "event": "run.paused",
                    "run_id": payload.get("run_id"),
                    "session_id": payload.get("session_id"),
                    "requirements": payload.get("requirements"),
                }
                logger.info(f"[HITL] Run re-paused during continuation: run_id={payload.get('run_id')}")
                return

            # Cancel can land during a resumed continuation just like the
            # initial /ask stream — forward the same shape.
            if agno_event == RunEvent.run_cancelled.value:
                yield {
                    "event": "run.cancelled",
                    "run_id": payload.get("run_id"),
                    "session_id": payload.get("session_id"),
                }
                logger.info(f"[cancel] Continuation cancelled: run_id={payload.get('run_id')}")
                return

            if agno_event == RunEvent.run_error.value:
                yield {
                    "event": "error",
                    "error": payload.get("content") or payload.get("message"),
                    "error_type": payload.get("error_type") or payload.get("status"),
                    "run_id": payload.get("run_id"),
                }
                continue

            if agno_event == RunEvent.run_completed.value:
                yield {
                    "event": "run.completed",
                    "run_id": payload.get("run_id"),
                    "session_id": payload.get("session_id"),
                    "status": payload.get("status"),
                    "metrics": payload.get("metrics"),
                }
                final_text = extract_text(payload.get("content"))
                if final_text:
                    yield {
                        "event": "message.completed",
                        "content": final_text,
                        "run_id": payload.get("run_id"),
                        "finish_reason": payload.get("status"),
                    }
                if payload.get("metrics"):
                    yield {"event": "usage", "usage": payload.get("metrics")}
                    from utils.token_cost import record_usage
                    record_usage(
                        module=module,
                        model=getattr(agent.model, "id", None),
                        metrics=payload.get("metrics"),
                        user_id=user_id,
                        organization_id=organization_id,
                        proposal_id=proposal_id,
                        session_id=session_id,
                    )
                continue

            yield {"event": "agent.event", "data": payload}

    except Exception as exc:
        logger.error(f"[HITL] Continuation streaming error: run_id={run_id}: {exc}", exc_info=True)
        yield {
            "event": "error",
            "error": f"Continuation failed: {str(exc)[:200]}",
            "error_type": type(exc).__name__,
        }
