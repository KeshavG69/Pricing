"""
Pricing chat router — streams answers from the Pricing Agent via SSE.

The proposal-state context is built server-side from MongoDB on every request
(see `utils.proposal_context_builder.build_proposal_context`). The frontend
just sends `proposal_id` + identity; no need to ship a 200-300 KB JSON blob
over the wire each turn. Same source of truth as the Excel export.
"""

import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import logging

from agent.pricing_agent import get_pricing_agent
from agno.run.requirement import RunRequirement
from utils.agent_streaming import stream_agent_continuation, stream_agent_response
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
) -> str:
    """
    Fetch the proposal from MongoDB and serialize it as the JSON blob the
    agent consumes inside its <proposal_state> instruction block.

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
    return json.dumps(ctx, default=str)


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
        proposal_context = _load_proposal_context(
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

        async def sse_stream():
            # stream_agent_response yields the `analysis` event as its very
            # first chunk (matches Kroolo's "QueryAnalysing" pattern), so the
            # UI's thinking indicator fires before the agent is awaited.
            events = stream_agent_response(request.query, agent)
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
        proposal_context = _load_proposal_context(
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

        async def sse_stream():
            events = stream_agent_continuation(agent, run_response, requirements)
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
