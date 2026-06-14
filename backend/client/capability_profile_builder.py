"""
RFP Radar — Capability profile builder.

Given a company name (and optionally a specific UEI for disambiguation), builds
a complete capability profile by analyzing the company's past federal awards on
USASpending.gov:

  - Top NAICS codes (ranked by win count + total $ volume)
  - Sub-agencies they've worked with most (their warm customers)
  - Set-asides they qualify for (from business_categories on most recent award)
  - Scope keywords (LLM-extracted from award descriptions)
  - PoP states they tend to deliver in
  - HQ location and full company name

This is the "magic moment" of RFP Radar — one company-name input produces a
fully-populated profile in ~3-5 seconds. Output drives the SAM.gov scanner's
match scoring.

Stateless. Pure async function. Reuses USASpendingClient for award fetches and
the existing LLM client for the keyword extraction call.
"""

import asyncio
import json
import logging
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from app.settings import settings
from client.llm_client import get_chat_llm
from client.usaspending_client import (
    Award,
    USASpendingError,
    get_usaspending_client,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_YEARS_BACK = 5
DEFAULT_MAX_NAICS = 5
DEFAULT_MAX_SUB_AGENCIES = 5
DEFAULT_TOP_KEYWORDS = 5

# Mapping from USASpending's free-text business_categories to SAM.gov set-aside
# codes used in the opportunities search. Categories not in this map (e.g.
# "Corporate Entity Not Tax Exempt", "Subchapter S Corporation") are
# administrative tags, not set-aside qualifications, so we drop them.
BUSINESS_CATEGORY_TO_SET_ASIDE: dict[str, str] = {
    # Small business basics
    "Small Business": "Small Business",
    # Disadvantaged
    "Self-Certified Small Disadvantaged Business": "SDB",
    "Small Disadvantaged Business": "SDB",
    # Women-owned
    "Woman Owned Business": "WOSB",
    "Women Owned Small Business": "WOSB",
    "Economically Disadvantaged Women Owned Small Business": "EDWOSB",
    # Veteran-owned
    "Veteran Owned Business": "VOSB",
    "Veteran Owned Small Business": "VOSB",
    "Service Disabled Veteran Owned Business": "SDVOSB",
    "Service Disabled Veteran Owned Small Business": "SDVOSB",
    # 8(a) / HUBZone
    "8(a) Program Participant": "8A",
    "HUBZone Program": "HUBZone",
    "HUBZone Small Business": "HUBZone",
    # Native / tribal
    "Indian Tribe Federally Recognized": "IEE",
    "Alaskan Native Corporation Owned Firm": "ANC",
    "Native Hawaiian Organization Owned Firm": "NHO",
    "Tribally Owned Firm": "ITT",
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class NAICSContribution:
    """A NAICS code in the profile, with weight context."""

    code: str
    description: str
    wins: int
    total_amount: float

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "description": self.description,
            "wins": self.wins,
            "total_amount": round(self.total_amount, 2),
        }


@dataclass
class SubAgencyContribution:
    """A sub-agency the company has worked with."""

    name: str
    wins: int
    total_amount: float

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "wins": self.wins,
            "total_amount": round(self.total_amount, 2),
        }


@dataclass
class CapabilityProfile:
    """The auto-built profile that drives SAM.gov match scoring."""

    uei: str
    company_name: str
    hq_location: Optional[str]

    naics_codes: list[NAICSContribution]
    sub_agencies_of_interest: list[SubAgencyContribution]
    set_asides_qualified: list[str]
    scope_keywords: list[str]
    pop_states_primary: list[str]

    # Audit / context
    past_awards_count: int
    past_awards_total: float
    most_recent_award_date: Optional[str]
    built_at: str  # ISO timestamp
    source: str = "USASpending /search + /awards/{id}/"

    def to_dict(self) -> dict:
        return {
            "uei": self.uei,
            "company_name": self.company_name,
            "hq_location": self.hq_location,
            "naics_codes": [n.to_dict() for n in self.naics_codes],
            "sub_agencies_of_interest": [s.to_dict() for s in self.sub_agencies_of_interest],
            "set_asides_qualified": self.set_asides_qualified,
            "scope_keywords": self.scope_keywords,
            "pop_states_primary": self.pop_states_primary,
            "past_awards_count": self.past_awards_count,
            "past_awards_total": round(self.past_awards_total, 2),
            "most_recent_award_date": self.most_recent_award_date,
            "built_at": self.built_at,
            "source": self.source,
        }


# ---------------------------------------------------------------------------
# Aggregation helpers
# ---------------------------------------------------------------------------


def _rank_naics(awards: list[Award], top_n: int) -> list[NAICSContribution]:
    """Top NAICS codes ranked by win count, then total dollars."""
    by_code_count: Counter[str] = Counter()
    by_code_total: defaultdict[str, float] = defaultdict(float)
    by_code_desc: dict[str, str] = {}
    for a in awards:
        if not a.naics_code:
            continue
        by_code_count[a.naics_code] += 1
        by_code_total[a.naics_code] += a.amount or 0
        if a.naics_description and a.naics_code not in by_code_desc:
            by_code_desc[a.naics_code] = a.naics_description
    ranked = sorted(
        by_code_count.keys(),
        key=lambda c: (by_code_count[c], by_code_total[c]),
        reverse=True,
    )
    return [
        NAICSContribution(
            code=c,
            description=by_code_desc.get(c, ""),
            wins=by_code_count[c],
            total_amount=by_code_total[c],
        )
        for c in ranked[:top_n]
    ]


def _rank_sub_agencies(awards: list[Award], top_n: int) -> list[SubAgencyContribution]:
    """Top sub-agencies (real customers) by win count."""
    count: Counter[str] = Counter()
    total: defaultdict[str, float] = defaultdict(float)
    for a in awards:
        if not a.awarding_sub_agency:
            continue
        count[a.awarding_sub_agency] += 1
        total[a.awarding_sub_agency] += a.amount or 0
    ranked = sorted(count.keys(), key=lambda s: (count[s], total[s]), reverse=True)
    return [
        SubAgencyContribution(name=s, wins=count[s], total_amount=total[s])
        for s in ranked[:top_n]
    ]


def _top_pop_states(awards: list[Award], top_n: int = 3) -> list[str]:
    """Where they tend to deliver work."""
    c: Counter[str] = Counter(a.pop_state for a in awards if a.pop_state)
    return [s for s, _ in c.most_common(top_n)]


def _map_business_categories_to_set_asides(categories: list[str]) -> list[str]:
    """Translate USASpending's free-text categories to SAM.gov set-aside codes."""
    out: list[str] = []
    seen: set[str] = set()
    for cat in categories:
        sa = BUSINESS_CATEGORY_TO_SET_ASIDE.get(cat)
        if sa and sa not in seen:
            out.append(sa)
            seen.add(sa)
    return out


def _pick_most_recent_award(awards: list[Award]) -> Optional[Award]:
    """Latest by start_date — used to pull current business_categories."""
    dated = [a for a in awards if a.start_date]
    if not dated:
        return None
    return max(dated, key=lambda a: a.start_date or "")


# ---------------------------------------------------------------------------
# Scope keyword extraction (LLM)
# ---------------------------------------------------------------------------


async def _extract_scope_keywords(
    awards: list[Award], top_k: int = DEFAULT_TOP_KEYWORDS
) -> list[str]:
    """
    Pull top-K distinctive scope keywords from award descriptions via a single
    LLM call. Naive regex catches federal-contract boilerplate ("SUPPORT",
    "ORDER", "OPTION") so we lean on an LLM with a focused prompt.

    If the LLM call fails, fall back to a stopword-filtered acronym scan so
    profile building never breaks because of an LLM outage.
    """
    descriptions = [a.description for a in awards if a.description]
    if not descriptions:
        return []

    # Take up to ~40 descriptions to keep the prompt cheap.
    sample = descriptions[: min(40, len(descriptions))]
    blob = "\n".join(f"- {d[:300]}" for d in sample)

    prompt = (
        "You are analyzing a government contractor's past awards. Extract "
        f"the {top_k} most distinctive technical / program / scope keywords "
        "that characterize what this company actually does.\n\n"
        "RULES:\n"
        "- Prefer acronyms (SATCOM, C5ISR), program names, and distinctive "
        "technical terms.\n"
        "- AVOID generic federal-contract boilerplate: support, services, "
        "task order, option, period, base, labor, material, travel, CLIN, "
        "TBD, IGF, OMN.\n"
        "- AVOID single common English words: software, program, system "
        "(too generic). Pair with a qualifier (e.g. \"satellite software\", "
        "\"tactical system\") if you must use them.\n"
        f"- Output exactly {top_k} terms, each 1-4 words.\n"
        "- Output ONLY a JSON array of strings, no markdown.\n\n"
        f"AWARD DESCRIPTIONS:\n{blob}\n"
    )

    try:
        # Use OpenRouter (same provider the intelligent_parser uses) so this
        # works against the keys the project actually has provisioned.
        llm = get_chat_llm(
            model="anthropic/claude-haiku-4.5",
            api_key=settings.OPENROUTER_API_KEY,
            base_url="https://openrouter.ai/api/v1",

        )
        msg = await llm.ainvoke(prompt)
        text = (msg.content or "").strip()
        # Strip markdown fences if the model added them
        if "```" in text:
            text = re.sub(r"```(?:json)?", "", text).strip("` \n")
        parsed = json.loads(text)
        if isinstance(parsed, list):
            cleaned = [str(k).strip() for k in parsed if str(k).strip()]
            return cleaned[:top_k]
    except Exception as e:
        logger.warning(
            f"Scope keyword LLM call failed ({e}); using regex fallback."
        )

    # Fallback: stopword-filtered acronym scan. Broader stoplist than first
    # try; LLM is the preferred path because regex inherently picks boilerplate.
    BOILERPLATE = {
        "THE", "FOR", "AND", "BUT", "NOT", "SUB", "ALL", "TBD", "PER",
        "ARE", "PRO", "MAY", "OUT", "ETC", "SEE", "USE", "VIA", "IGF",
        "BASE", "LABOR", "SEC", "PROVIDES", "OMN", "SUPPORT", "ORDER",
        "PERIOD", "OPTION", "MATERIAL", "TRAVEL", "CLIN", "COST", "WORK",
        "SECTION", "SERVICES", "TASK", "THIS", "WITH", "EFFORT", "PROVIDE",
        "SOFTWARE", "PROGRAM", "ORDERING", "CONTRACT", "SYSTEM", "PROJECT",
        "MANAGEMENT", "TECHNICAL", "REQUIREMENTS", "AND/OR", "DEVELOPMENT",
        "FOLLOWING", "SHALL", "PROVIDE", "INCLUDING", "INFORMATION", "DATA",
        "FOR", "WILL", "SOLUTION", "SOLUTIONS", "ANALYSIS",
    }
    text = " ".join(descriptions)
    acronyms = Counter(re.findall(r"\b[A-Z]{3,8}\b", text))
    out: list[str] = []
    for k, _ in acronyms.most_common(50):
        if k not in BOILERPLATE:
            out.append(k)
        if len(out) == top_k:
            break
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def build_profile(
    company_search: str,
    uei_filter: Optional[str] = None,
    years_back: int = DEFAULT_YEARS_BACK,
    max_naics: int = DEFAULT_MAX_NAICS,
    max_sub_agencies: int = DEFAULT_MAX_SUB_AGENCIES,
    extract_keywords_with_llm: bool = True,
) -> CapabilityProfile:
    """
    Build a CapabilityProfile by analyzing the company's federal award history.

    Args:
        company_search: company name or partial name to find in USASpending.
                        Used as the free-text recipient_search_text.
        uei_filter: when the company search is ambiguous, restrict to this
                    exact UEI. Strongly recommended — caller should resolve
                    the UEI via a name lookup first.
        years_back: how many years of history to analyze (default 5).
        max_naics: top N NAICS codes to include in the profile.
        max_sub_agencies: top N sub-agencies to include.
        extract_keywords_with_llm: turn off in unit tests or no-LLM dev.

    Returns:
        CapabilityProfile populated from past wins.

    Raises:
        USASpendingError: if USASpending search fails or returns no awards
                         for the (company_search, uei_filter) combination.
    """
    client = get_usaspending_client()

    # 1. Fetch all past awards for this company
    awards = await client.search_awards_by_recipient(
        company_search=company_search,
        uei_filter=uei_filter,
        years_back=years_back,
    )
    if not awards:
        raise USASpendingError(
            f"No federal awards found for '{company_search}'"
            + (f" (UEI {uei_filter})" if uei_filter else "")
            + f" in the last {years_back} years.",
            status_code=404,
        )

    # Lock in the canonical UEI / name from the actual data (handles
    # spelling/case variance in the user's input).
    canonical_uei = uei_filter or _dominant_uei(awards)
    if canonical_uei is None:
        raise USASpendingError(
            "Found awards but could not determine a single canonical UEI. "
            "Provide a uei_filter to disambiguate.",
            status_code=400,
        )
    # Filter strictly to the canonical UEI from this point on.
    awards = [a for a in awards if a.recipient_uei == canonical_uei]
    canonical_name = awards[0].recipient_name if awards else company_search

    # 2. Most recent award — provides business_categories AND hq_location
    most_recent = _pick_most_recent_award(awards)
    business_categories: list[str] = []
    hq_location: Optional[str] = None
    if most_recent and most_recent.internal_id:
        try:
            detail = await client.get_award_detail(most_recent.internal_id)
            rec = (detail or {}).get("recipient") or {}
            business_categories = rec.get("business_categories") or []
            loc = rec.get("location") or {}
            city = loc.get("city_name")
            state = loc.get("state_code")
            if city and state:
                hq_location = f"{city.title()}, {state}"
            elif state:
                hq_location = state
        except USASpendingError as e:
            logger.warning(
                f"Could not fetch award detail for {most_recent.internal_id}: "
                f"{e}. Proceeding without business_categories."
            )

    # 3. Aggregate
    naics = _rank_naics(awards, max_naics)
    sub_agencies = _rank_sub_agencies(awards, max_sub_agencies)
    set_asides = _map_business_categories_to_set_asides(business_categories)
    pop_states = _top_pop_states(awards, top_n=3)

    # 4. Scope keywords (LLM)
    if extract_keywords_with_llm:
        keywords = await _extract_scope_keywords(awards)
    else:
        keywords = []

    return CapabilityProfile(
        uei=canonical_uei,
        company_name=canonical_name,
        hq_location=hq_location,
        naics_codes=naics,
        sub_agencies_of_interest=sub_agencies,
        set_asides_qualified=set_asides,
        scope_keywords=keywords,
        pop_states_primary=pop_states,
        past_awards_count=len(awards),
        past_awards_total=sum(a.amount or 0 for a in awards),
        most_recent_award_date=most_recent.start_date if most_recent else None,
        built_at=datetime.now(timezone.utc).isoformat(),
    )


def _dominant_uei(awards: list[Award]) -> Optional[str]:
    """Pick the UEI with the most awards (handles company-name fuzz hits)."""
    c: Counter[str] = Counter(a.recipient_uei for a in awards if a.recipient_uei)
    if not c:
        return None
    return c.most_common(1)[0][0]
