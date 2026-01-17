"""
Help Center router for Q&A with streaming support.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import logging

from agent.help_center_agent import get_help_center_agent
from utils.agent_streaming import stream_agent_response
from utils.streaming import create_sse_event_stream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/help", tags=["help-center"])


class HelpCenterQuery(BaseModel):
    """Request model for help center queries."""
    query: str
    session_id: str


@router.post("/ask")
async def ask_help_center(request: HelpCenterQuery):
    """
    Ask a question to the help center agent with streaming response.

    This endpoint uses Server-Sent Events (SSE) to stream the agent's response in real-time.

    Request body:
        {
            "query": "How do I create a proposal?",
            "session_id": "session_123"
        }

    Response: SSE stream with events:
        - run.started: Agent execution started
        - message.delta: Incremental response chunks
        - tool.started: When agent uses a tool
        - tool.completed: When tool execution finishes
        - message.completed: Final complete response
        - run.completed: Agent execution finished
        - usage: Token usage metrics
        - error: If an error occurs

    Example:
        ```javascript
        const eventSource = new EventSource('/api/help/ask');
        eventSource.addEventListener('message.delta', (e) => {
            const data = JSON.parse(e.data);
            console.log(data.content);  // Incremental text
        });
        ```
    """
    try:
        # Validate query
        if not request.query or request.query.strip() == "":
            raise HTTPException(
                status_code=400,
                detail="Query is required and cannot be empty"
            )

        # Get cached help center agent (singleton)
        agent = get_help_center_agent(session_id=request.session_id)

        # Set up SSE headers
        headers = {
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Vary": "Accept",
        }

        # Stream agent response as SSE
        async def sse_stream():
            events = stream_agent_response(request.query, agent)
            async for chunk in create_sse_event_stream(events):
                yield chunk

        return StreamingResponse(
            sse_stream(),
            media_type="text/event-stream",
            headers=headers
        )

    except Exception as e:
        logger.error(f"Error in help center endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


