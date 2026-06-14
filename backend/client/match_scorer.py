"""
RFP Radar — Match scorer.

Given a SAM.gov opportunity + an organization's capability profile, returns a
match score 0-100 with reasons. Drives the ranking on the RFP Radar dashboard.

Pure function. No I/O, no LLM. Heuristics with the rubric we agreed on:

    +15  NAICS match (baseline — we filter by it, so this confirms)
    +30  Sub-agency match (their warm customer — biggest signal)
    +20  Set-aside they qualify for (filter, not main signal)
    +25  Scope keyword match in title or description
    +10  Top-customer bonus (most-frequent past sub-agency)
    -20  Out-of-scope keywords (excluded list)

Score is capped at 100. Reasons array describes which signals fired.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

from client.capability_profile_builder import CapabilityProfile
from client.samgov_client import Opportunity

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tunable weights
# ---------------------------------------------------------------------------

W_NAICS_MATCH = 15
W_SUB_AGENCY_MATCH = 30
W_SET_ASIDE_MATCH = 20
W_KEYWORD_MAX = 25
W_KEYWORD_PER_HIT = 8       # capped at W_KEYWORD_MAX
W_TOP_CUSTOMER = 10
W_EXCLUDED_KEYWORD = -20


# Generic federal-contract boilerplate. When tokenizing scope_keywords for
# matching we drop these — they'd match everything ("system", "engineering")
# and add no signal.
GENERIC_TOKEN_STOPLIST = {
    # Verbs / qualifiers
    "support", "services", "service", "technical", "professional", "general",
    "comprehensive", "advanced", "modern", "modernization", "integrated",
    "solution", "solutions", "program", "project", "management", "operations",
    # Nouns too broad to be distinctive on their own
    "system", "systems", "engineering", "analysis", "development", "design",
    "production", "operations", "operation", "training", "maintenance",
    "software", "hardware", "infrastructure", "platform",
    # Connectives
    "and", "or", "the", "of", "for", "with", "to", "in", "on", "by", "from",
    "a", "an",
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class MatchScore:
    """Output of score_opportunity()."""

    score: int                              # 0-100
    reasons: list[str] = field(default_factory=list)
    signal_breakdown: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "reasons": self.reasons,
            "signal_breakdown": self.signal_breakdown,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_AGENCY_PREFIX_RE = re.compile(
    r"\b(department\s+of\s+(the\s+)?|dept\s+of\s+(the\s+)?|dept\.?\s+of\s+(the\s+)?)",
    re.IGNORECASE,
)
_AGENCY_NONWORD_RE = re.compile(r"[^a-z0-9]+")


def normalize_agency_name(name: Optional[str]) -> str:
    """
    Reduce an agency name to a canonical key for matching.

    Handles the USASpending vs SAM.gov format mismatch:
        "Department of the Navy"  →  "navy"
        "DEPT OF THE NAVY"         →  "navy"
        "Dept. of Defense"         →  "defense"
    """
    if not name:
        return ""
    s = name.lower().strip()
    s = _AGENCY_PREFIX_RE.sub("", s)
    s = _AGENCY_NONWORD_RE.sub(" ", s).strip()
    return s


def _distinctive_tokens(keyword: str) -> list[str]:
    """
    Break a profile keyword like "SATCOM system engineering" into its
    distinctive tokens — drop generic words. Used so we don't match every
    contract that mentions "system" or "engineering".
    """
    if not keyword:
        return []
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9]*", keyword.lower())
    return [t for t in tokens if t not in GENERIC_TOKEN_STOPLIST and len(t) >= 3]


def _text_for_matching(title: str, description: str = "") -> str:
    """Combine title + description into a single lowercased blob for searching."""
    return f"{title or ''} {description or ''}".lower()


# ---------------------------------------------------------------------------
# Scorer
# ---------------------------------------------------------------------------


def score_opportunity(
    opp: Opportunity,
    profile: CapabilityProfile,
    opp_description: str = "",
    excluded_keywords: Optional[list[str]] = None,
) -> MatchScore:
    """
    Score how well an opportunity matches the org's profile.

    Args:
        opp: SAM.gov opportunity (from search or bulk CSV)
        profile: the org's auto-built capability profile
        opp_description: full opp description from the CSV (free text);
                         used for keyword matching alongside the title.
                         Defaults to "" — caller from the bulk CSV path
                         should pass it.
        excluded_keywords: out-of-scope keywords the user added; opportunities
                           whose title/description contain any of these are
                           penalized.

    Returns:
        MatchScore with score (0-100), reasons[], and signal_breakdown dict.
    """
    breakdown: dict[str, int] = {}
    reasons: list[str] = []
    s = 0

    # ── 1. NAICS baseline (+15) ───────────────────────────────────────
    profile_naics = {n.code for n in profile.naics_codes}
    if opp.naics_codes and any(c in profile_naics for c in opp.naics_codes):
        s += W_NAICS_MATCH
        breakdown["naics_match"] = W_NAICS_MATCH
        reasons.append("NAICS in profile")

    # ── 2. Sub-agency match (+30) with normalization ──────────────────
    opp_sub_key = normalize_agency_name(opp.awarding_sub_agency)
    if opp_sub_key:
        profile_sub_keys = {
            normalize_agency_name(sub.name): sub
            for sub in profile.sub_agencies_of_interest
        }
        if opp_sub_key in profile_sub_keys:
            matched = profile_sub_keys[opp_sub_key]
            s += W_SUB_AGENCY_MATCH
            breakdown["sub_agency_match"] = W_SUB_AGENCY_MATCH
            reasons.append(f"sub-agency: {matched.name} ({matched.wins} past wins)")

            # ── Top-customer bonus (+10) ──────────────────────────
            # First entry is the most-frequent past customer.
            if profile.sub_agencies_of_interest and matched.name == profile.sub_agencies_of_interest[0].name:
                s += W_TOP_CUSTOMER
                breakdown["top_customer"] = W_TOP_CUSTOMER
                reasons.append("top-customer")

    # ── 3. Set-aside match (+20) ──────────────────────────────────────
    set_aside_code = (opp.set_aside_code or "").upper().strip()
    if set_aside_code and set_aside_code not in ("NONE", ""):
        # Profile stores set-asides as SAM.gov codes (SBA, WOSB, EDWOSB, ...)
        # mapped from USASpending business_categories in the builder.
        # Also include common label aliases for safety.
        SA_NORMALIZE = {
            "SMALL BUSINESS": "SBA",
            "WOMAN OWNED SMALL BUSINESS": "WOSB",
            "WOMEN OWNED SMALL BUSINESS": "WOSB",
            "ECONOMICALLY DISADVANTAGED WOSB": "EDWOSB",
            "SMALL DISADVANTAGED BUSINESS": "SDB",
        }
        qualified_codes = set()
        for sa in profile.set_asides_qualified:
            code = sa.strip().upper()
            qualified_codes.add(SA_NORMALIZE.get(code, code))

        if set_aside_code in qualified_codes:
            s += W_SET_ASIDE_MATCH
            breakdown["set_aside_match"] = W_SET_ASIDE_MATCH
            reasons.append(f"set-aside: {set_aside_code}")

    # ── 4. Scope keyword match (+25 max, token-based) ─────────────────
    hay = _text_for_matching(opp.title, opp_description)
    matched_keywords: list[str] = []
    if hay:
        for kw in profile.scope_keywords:
            for token in _distinctive_tokens(kw):
                # Word-boundary match so "satcom" doesn't trigger on "satcomms"
                if re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", hay):
                    matched_keywords.append(token)
                    break  # one hit per profile keyword is enough
        if matched_keywords:
            bonus = min(W_KEYWORD_MAX, len(matched_keywords) * W_KEYWORD_PER_HIT)
            s += bonus
            breakdown["keyword_match"] = bonus
            reasons.append(f"keywords: {', '.join(matched_keywords[:4])}")

    # ── 5. Excluded keywords (-20 per first hit) ──────────────────────
    if excluded_keywords and hay:
        excluded_hits = []
        for kw in excluded_keywords:
            for token in _distinctive_tokens(kw):
                if re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", hay):
                    excluded_hits.append(token)
                    break
        if excluded_hits:
            s += W_EXCLUDED_KEYWORD
            breakdown["excluded_keyword"] = W_EXCLUDED_KEYWORD
            reasons.append(f"excluded: {', '.join(excluded_hits[:3])}")

    # Clamp 0..100
    s = max(0, min(100, s))
    return MatchScore(score=s, reasons=reasons, signal_breakdown=breakdown)
