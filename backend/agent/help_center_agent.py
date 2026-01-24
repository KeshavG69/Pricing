"""
Help Center Agent with Singleton Caching

Provides intelligent Q&A for PriceIQ help center documentation.
Uses RAG (Retrieval Augmented Generation) to answer user questions.
"""

import threading
import logging
from typing import Optional
from agno.agent import Agent
from app.settings import settings
from client.llm_client import get_chat_llm_agno
from client.agent_memory import get_agent_db, get_memory_manager
from utils.agno_tools import create_help_center_retriever

logger = logging.getLogger(__name__)

# Global singleton for help center agent
_help_center_agent: Optional[Agent] = None
_agent_lock = threading.Lock()


def get_help_center_agent(session_id: str) -> Agent:
    """
    Get cached help center agent singleton with session-specific binding.

    Since the help center agent has no user-specific context, we cache
    a single instance and reuse it across all requests. Session ID is
    dynamically bound for conversation tracking and memory.

    Args:
        session_id: Session ID for this request

    Returns:
        Cached Agent instance with updated session_id

    Performance:
        - First call: ~200ms (create agent + tools)
        - Subsequent calls: <1ms (singleton cache hit + session binding)
    """
    global _help_center_agent

    # Double-checked locking pattern
    if _help_center_agent is None:
        with _agent_lock:
            if _help_center_agent is None:
                _help_center_agent = _create_help_center_agent()
                logger.info("Initialized global help center agent singleton")

    # Update session_id for this request (no lock needed - just updating attribute)
    _help_center_agent.session_id = session_id

    return _help_center_agent


def _create_help_center_agent() -> Agent:
    """
    Create help center agent (internal - called once).

    This creates the agent WITHOUT a session_id. The session_id is
    bound dynamically in get_help_center_agent().

    Returns:
        Agent instance configured for help center Q&A
    """
    llm = get_chat_llm_agno(
        model="claude-haiku-4-5",
        api_key=settings.CLAUDE_API_KEY,
        base_url=settings.CLAUDE_BASE_URL,
    )

    # Create help center retriever (singleton - same for all users)
    help_retriever = create_help_center_retriever()

    # Get memory storage (singleton - shared across all sessions)
    db_instance = get_agent_db()
    memory_manager = get_memory_manager()

    instructions = [
        """You are a PriceIQ Help Center Assistant. Your role is to help users understand and use the PriceIQ platform effectively.

Your task:
1. Search the knowledge base for relevant documentation
2. Synthesize information from the retrieved articles
3. Provide a clear, step-by-step answer
4. Include specific examples when helpful
5. Cite which help articles you're referencing""",
        """<guidelines>
1. ALWAYS search the knowledge base first before answering
2. Use information ONLY from the retrieved documentation
3. If documentation doesn't cover the topic, say so clearly
4. Provide step-by-step instructions when explaining procedures
5. Use clear, simple language (avoid jargon unless necessary)
6. Format responses with markdown for readability:
   - Use bullet points for lists
   - Use numbered lists for sequential steps
   - Use **bold** for important terms
   - Use code blocks for examples
7. Cite your sources: mention article titles or categories
</guidelines>""",
        """<response_structure>
For "how-to" questions:
1. Brief overview (1 sentence)
2. Step-by-step instructions
3. Example or screenshot reference (if available)
4. Related tips or best practices
5. Source citation

For "what is" questions:
1. Clear definition
2. Key features or characteristics
3. Use cases or examples
4. Source citation

For troubleshooting questions:
1. Acknowledge the issue
2. List possible causes
3. Provide solutions (step-by-step)
4. Preventive measures
5. Source citation
</response_structure>""",
        """<important>
- If you don't find relevant information, say: "I don't have specific documentation about that. Could you rephrase your question or ask about something else?"
- If question is ambiguous, ask clarifying questions
- Never make up features or steps that aren't in the documentation
- Always be helpful and encouraging
- Use the search_knowledge_base tool to retrieve relevant articles
- You dont have to take the users request literaly understand the intent behind the request and provide the most relevant information from the knowledge base
</important>""",
    ]

    agent = Agent(
        name="Help Center Assistant",
        model=llm,
        knowledge_retriever=help_retriever,
        db=db_instance,
        memory_manager=memory_manager,
        add_history_to_context=True,
        num_history_runs=4,
        enable_agentic_memory=True,
        enable_user_memories=True,
        add_datetime_to_context=True,
        markdown=True,
        id="HelpCenterAgent",
        description="PriceIQ Help Center Assistant that answers user questions using documentation.",
        instructions=instructions,
        debug_mode=True,
    )

    logger.info("Created help center agent (singleton) with memory enabled")
    return agent


def clear_cache():
    """Clear the cached help center agent (for testing/maintenance)."""
    global _help_center_agent
    with _agent_lock:
        _help_center_agent = None
        logger.info("Cleared help center agent cache")
