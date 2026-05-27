"""
LLM-powered chat-title generation for Q conversations.

Pattern mirrors Kroolo's /api/ai-chat/generate-title — given the user's
first message, produce a short scannable title for the sidebar.

Differences from Kroolo:
  - Uses LangChain ChatOpenAI via our shared `get_chat_llm` (Claude Sonnet
    by default through CLAUDE_API_KEY) instead of Portkey saved prompts.
  - Inline prompt template (no external prompt registry) so it's grep-able.
  - Domain-tuned for federal-contractor pricing language (PtW, FBLR, GSA,
    G&A, OH, SCA) so titles read naturally to the user.

The fallback (LLM unavailable / empty response) returns the truncated
user message, so the caller always gets something usable.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from app.settings import settings
from client.llm_client import get_chat_llm

logger = logging.getLogger(__name__)


# Keep the prompt small and surgical — title gen runs on every new chat,
# so token cost matters. Few-shot examples teach domain abbreviations and
# the "be specific, not generic" rule without a long rule list.
_SYSTEM_PROMPT = """\
You generate short, scannable chat titles for Q — an AI assistant that helps \
federal-contractor pricing analysts. Topics include indirect rates (fringe, \
OH, G&A, fee), FBLR, escalation, subcontractor markup, GSA discounts, BLS \
wages, Price-to-Win (PtW), and proposal structure.

Rules:
- 3 to 6 words. Title Case.
- No quotation marks, no period at the end, no emojis.
- Be specific over generic. Capture the topic, not the verb.
- Use natural abbreviations: PtW, FBLR, GSA, BLS, G&A, OH, SCA, FTE.
- If the message is a bare greeting ("hi", "hello", "test"), reply with \
exactly: New Chat

Examples:
User: What's the grand total for year 3?
Title: Year 3 Grand Total

User: How can I close the $1.4M PtW gap without dropping fees below 6%?
Title: Closing PtW Gap Above 6% Fee

User: Show me sub costs vs prime labor by year
Title: Sub vs Prime Cost By Year

User: Drop fringe to 22%
Title: Drop Fringe to 22%

User: hello
Title: New Chat
"""


def generate_title(user_message: str, *, max_words: int = 6) -> str:
    """
    Produce a short title for a chat given its first user message.

    Synchronous (LangChain call). Safe to call from a background task or
    a request handler. Returns a fallback (truncated first message) if the
    LLM is unreachable or returns nothing usable — the caller should
    always receive a non-empty string.
    """
    cleaned = (user_message or "").strip()
    if not cleaned:
        return "New chat"

    # Very-short messages get the lazy fallback without an LLM round-trip
    if len(cleaned) <= 4:
        return "New Chat"

    try:
        # OpenRouter + Liquid LFM-2 24B (2B active, MoE) — Boston-based
        # Liquid AI's small-output specialist. Very cheap, very fast, ideal
        # for short text gen like titles. Reuses the OpenRouter key the
        # pricing agent already needs — no new dependency.
        llm = get_chat_llm(
            model="liquid/lfm-2-24b-a2b",
            api_key=settings.OPENROUTER_API_KEY,
            base_url="https://openrouter.ai/api/v1",
            max_tokens=64,
        )
        response = llm.invoke(
            [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": cleaned[:2000]},
            ]
        )
        raw = _extract_text(response)
        cleaned_title = _sanitize(raw, max_words=max_words)
        if cleaned_title:
            return cleaned_title
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"[title-gen] LLM call failed; falling back: {exc}")

    return _fallback_from_message(cleaned)


# ─── Helpers ─────────────────────────────────────────────────────

def _extract_text(response: object) -> str:
    """LangChain returns an AIMessage; grab the string content."""
    content = getattr(response, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        # Multi-modal block list — concatenate text blocks
        parts = []
        for block in content:
            if isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(block["text"])
        return " ".join(parts)
    return str(content or "")


def _sanitize(raw: str, *, max_words: int) -> str:
    """Strip quotes, trailing punctuation, multi-line noise; cap at max_words."""
    if not raw:
        return ""
    # Take the first non-empty line — model sometimes returns explanation after
    first_line = next((ln for ln in raw.splitlines() if ln.strip()), "").strip()
    if not first_line:
        return ""

    # Strip prefix → trailing punct → wrapping quotes — but iteratively,
    # because stripping a wrapping quote often reveals a trailing period
    # that was sitting inside the quote (e.g. `"Year 3 Grand Total."`).
    # Loop until the string stops shrinking.
    prev: str = ""
    while prev != first_line:
        prev = first_line
        first_line = re.sub(r"^(title|chat title)\s*:\s*", "", first_line, flags=re.IGNORECASE)
        first_line = re.sub(r"[.,;:!?]+$", "", first_line).strip()
        first_line = re.sub(r'^["\'‘“]+|["\'’”]+$', "", first_line).strip()

    if not first_line:
        return ""

    # Word-cap defense — the prompt asks for ≤6, but be safe
    words = first_line.split()
    if len(words) > max_words:
        first_line = " ".join(words[:max_words])

    # Hard length cap (matches chat_conversations.chat_name max of 200)
    return first_line[:120]


def _fallback_from_message(message: str) -> str:
    """When the LLM is unavailable, use the first 60 chars of the user message."""
    snippet = message.strip().split("\n", 1)[0][:60].strip()
    if not snippet:
        return "New chat"
    # Trim a hanging word
    if len(snippet) == 60 and " " in snippet:
        snippet = snippet.rsplit(" ", 1)[0]
    return snippet


def is_generation_worthwhile(message: Optional[str]) -> bool:
    """
    Lightweight check the caller can use to skip the LLM round-trip for
    obvious no-ops (empty messages, tiny greetings). Centralized so
    callers stay consistent.
    """
    if not message:
        return False
    s = message.strip()
    if len(s) < 6:
        return False
    if s.lower() in {"hi", "hey", "hello", "yo", "sup", "test", "ping"}:
        return False
    return True
