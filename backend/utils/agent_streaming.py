"""
Agent streaming utilities for real-time responses.
"""

import logging
import time
from typing import Any, AsyncGenerator, Dict

from agno.agent import Agent
from agno.run.agent import RunEvent, RunOutput, RunOutputEvent

from utils.streaming import extract_text, sanitize_payload

logger = logging.getLogger(__name__)


async def stream_agent_response(
    query: str,
    agent: Agent,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream Agno agent events as structured payloads."""

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

    start_time = time.monotonic()
    first_delta_emitted = False

    try:
        response_stream = agent.arun(query, stream=True, stream_intermediate_steps=True)

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

            # Log events for debugging
            logger.debug(f"[Stream Event] agno_event={agno_event}, payload_keys={list(payload.keys())}")

            if agno_event == RunEvent.run_started.value:
                yield {
                    "event": "run.started",
                    "agent_id": payload.get("agent_id"),
                    "run_id": payload.get("run_id"),
                    "session_id": payload.get("session_id"),
                    "model": payload.get("model"),
                    "model_provider": payload.get("model_provider"),
                    "created_at": payload.get("created_at"),
                }
                continue

            if agno_event in {RunEvent.run_content.value, RunEvent.run_intermediate_content.value}:
                delta_text = extract_text(payload.get("content"))
                if delta_text:
                    if not first_delta_emitted:
                        first_delta_emitted = True
                        ttft_ms = (time.monotonic() - start_time) * 1000.0
                        logger.info(
                            f"TTFT: {ttft_ms:.1f}ms | Run: {payload.get('run_id')} | Session: {payload.get('session_id')}"
                        )
                    yield {
                        "event": "message.delta",
                        "content": delta_text,
                        "run_id": payload.get("run_id"),
                        "created_at": payload.get("created_at"),
                    }
                continue

            if agno_event == RunEvent.tool_call_started.value:
                tool = payload.get("tool") or {}
                yield {
                    "event": "tool.started",
                    "tool_name": tool.get("tool_name"),
                    "tool_args": tool.get("tool_args"),
                    "tool_call_id": tool.get("tool_call_id"),
                }
                continue

            if agno_event == RunEvent.tool_call_completed.value:
                tool = payload.get("tool") or {}
                yield {
                    "event": "tool.completed",
                    "tool_name": tool.get("tool_name"),
                    "tool_args": tool.get("tool_args"),
                    "result": tool.get("result"),
                    "error": tool.get("tool_call_error"),
                    "metrics": tool.get("metrics"),
                    "tool_call_id": tool.get("tool_call_id"),
                }
                continue

            if agno_event == RunEvent.run_error.value:
                yield {
                    "event": "error",
                    "error": payload.get("content") or payload.get("message"),
                    "error_type": payload.get("error_type") or payload.get("status"),
                    "run_id": payload.get("run_id"),
                }
                continue

            if agno_event == RunEvent.run_completed.value:
                run_meta = {
                    "event": "run.completed",
                    "agent_id": payload.get("agent_id"),
                    "run_id": payload.get("run_id"),
                    "session_id": payload.get("session_id"),
                    "created_at": payload.get("created_at"),
                    "status": payload.get("status"),
                    "metrics": payload.get("metrics"),
                }

                yield run_meta

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

            # Pass through any other events
            yield {
                "event": "agent.event",
                "data": payload,
            }

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
