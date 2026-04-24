"""
Pricing Agent: answers questions about the proposal the user is currently editing.

Readable-state pattern — the frontend sends the fully-computed proposal state
inline with each user message (wrapped in <proposal_state>…</proposal_state>).
The agent reads dollar amounts, FBLR values, hours, and breakdowns directly
from that block. No compute tools in v1.
"""

import threading
import logging
from typing import Optional

from agno.agent import Agent
from app.settings import settings
from client.llm_client import get_chat_llm_agno
from client.agent_memory import get_agent_db, get_memory_manager
from utils.agno_tools import create_reasoning_tool

logger = logging.getLogger(__name__)

# Global singleton
_pricing_agent: Optional[Agent] = None
_agent_lock = threading.Lock()


def get_pricing_agent(session_id: str, proposal_context: str) -> Agent:
    """
    Get cached pricing agent singleton with session-specific binding.

    Session ID is bound dynamically for conversation history / user memories.

    Args:
        session_id: Session ID for this request
        proposal_context: The fully-computed proposal state

    Returns:
        Cached Agent instance with updated session_id
    """
    global _pricing_agent

    if _pricing_agent is None:
        with _agent_lock:
            if _pricing_agent is None:
                _pricing_agent = _create_pricing_agent(session_id, proposal_context)
                logger.info("Initialized global pricing agent singleton")

    _pricing_agent.session_id = session_id
    return _pricing_agent


def _create_pricing_agent(session_id:str,proposal_context:str) -> Agent:
    """Create the pricing agent (internal — called once)."""
    llm = get_chat_llm_agno(
        model="anthropic/claude-sonnet-4.6",
        api_key=settings.OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )

    db_instance = get_agent_db()
    memory_manager = get_memory_manager()

    # Reasoning tool — lets the agent think/analyze before answering.
    # Useful for "how is X calculated?" / "why does this number differ?" style
    # questions where the model benefits from a scratchpad before responding.
    reasoning = create_reasoning_tool(
        instructions=(
            "Think step-by-step before answering pricing questions. "
            "Use the proposal_state block to ground every figure. "
            "Do not fabricate numbers — only pull from the state."
        ),
        think=True,
        analyze=True,
    )

    instructions = [
        # ── Role + state-block contract ───────────────────────────────
        """You are the PriceIQ Pricing Assistant. You help government-contractor \
pricing teams understand and analyze the proposal they are currently editing.

Each user message arrives with the user's CURRENT proposal state inlined \
inside a <proposal_state>…</proposal_state> block. This block contains the \
fully-computed figures the user is looking at right now in the UI: grand \
total, per-year breakdowns, per-position FBLR and costs, subcontractor costs, \
travel, ODCs, surge, and pre-computed slices (by location type, wage source, \
work type, subcontractor, year).

ALWAYS read your answers directly from this block. Do not recompute, estimate, \
or guess. Quote numbers verbatim.""",

        # ── Hard answering rules ──────────────────────────────────────
        """<rules>
1. FBLR is ALWAYS fee-inclusive: `dl + fringe + oh + ga + fee`. When the user \
asks for an FBLR, return the fee-inclusive number. Never return a pre-fee \
subtotal and call it "FBLR".

2. For counts + dollar totals grouped by category (e.g., "how many off-site \
people and their total cost"), read the pre-computed slice from \
`breakdowns.by_location_type` / `by_wage_source` / `by_work_type` / \
`by_subcontractor` / `by_year`. Do not filter and sum positions manually — \
you will make arithmetic errors.

3. NEVER add, subtract, multiply, or divide dollar amounts yourself. Quote \
values from the state block only. If a number the user asks for isn't present, \
say so directly and suggest a more specific question.

4. Subcontractor-assigned positions are counted under the subcontractor, not \
under prime. The state block handles this correctly; do not double-count.

5. If the user asks a what-if / scenario question ("what if fringe was 30%", \
"what if we removed position X"), tell them: "What-if scenarios aren't \
available yet — coming in a future version." Do NOT attempt to estimate.

6. Format dollar amounts with commas and two decimals: $1,234,567.89.
   Format rates as percentages: 7.11%.
   Format hours as integers with commas: 1,920 hours.

7. Be concise. Direct answers, no filler. If a one-line answer suffices, give \
a one-line answer.

8. If the user asks "how is X calculated?" or "why is this number what it \
is?", explain conceptually using the inputs visible in the state block (e.g., \
"FBLR for this position = DL × (1 + fringe + OH + G&A + fee) cascade, applied \
per year with escalation"). Do not produce hand-computed replacement numbers.

9. Reasoning tool (`think` / `analyze`) usage — use it DELIBERATELY, not by \
reflex:
   • SKIP reasoning for simple reads ("what's the grand total?", "how many \
positions?", "show me year 3 fee"). The answer is already in the state block \
— just quote it.
   • USE `think` to plan the answer when the user asks for a multi-step \
explanation, a comparison across positions/years, an interpretation of why \
two numbers differ, or anything that needs you to combine multiple slices of \
the state block. Think first, then answer.
   • USE `analyze` after `think` to sanity-check your reasoning against the \
state block before writing the final response — particularly to confirm you \
didn't invent numbers, didn't confuse prime vs sub, and didn't double-count \
OT with fee.
   • Reasoning is a scratchpad — it should reference the proposal_state block, \
not duplicate it. Keep each thought short and specific (which breakdown slice \
you're pulling from, what subset of positions, which year, which rate).
   • Never use reasoning to ESTIMATE missing data. If a number isn't in the \
state, say so; don't reason your way to an approximation.
</rules>"""
+
f"""

<Proposal Context>
{proposal_context.strip()}
</Proposal Context>


""",
    ]

    agent = Agent(
        name="Pricing Assistant",
        session_id=session_id,
        model=llm,
        db=db_instance,
        memory_manager=memory_manager,
        tools=[reasoning],
        add_history_to_context=True,
        num_history_runs=4,
        enable_agentic_memory=True,
        enable_user_memories=True,
        add_datetime_to_context=True,
        markdown=True,
        id="PricingAgent",
        description="PriceIQ Pricing Assistant — answers questions about the user's current proposal by reading the inlined computed state.",
        instructions=instructions,
        debug_mode=settings.DEBUG_MODE,
    )

    logger.info("Created pricing agent (singleton)")
    return agent


def clear_cache():
    """Clear the cached pricing agent (for testing / maintenance)."""
    global _pricing_agent
    with _agent_lock:
        _pricing_agent = None
        logger.info("Cleared pricing agent cache")
