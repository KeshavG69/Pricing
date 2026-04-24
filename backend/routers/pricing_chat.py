"""
Pricing chat router — streams answers from the Pricing Agent via SSE.

The frontend passes its fully-computed proposal state as `proposal_context`;
the agent reads figures directly from it (readable-state pattern). No
compute tools in v1.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import logging

from agent.pricing_agent import get_pricing_agent
from utils.agent_streaming import stream_agent_response
from utils.streaming import create_sse_event_stream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pricing-chat", tags=["pricing-chat"])


class PricingChatQuery(BaseModel):
    """Request body for the pricing chat endpoint."""

    query: str
    proposal_context: str  # Serialized computed state from the frontend
    session_id: str
    organization_id: (
        str  # Org scope for future tool calls (Mongo query, cross-proposal, billing)
    )


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

        agent = get_pricing_agent(session_id=request.session_id)

        # Wrap the user query with the CURRENT proposal state on every turn.
        # The agent is a singleton — baking state into instructions would
        # freeze the first caller's state for everyone else. Passing the
        # state inline per-turn guarantees each message sees the live UI.
        full_query = (
            f"<proposal_state>\n{request.proposal_context.strip()}\n</proposal_state>\n\n"
            f"{request.query.strip()}"
        )

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
            events = stream_agent_response(full_query, agent)
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
