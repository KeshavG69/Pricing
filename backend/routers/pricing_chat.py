"""
Pricing chat router — streams answers from the Pricing Agent via SSE.

The proposal-state context is built server-side from MongoDB on every request
(see `utils.proposal_context_builder.build_proposal_context`). The frontend
just sends `proposal_id` + identity; no need to ship a 200-300 KB JSON blob
over the wire each turn. Same source of truth as the Excel export.

Chat history is persisted out-of-band via `utils.chat_persistence`: a
MessageTracker observes the SSE events as they flow through, and a
fire-and-forget asyncio task writes the turn into chat_conversations /
chat_messages after the stream ends. The streaming hot path never awaits
a DB write.

The /conversations endpoints under this router expose that chat history:
listing for the sidebar, full replay for resuming a past chat, rename, and
soft-delete (trash). Identity (user_id / organization_id) is passed as
query params / body fields to match the rest of this router.
"""

import json
from typing import List, Literal, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import logging

from agent.pricing_agent import get_pricing_agent
from agno.run.requirement import RunRequirement
from utils.agent_streaming import stream_agent_continuation, stream_agent_response
from utils.chat_conversations import get_chat_conversation_crud
from utils.chat_messages import get_chat_message_crud
from utils.chat_persistence import (
    persist_continuation,
    persist_turn,
    stream_with_tracking,
)
from utils.chat_title_generator import (
    generate_title,
    is_generation_worthwhile,
)
from utils.proposal_context_builder import build_proposal_context
from utils.proposals import get_proposal_crud
from utils.python_repl_tool import set_session_id
from utils.streaming import create_sse_event_stream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pricing-chat", tags=["pricing-chat"])


class PricingChatQuery(BaseModel):
    """Request body for the pricing chat endpoint."""

    query: str
    session_id: str
    organization_id: str
    proposal_id: str          # now required — the agent reads context from DB
    user_id: str              # now required — used for org-scoped access check
    role: Optional[str] = None
    # Retrieval tools — "bls" enables SOC retriever + wage lookup;
    # "gsa" enables GSA labor-category retriever + rate lookup.
    proposal_type: Optional[str] = None  # "bls" | "gsa"
    gsa_file_id: Optional[str] = None  # required when proposal_type == "gsa"
    gsa_current_year: Optional[int] = None  # current GSA contract year from frontend positions


class PricingChatResumeRequest(BaseModel):
    """Request body for resuming a paused (requires_confirmation) agent run."""

    run_id: str
    session_id: str
    organization_id: str
    confirmed: bool  # True = approve the pending tool, False = reject
    confirmation_note: Optional[str] = None  # Optional rejection reason
    # Identity needed to rebuild mutation tools + refetch proposal context
    proposal_id: str
    user_id: str
    role: Optional[str] = None
    proposal_type: Optional[str] = None
    gsa_file_id: Optional[str] = None
    gsa_current_year: Optional[int] = None


def _load_proposal_context(
    proposal_id: str,
    user_id: str,
    organization_id: str,
    role: Optional[str],
) -> Tuple[str, Optional[str]]:
    """
    Fetch the proposal from MongoDB and serialize it as the JSON blob the
    agent consumes inside its <proposal_state> instruction block.

    Returns a tuple of (serialized_context, proposal_name). The proposal_name
    is denormalized into chat_conversations so the sidebar can render without
    a second collection lookup.

    Raises HTTPException(404) if the proposal is missing or the caller can't
    access it.
    """
    crud = get_proposal_crud()
    doc = crud.get_proposal(
        proposal_id=proposal_id,
        user_id=user_id,
        organization_id=organization_id,
        role=role,
    )
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Proposal not found or access denied",
        )
    ctx = build_proposal_context(doc)
    return json.dumps(ctx, default=str), doc.get("name")


@router.post("/ask")
async def ask_pricing(request: PricingChatQuery):
    """
    Ask a question about a proposal.

    Request body:
        {
            "query": "How many off-site positions and what's their total cost?",
            "session_id": "session_abc123",
            "organization_id": "6939ab...",
            "proposal_id": "6929ae...",
            "user_id": "d843...",
            "role": "admin",
            "proposal_type": "bls" | "gsa",   // optional, enables retrieval tools
            "gsa_file_id": "...",             // required when proposal_type=="gsa"
            "gsa_current_year": 5             // optional, GSA contract year
        }

    Response: SSE stream (same event shape as /api/help/ask).
    """
    try:
        if not request.query or not request.query.strip():
            raise HTTPException(
                status_code=400, detail="Query is required and cannot be empty"
            )
        if not request.organization_id or not request.organization_id.strip():
            raise HTTPException(status_code=400, detail="organization_id is required")
        if not request.proposal_id or not request.proposal_id.strip():
            raise HTTPException(status_code=400, detail="proposal_id is required")
        if not request.user_id or not request.user_id.strip():
            raise HTTPException(status_code=400, detail="user_id is required")

        # Build context server-side from MongoDB. Single source of truth with
        # the Excel export; no stale-frontend-blob risk.
        proposal_context, proposal_name = _load_proposal_context(
            proposal_id=request.proposal_id,
            user_id=request.user_id,
            organization_id=request.organization_id,
            role=request.role,
        )

        logger.info(
            f"[pricing-chat] session={request.session_id} org={request.organization_id} "
            f"proposal_id={request.proposal_id} query_len={len(request.query)} "
            f"context_len={len(proposal_context)}"
        )

        # Build a fresh agent for this request with the live proposal state
        # baked into its instructions (Kroolo pattern — cache components,
        # rebuild the Agent shell). Heavy components (LLM, DB, memory,
        # reasoning, formulas text) are cached at module level.
        agent = get_pricing_agent(
            session_id=request.session_id,
            proposal_context=proposal_context,
            proposal_id=request.proposal_id,
            user_id=request.user_id,
            organization_id=request.organization_id,
            role=request.role,
            proposal_type=request.proposal_type,
            gsa_file_id=request.gsa_file_id,
            gsa_current_year=request.gsa_current_year,
        )

        # Bind the session_id into the contextvar that python_repl_tool reads
        # at runtime. Each chat session gets its own isolated temp directory.
        set_session_id(request.session_id)

        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Vary": "Accept",
        }

        # Capture identity into the persistence callback closure — the SSE
        # generator must be able to call this after the stream ends without
        # re-reading `request` (which is gone by then).
        async def _on_turn_complete(tracker):
            await persist_turn(
                session_id=request.session_id,
                user_id=request.user_id,
                organization_id=request.organization_id,
                proposal_id=request.proposal_id,
                proposal_name=proposal_name,
                user_query=request.query,
                tracker=tracker,
            )

        async def sse_stream():
            # stream_agent_response yields the `analysis` event as its very
            # first chunk (matches Kroolo's "QueryAnalysing" pattern), so the
            # UI's thinking indicator fires before the agent is awaited.
            #
            # stream_with_tracking observes events as they pass through, then
            # fires `_on_turn_complete` as a fire-and-forget background task
            # when the upstream generator exhausts — zero blocking on the user.
            events = stream_with_tracking(
                stream_agent_response(request.query, agent),
                on_complete=_on_turn_complete,
            )
            async for chunk in create_sse_event_stream(events):
                yield chunk

        return StreamingResponse(
            sse_stream(),
            media_type="text/event-stream",
            headers=headers,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in pricing chat endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resume")
async def resume_pricing(request: PricingChatResumeRequest):
    """
    Resume a paused pricing-agent run after the user approves or rejects
    the pending requires_confirmation tool call.

    Like /ask, this refetches the proposal from MongoDB so the post-approval
    continuation sees the latest state (which now includes whatever the
    mutation just wrote).
    """
    try:
        if not request.run_id or not request.run_id.strip():
            raise HTTPException(status_code=400, detail="run_id is required")
        if not request.session_id or not request.session_id.strip():
            raise HTTPException(status_code=400, detail="session_id is required")
        if not request.organization_id or not request.organization_id.strip():
            raise HTTPException(status_code=400, detail="organization_id is required")
        if not request.proposal_id or not request.proposal_id.strip():
            raise HTTPException(status_code=400, detail="proposal_id is required")
        if not request.user_id or not request.user_id.strip():
            raise HTTPException(status_code=400, detail="user_id is required")

        logger.info(
            f"[pricing-chat/resume] run={request.run_id} session={request.session_id} "
            f"confirmed={request.confirmed} proposal_id={request.proposal_id!r} "
            f"user_id={request.user_id!r} org={request.organization_id!r} role={request.role!r}"
        )

        # Rebuild context from MongoDB (mutation may already have landed).
        proposal_context, _proposal_name = _load_proposal_context(
            proposal_id=request.proposal_id,
            user_id=request.user_id,
            organization_id=request.organization_id,
            role=request.role,
        )

        # Rebuild the agent identically to the original /ask call so agno can
        # locate the stored run in its agent_sessions collection.
        agent = get_pricing_agent(
            session_id=request.session_id,
            proposal_context=proposal_context,
            proposal_id=request.proposal_id,
            user_id=request.user_id,
            organization_id=request.organization_id,
            role=request.role,
            proposal_type=request.proposal_type,
            gsa_file_id=request.gsa_file_id,
            gsa_current_year=request.gsa_current_year,
        )
        set_session_id(request.session_id)

        # Fetch the paused RunOutput from MongoDB (stored by agno on pause).
        run_response = await agent.aget_run_output(
            run_id=request.run_id,
            session_id=request.session_id,
        )
        if run_response is None:
            raise HTTPException(
                status_code=404,
                detail=f"Paused run '{request.run_id}' not found. It may have expired.",
            )

        # Patch every pending confirmation requirement with the user's decision.
        requirements: list[RunRequirement] = run_response.requirements or []
        for req in requirements:
            if req.needs_confirmation:
                if request.confirmed:
                    req.confirm()
                else:
                    req.reject(note=request.confirmation_note)

        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Vary": "Accept",
        }

        # Capture for the persistence callback closure.
        paused_run_id_for_persist = request.run_id
        confirmed_for_persist = request.confirmed
        session_id_for_persist = request.session_id

        async def _on_continuation_complete(tracker):
            await persist_continuation(
                session_id=session_id_for_persist,
                paused_run_id=paused_run_id_for_persist,
                confirmed=confirmed_for_persist,
                tracker=tracker,
            )

        async def sse_stream():
            events = stream_with_tracking(
                stream_agent_continuation(agent, run_response, requirements),
                on_complete=_on_continuation_complete,
            )
            async for chunk in create_sse_event_stream(events):
                yield chunk

        return StreamingResponse(
            sse_stream(),
            media_type="text/event-stream",
            headers=headers,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in pricing chat resume endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# RUN CANCELLATION — user-initiated mid-stream stop
# =============================================================================


class PricingChatCancelRequest(BaseModel):
    """Request body for cancelling an in-flight pricing-agent run."""

    run_id: str
    session_id: str
    organization_id: str
    proposal_id: str
    user_id: str
    role: Optional[str] = None


@router.post("/cancel")
async def cancel_pricing_run(request: PricingChatCancelRequest):
    """
    Cancel an in-flight agent run (user clicked Stop mid-response).

    Mechanism (per agno's run-cancellation docs):
      1. We rebuild a minimal Agent shell — same session_id and component
         cache as /ask, just without re-fetching the heavy proposal context
         from MongoDB. Cancellation is keyed on run_id, not on agent state.
      2. We call agent.acancel_run(run_id), which flips a cancellation flag
         in agno's run store.
      3. The in-progress SSE stream from /ask (or /resume) observes the flag,
         emits a RunEvent.run_cancelled, and exits — our agent_streaming
         layer forwards that as a "run.cancelled" SSE event the frontend can
         react to (close the streaming UI, mark the partial message done).
      4. The MessageTracker / persistence callback still fires on stream
         end, so the partial answer is saved into chat history — no silent
         loss when the user stops mid-reply.

    Returns:
        { "cancelled": <bool>, "run_id": str }
        cancelled=False either means the run already finished or the run_id
        isn't recognized — both are NOT errors, just no-ops.
    """
    try:
        if not request.run_id or not request.run_id.strip():
            raise HTTPException(status_code=400, detail="run_id is required")
        if not request.session_id or not request.session_id.strip():
            raise HTTPException(status_code=400, detail="session_id is required")
        if not request.proposal_id or not request.proposal_id.strip():
            raise HTTPException(status_code=400, detail="proposal_id is required")
        if not request.user_id or not request.user_id.strip():
            raise HTTPException(status_code=400, detail="user_id is required")

        logger.info(
            f"[pricing-chat/cancel] run={request.run_id} session={request.session_id} "
            f"proposal={request.proposal_id} user={request.user_id}"
        )

        # Cancel only needs the agno db connection (cancellation state lives
        # in agent_sessions). Skip the MongoDB proposal-context fetch /ask
        # does — pass an empty string. All cached agent components (LLM, db,
        # memory) are reused via _components, so this build is cheap.
        agent = get_pricing_agent(
            session_id=request.session_id,
            proposal_context="",
            proposal_id=request.proposal_id,
            user_id=request.user_id,
            organization_id=request.organization_id,
            role=request.role,
        )

        cancelled = await agent.acancel_run(request.run_id)
        return {"cancelled": bool(cancelled), "run_id": request.run_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in pricing chat cancel endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to cancel run")


# =============================================================================
# CHAT HISTORY — list / load / rename / trash
# =============================================================================

class ConversationRenameRequest(BaseModel):
    """Body for PATCH /conversations/{id} (rename)."""

    user_id: str
    chat_name: str = Field(..., min_length=1, max_length=200)


class ConversationTrashRequest(BaseModel):
    """Body for PATCH /conversations/{id}/trash (soft delete)."""

    user_id: str


class ConversationGenerateTitleRequest(BaseModel):
    """Body for POST /conversations/{id}/generate-title (LLM-summarised title)."""

    user_id: str
    # Allow overwriting a title the user manually renamed. Default False so
    # the auto-trigger from "first message persisted" can fire safely
    # without clobbering anything the user typed.
    force: bool = False


def _hydrate_conversation_for_list(conv: dict) -> dict:
    """
    Add `message_count` and `last_message_preview` to a conversation row for
    the sidebar feed. Two extra MongoDB roundtrips per conversation, fine at
    50 rows; if it ever becomes a hotspot we'd switch to an aggregation
    pipeline or denormalize counters onto the conversation doc.
    """
    cm = get_chat_message_crud()
    conv_id = conv["id"]
    conv["message_count"] = cm.count_for_conversation(conv_id)
    last = cm.last_for_conversation(conv_id)
    if last:
        content = (last.get("content") or "").strip()
        conv["last_message_preview"] = content[:120] if content else None
    else:
        conv["last_message_preview"] = None
    return conv


@router.get("/conversations")
async def list_conversations(
    user_id: str = Query(..., description="Authenticated user ID (owner of the chats)"),
    organization_id: str = Query(..., description="Organization scope"),
    proposal_id: Optional[str] = Query(
        None, description="Filter to chats about this proposal"
    ),
    status: Literal["active", "deleted"] = Query(
        "active", description="active = inbox, deleted = trash"
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    List the user's chat conversations for the sidebar.

    Sorted by `updated_at` descending (most recently used first). Each row
    is hydrated with `message_count` and `last_message_preview` for display
    without needing a second roundtrip.

    Returns:
        { "conversations": [...], "total": <hydrated count> }
    """
    try:
        if not user_id.strip() or not organization_id.strip():
            raise HTTPException(
                status_code=400, detail="user_id and organization_id are required"
            )

        cc = get_chat_conversation_crud()
        rows = cc.list(
            user_id=user_id,
            organization_id=organization_id,
            proposal_id=proposal_id,
            status=status,
            limit=limit,
            offset=offset,
        )

        hydrated = [_hydrate_conversation_for_list(r) for r in rows]
        return {
            "conversations": hydrated,
            "total": len(hydrated),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing conversations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations/{conversation_id}")
async def get_conversation_with_messages(
    conversation_id: str,
    user_id: str = Query(..., description="Authenticated user ID (owner)"),
):
    """
    Load one conversation with its full message history — used by the panel
    or fullscreen view to re-hydrate a past chat for the user to read /
    continue.

    Owner-scoped: returns 404 if the conversation doesn't exist OR isn't
    owned by `user_id`. Same response for both to avoid leaking existence.

    Returns:
        { "conversation": {...}, "messages": [...] }
    """
    try:
        if not user_id.strip():
            raise HTTPException(status_code=400, detail="user_id is required")

        cc = get_chat_conversation_crud()
        cm = get_chat_message_crud()

        conv = cc.get(conversation_id=conversation_id, user_id=user_id)
        if not conv:
            raise HTTPException(
                status_code=404, detail="Conversation not found or access denied"
            )

        messages = cm.list_for_conversation(conversation_id=conv["id"])
        return {
            "conversation": conv,
            "messages": messages,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading conversation {conversation_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/conversations/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    request: ConversationRenameRequest,
):
    """
    Rename a conversation (sidebar title). Owner-only.

    Returns:
        { "conversation": <updated row> }
    """
    try:
        cc = get_chat_conversation_crud()
        updated = cc.rename(
            conversation_id=conversation_id,
            user_id=request.user_id,
            new_name=request.chat_name,
        )
        if not updated:
            raise HTTPException(
                status_code=404, detail="Conversation not found or access denied"
            )
        return {"conversation": updated}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error renaming conversation {conversation_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/conversations/{conversation_id}/trash")
async def trash_conversation(
    conversation_id: str,
    request: ConversationTrashRequest,
):
    """
    Soft-delete a conversation — flips status to "deleted". Row stays in
    Mongo (and so do its messages); the sidebar list filters them out by
    default. Recoverable if/when we build a trash view.

    Returns:
        { "success": true }
    """
    try:
        cc = get_chat_conversation_crud()
        ok = cc.soft_delete(
            conversation_id=conversation_id,
            user_id=request.user_id,
        )
        if not ok:
            raise HTTPException(
                status_code=404, detail="Conversation not found or access denied"
            )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error trashing conversation {conversation_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/conversations/{conversation_id}/generate-title")
async def generate_conversation_title(
    conversation_id: str,
    request: ConversationGenerateTitleRequest,
):
    """
    Use the LLM to produce a short scannable title for the conversation,
    based on its first user message. Mirrors Kroolo's
    /api/ai-chat/generate-title pattern.

    Behavior:
      - Authz: caller must own the conversation (user_id match).
      - Skips the LLM round-trip on greetings / very short messages and
        keeps the default title.
      - Respects `title_is_custom=True` (user manually renamed) unless
        the request passes `force=true`.
      - On any error, returns the conversation unchanged with the existing
        title — never breaks the chat experience.

    Returns:
        { "conversation": <conversation>, "generated_title": <str> }
    """
    try:
        cc = get_chat_conversation_crud()
        cm = get_chat_message_crud()

        conv = cc.get(conversation_id=conversation_id, user_id=request.user_id)
        if not conv:
            raise HTTPException(
                status_code=404, detail="Conversation not found or access denied"
            )

        # If user already renamed manually, don't waste the LLM call (unless
        # the caller explicitly forces a regeneration).
        if conv.get("title_is_custom") and not request.force:
            return {"conversation": conv, "generated_title": conv["chat_name"]}

        # Find the first user message — that's what we summarise.
        messages = cm.list_for_conversation(conversation_id=conv["id"], limit=5)
        first_query: Optional[str] = next(
            (m.get("user_query") for m in messages if m.get("user_query")),
            None,
        )
        if not first_query or not is_generation_worthwhile(first_query):
            # Not worth an LLM call — return current title as-is.
            return {"conversation": conv, "generated_title": conv["chat_name"]}

        new_title = generate_title(first_query)

        # If the LLM produced essentially what we already have, skip the write.
        if new_title.strip().lower() == conv["chat_name"].strip().lower():
            return {"conversation": conv, "generated_title": new_title}

        updated = cc.set_generated_title(
            conversation_id=conv["id"],
            user_id=request.user_id,
            new_name=new_title,
            force=request.force,
        )
        return {
            "conversation": updated or conv,
            "generated_title": new_title,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error generating title for conversation {conversation_id}: {e}",
            exc_info=True,
        )
        # Fail soft — never block the chat UX on title generation.
        cc = get_chat_conversation_crud()
        conv = cc.get(conversation_id=conversation_id, user_id=request.user_id)
        if conv:
            return {"conversation": conv, "generated_title": conv["chat_name"]}
        raise HTTPException(status_code=500, detail=str(e))
