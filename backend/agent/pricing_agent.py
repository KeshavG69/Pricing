"""
Q — the PriceIQ Pricing Assistant.

Answers questions about the proposal the user is currently editing.

Pattern (mirrors Kroolo's hybrid_agent_manager): we cache the expensive
components — LLM, DB, memory manager, reasoning tool, formulas text — and
build a fresh Agent per request with proposal-state injected as part of the
agent's instructions (its "context"), not as part of the user message.

Why per-request rebuild? agno's Agent constructor is cheap once components
are cached; baking the live proposal state into instructions guarantees each
turn sees the user's CURRENT UI state without any cross-session bleed.
"""

import threading
import logging
from pathlib import Path
from typing import Any, Optional

from agno.agent import Agent
from app.settings import settings
from client.llm_client import get_chat_llm_agno
from client.agent_memory import get_agent_db, get_memory_manager
from utils.agno_tools import create_reasoning_tool
from utils.python_repl_tool import python_repl_tool

logger = logging.getLogger(__name__)

# Resolve FORMULAS.md once at module load. Repo root is two levels up from
# this file: backend/agent/pricing_agent.py → backend/ → repo root.
_FORMULAS_PATH = Path(__file__).resolve().parent.parent.parent / "FORMULAS.md"


# ─── Component cache (Kroolo pattern) ────────────────────────────────────
# All the heavy stuff is built once and reused; only the Agent shell is rebuilt
# per request so instructions can carry the live proposal state.
class _ComponentCache:
    def __init__(self):
        self._lock = threading.Lock()
        self._llm: Optional[Any] = None
        self._db: Optional[Any] = None
        self._memory_manager: Optional[Any] = None
        self._reasoning_tool: Optional[Any] = None
        self._formulas_text: Optional[str] = None

    @property
    def llm(self):
        if self._llm is None:
            with self._lock:
                if self._llm is None:
                    self._llm = get_chat_llm_agno(
                        model="anthropic/claude-sonnet-4.6",
                        api_key=settings.OPENROUTER_API_KEY,
                        base_url="https://openrouter.ai/api/v1",
                    )
        return self._llm

    @property
    def db(self):
        if self._db is None:
            with self._lock:
                if self._db is None:
                    self._db = get_agent_db()
        return self._db

    @property
    def memory_manager(self):
        if self._memory_manager is None:
            with self._lock:
                if self._memory_manager is None:
                    self._memory_manager = get_memory_manager()
        return self._memory_manager

    @property
    def reasoning_tool(self):
        if self._reasoning_tool is None:
            with self._lock:
                if self._reasoning_tool is None:
                    self._reasoning_tool = create_reasoning_tool(
                        instructions=(
                            "Think step-by-step before answering pricing "
                            "questions. Use the proposal_state block to "
                            "ground every figure. Do not fabricate numbers — "
                            "only pull from the state or derive them via "
                            "the Python REPL using formulas from FORMULAS.md."
                        ),
                        think=True,
                        analyze=True,
                    )
        return self._reasoning_tool

    @property
    def formulas_text(self) -> str:
        if self._formulas_text is None:
            with self._lock:
                if self._formulas_text is None:
                    try:
                        self._formulas_text = _FORMULAS_PATH.read_text(encoding="utf-8")
                    except Exception as e:
                        logger.warning(
                            f"Could not load FORMULAS.md from {_FORMULAS_PATH}: {e}"
                        )
                        self._formulas_text = "(FORMULAS.md unavailable)"
        return self._formulas_text


_components = _ComponentCache()


def _build_instructions(proposal_context: str, formulas_text: str) -> list[str]:
    """Build the agent's instruction blocks for a single request."""
    return [
        # ── Role + state-block contract ───────────────────────────────
        """You are Q — the PriceIQ Pricing Assistant. You are a knowledgeable \
sidekick for government-contractor pricing teams. Your job is to be USEFUL \
on whatever the user brings to you, grounded in the live proposal state.

Engage broadly. The user may ask you to:
- Read figures from the proposal (grand total, FBLR, hours, costs by year)
- Compute derived metrics (averages, comparisons, rankings, percentages)
- Run what-if scenarios (remove a position, change a rate, add hours)
- Discuss strategy and tradeoffs (prime vs. sub mix, on-site vs. off-site \
cost impact, percentile choice impact, escalation strategy, fee positioning)
- Explain how PriceIQ calculations work (cascade, escalation, GSA discount)
- Advise on the proposal's competitiveness, risk, or structure
- Discuss government-contracting conventions (DCAA, FAR, wrap rates, FBLR, \
subcontract handling, fee policy)

DO NOT refuse questions on the grounds that they are "strategy" or "outside \
pricing." If the question can be informed by the numbers in front of you or \
by general government-contractor pricing knowledge, engage with it. Be a \
helpful advisor, not a gatekeeper.

The proposal's CURRENT computed state is provided to you below in the \
<proposal_state>…</proposal_state> block. This block contains the \
fully-computed figures the user is looking at right now in the UI: grand \
total, per-year breakdowns, per-position FBLR and costs, subcontractor costs, \
travel, ODCs, surge, and pre-computed slices (by location type, wage source, \
work type, subcontractor, year).

The block ALSO includes the proposal's identity under `proposal`: \
`proposal.name` (the proposal name / title shown in the UI header) and \
`proposal.solicitation_number` (the government contract / solicitation \
number). When the user asks "what proposal am I looking at", "what's the \
contract number", or refers to the proposal by name, use these fields \
verbatim — do NOT guess from labor categories or file names.

When answering quantitative questions, ALWAYS ground them in the \
<proposal_state> block on this turn. The state is rebuilt for every message, \
so it always reflects the user's live UI. Do not fabricate or guess numbers. \
For qualitative/strategic questions, draw on the data in front of you plus \
general government-contractor pricing knowledge — and clearly distinguish \
between "the data shows X" and "in my judgment, Y".""",

        # ── Hard answering rules ──────────────────────────────────────
        """<rules>
1. FBLR is ALWAYS fee-inclusive: `dl + fringe + oh + ga + fee`. When the user \
asks for an FBLR, return the fee-inclusive number. Never return a pre-fee \
subtotal and call it "FBLR".

2. For counts + dollar totals grouped by category (e.g., "how many off-site \
people and their total cost"), read the pre-computed slice from \
`breakdowns.by_location_type` / `by_wage_source` / `by_work_type` / \
`by_subcontractor` / `by_year`. Do not filter and sum positions manually in \
your head — use the Python REPL if the grouping you need isn't pre-sliced.

3. NEVER add, subtract, multiply, or divide dollar amounts in your head. \
Either quote values verbatim from the state block OR use the Python REPL tool \
to compute them precisely using the formulas in <formulas> below. If a \
number the user asks for isn't present AND can't be derived from the state \
with a documented formula, say so directly.

4. Subcontractor-assigned positions are counted under the subcontractor, not \
under prime. The state block handles this correctly; do not double-count.

5. What-if / scenario / strategy questions: ENGAGE. Use the Python REPL \
with the formulas from <formulas> to model the cost impact, then offer \
your interpretation grounded in the result. Examples you should handle, \
not deflect:
   • "what if fringe was 30%" → recompute and report
   • "what if we move Position X to a sub" → model the markup math \
(SMH + G&A passthrough + sub fee) and show prime vs. sub total
   • "should we team with a sub for this?" → discuss the cost-side \
tradeoffs you can see from the numbers (markup cost, fee structure, \
location-type implications) and flag what's outside the data
   • "is our fee competitive?" → reference the rate, typical ranges, and \
what the data suggests
Always label hypothetical results clearly ("Hypothetical — with fringe \
at 30%: …") and keep the original figure alongside for comparison. When \
asked for a recommendation, give one — qualified by the assumptions you \
made.

6. Format dollar amounts with commas and two decimals: $1,234,567.89.
   Format rates as percentages: 7.11%.
   Format hours as integers with commas: 1,920 hours.

7. Be concise. Direct answers, no filler. If a one-line answer suffices, give \
a one-line answer. Use emojis sparingly — at most one per response, only when \
it adds genuine clarity (e.g., ⚠ for a concrete warning). No decorative emojis \
in headings, bullets, section markers, or as sentence punctuation. Default to \
zero emojis.

8. If the user asks "how is X calculated?" or "why is this number what it \
is?", explain conceptually using the formulas in <formulas> and the inputs \
visible in the state block. You may use the Python REPL to verify your \
explanation produces the observed number.

9. Tool selection:
   • SKIP all tools for simple reads ("what's the grand total?", "how many \
positions?", "show me year 3 fee", "what's the proposal name / contract \
number?"). Quote from the state block.
   • USE `think` to plan multi-step explanations or comparisons across \
positions/years, and `analyze` to sanity-check your reasoning against the \
state block before writing the final response.
   • USE `python_repl_tool` whenever you need to compute, filter, sum, \
group, rank, average, or re-cascade any pricing figure. It is your \
calculator. Parse the state JSON in code, apply the formula, print the \
result. Prefer the REPL over mental arithmetic on any number with three \
or more digits.
   • NEVER use reasoning or the REPL to ESTIMATE missing data. Only compute \
from numbers actually present in the state.
</rules>""",

        # ── Canonical formulas (loaded from FORMULAS.md) ──────────────
        f"""<formulas>
Below is the canonical PriceIQ formula reference. Every calculation in the \
app follows these formulas. When using the Python REPL, implement the \
formulas EXACTLY as written here. Do not invent alternative formulas.

The Forward Calculation section (§ 15) is the most useful for implementing \
"what-if" scenarios: it walks inputs → escalation → indirect cascade → \
billable rate → × hours → sum.

```
{formulas_text}
```
</formulas>""",

        # ── Live proposal state ───────────────────────────────────────
        f"""<proposal_state>
{proposal_context.strip()}
</proposal_state>""",
    ]


def get_pricing_agent(session_id: str, proposal_context: str) -> Agent:
    """
    Build a fresh pricing agent for this request with the live proposal
    state injected as part of its instructions.

    Heavy components (LLM, DB, memory, reasoning, formulas) are cached at
    module level. Only the Agent shell is rebuilt per request so the
    instructions block can carry the user's CURRENT proposal state.

    Args:
        session_id: Session ID for this chat (drives history / user memories)
        proposal_context: Serialized JSON of the live computed proposal state

    Returns:
        A new Agent instance ready to run for this single request
    """
    instructions = _build_instructions(proposal_context, _components.formulas_text)

    agent = Agent(
        name="Q",
        session_id=session_id,
        model=_components.llm,
        db=_components.db,
        memory_manager=_components.memory_manager,
        tools=[_components.reasoning_tool, python_repl_tool],
        add_history_to_context=True,
        num_history_runs=4,
        enable_agentic_memory=True,
        enable_user_memories=True,
        add_datetime_to_context=True,
        markdown=True,
        id="PricingAgent",
        description="Q — PriceIQ Pricing Assistant that answers questions about the user's current proposal by reading the inlined computed state and using Python REPL for derived calculations.",
        instructions=instructions,
        debug_mode=settings.DEBUG_MODE,
    )
    return agent


def clear_cache():
    """Clear the cached components (for testing / maintenance)."""
    global _components
    _components = _ComponentCache()
    logger.info("Cleared pricing agent component cache")
