"""
Pricing chat router — streams answers from the Pricing Agent via SSE.

The frontend passes its fully-computed proposal state as `proposal_context`;
the agent reads figures directly from it (readable-state pattern). No
compute tools in v1.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import logging

from agent.pricing_agent import get_pricing_agent
from agno.run.requirement import RunRequirement
from utils.agent_streaming import stream_agent_continuation, stream_agent_response
from utils.python_repl_tool import set_session_id
from utils.streaming import create_sse_event_stream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pricing-chat", tags=["pricing-chat"])


class PricingChatQuery(BaseModel):
    """Request body for the pricing chat endpoint."""

    query: str
    proposal_context: str  # Serialized computed state from the frontend
    session_id: str
    organization_id: str
    # Identity fields for mutation tools (update_rates / update_positions).
    # Optional so existing clients don't break; mutation tools are simply
    # omitted when not provided.
    proposal_id: Optional[str] = None
    user_id: Optional[str] = None
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
    proposal_context: str  # Resent by frontend to rebuild the agent identically
    organization_id: str
    confirmed: bool  # True = approve the pending tool, False = reject
    confirmation_note: Optional[str] = None  # Optional rejection reason
    # Mirror of /ask identity fields — needed to rebuild mutation tools identically
    proposal_id: Optional[str] = None
    user_id: Optional[str] = None
    role: Optional[str] = None
    proposal_type: Optional[str] = None
    gsa_file_id: Optional[str] = None
    gsa_current_year: Optional[int] = None


@router.post("/ask")
async def ask_pricing(request: PricingChatQuery):
    """
    Ask a question about the currently-open proposal.

    Request body:
        {
            "query": "How many off-site positions and what's their total cost?",
            "proposal_context": "<YAML/JSON of computed proposal state>",
            "session_id": "session_abc123",
            "organization_id": "6939ab..."
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

        logger.info(
            f"[pricing-chat] session={request.session_id} org={request.organization_id} "
            f"query_len={len(request.query)} context_len={len(request.proposal_context)}"
        )

        # Build a fresh agent for this request with the live proposal state
        # baked into its instructions (Kroolo pattern — cache components,
        # rebuild the Agent shell). Heavy components (LLM, DB, memory,
        # reasoning, formulas text) are cached at module level.
        agent = get_pricing_agent(
            session_id=request.session_id,
            proposal_context=request.proposal_context,
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

    The frontend receives a `run.paused` SSE event from /ask, shows the
    approval card, and POSTs here with the user's decision.

    Request body:
        {
            "run_id": "run_abc123",
            "session_id": "session_abc123",
            "proposal_context": "<same YAML/JSON sent to /ask>",
            "organization_id": "6939ab...",
            "confirmed": true,
            "confirmation_note": null
        }

    Response: SSE stream (same event shape as /ask).
    """
    try:
        if not request.run_id or not request.run_id.strip():
            raise HTTPException(status_code=400, detail="run_id is required")
        if not request.session_id or not request.session_id.strip():
            raise HTTPException(status_code=400, detail="session_id is required")
        if not request.organization_id or not request.organization_id.strip():
            raise HTTPException(status_code=400, detail="organization_id is required")

        logger.info(
            f"[pricing-chat/resume] run={request.run_id} session={request.session_id} "
            f"confirmed={request.confirmed} proposal_id={request.proposal_id!r} "
            f"user_id={request.user_id!r} org={request.organization_id!r} role={request.role!r}"
        )

        # Rebuild the agent identically to the original /ask call so agno can
        # locate the stored run in its agent_sessions collection.
        agent = get_pricing_agent(
            session_id=request.session_id,
            proposal_context=request.proposal_context,
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
