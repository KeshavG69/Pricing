"""
Custom agno tools for SOC code vector search retriever and GSA labor category tools.
"""

import logging
from functools import lru_cache
from typing import Any, Optional, List, Dict
from datetime import datetime
import math
from agno.agent import Agent
from agno.tools import tool
from agno.tools.exa import ExaTools
from client.soc_vector_search import get_soc_vector_search_client
from client.oews_mongodb import get_oews_mongo_client
from client.gsa_pinecone import get_gsa_pinecone_client
from utils.company_repository import get_company_repository_crud
from client.help_center_pinecone import get_help_center_pinecone_client
from agno.tools.reasoning import ReasoningTools
from app.settings import settings

logger = logging.getLogger(__name__)
def create_custom_retreiver(description: Optional[str] = None):
    """
    Create a custom retriever for SOC code vector search.

    This retriever uses FAISS vector search with OpenAI embeddings to find
    the most similar Standard Occupational Classification (SOC) codes for
    a given job title or description.

    Args:
        description: Optional job description text to enhance semantic matching

    Returns:
        Callable retriever function that can be used with agno agents

    """
    # Get singleton FAISS vector search client (thread-safe, shared across agents)
    vector_client = get_soc_vector_search_client()

    def custom_retriever(
        query: str,
        agent: Optional[Agent] = None,
        num_documents: int = 20,
        **kwargs
    ) -> List[Dict[str, str]]:
        """
        Retrieve the most similar Standard Occupational Classification (SOC) codes for a job title.

        Uses FAISS vector search with OpenAI embeddings to perform semantic similarity matching
        between the input query and 1,105 detailed SOC occupation titles and descriptions. This
        enables accurate mapping of job titles (even non-standard ones) to official SOC codes.

        Args:
            query (str): Job title or description to search for.
                        Examples: "Software Developer", "Senior Python Engineer", "Data Scientist"
            num_documents (int): Maximum number of similar SOC codes to return. Default is 20.
                                Higher values provide more alternatives but may include less relevant matches.

        Returns:
            List[Dict[str, str]]: Ordered list of matching SOC codes (most similar first), where each dict contains:
                - soc_code (str): 6-digit SOC code (e.g., "151252" for Software Developers)
                - occupation (str): Official BLS occupation title (e.g., "Software Developers")

        Example:
            >>> retriever("Python Developer", num_documents=3)
            [
                {"soc_code": "151252", "occupation": "Software Developers"},
                {"soc_code": "151251", "occupation": "Computer Programmers"},
                {"soc_code": "151250", "occupation": "Software and Web Developers..."}
            ]
        """
        # Search using vector similarity with description for better matching
        # Handle None value from agno (use default of 20)
        k =  30
        results = vector_client.search(query, description=description, top_k=k)

        # Format results for agno agent consumption
        # Convert tuple (soc_code, occ_name, score) to dict
        formatted_results = []
        for soc_code, occupation_name, similarity_score in results:
            formatted_results.append({
                "soc_code": soc_code,
                "occupation": occupation_name,
            })

        return formatted_results

    return custom_retriever



def create_wage_tool():
    """
    Create a custom tool for retrieving wage data from BLS OEWS database.

    This tool queries MongoDB to fetch wage percentiles (10th, 25th, 50th/median, 75th, 90th)
    for a given SOC code and geographic area. Data is sourced from the Bureau of Labor Statistics
    Occupational Employment and Wage Statistics (OEWS) program.

    Returns:
        Callable tool function that can be used with agno agents to retrieve wage data

    Example:
        >>> wage_tool = create_wage_tool()
        >>> result = wage_tool("151252", "California")
        >>> result["wages"]["50th"]  # Median wage
        170910.0
    """
    # Get singleton MongoDB client (thread-safe, shared across agents)
    mongo_client = get_oews_mongo_client()
    @tool(stop_after_tool_call=True)
    async def wage_tool(
        soc_code: str,
        area: Optional[str] = "National"
    ) -> Dict[str, Any]:
        """
        Retrieve wage percentile data for a specific occupation and location.

        Queries the OEWS database to get annual wage percentiles for a Standard Occupational
        Classification (SOC) code in a specified geographic area. Returns complete wage distribution
        data including all five percentiles used for government contract pricing.

        Args:
            soc_code (str): 6-digit SOC code, with or without hyphen.
                           Examples: "151252", "15-1252" (both accepted)
            area (str): Geographic area name. Default is "National".
                       Examples: "National", "California", "San Francisco", "Texas"
                       The tool will automatically resolve area names to area codes.

        Returns:
            Dict[str, Any]: Wage data dictionary containing:
                - soc_code (str): The queried SOC code
                - occupation_name (str): Official BLS occupation title
                - area (str): Geographic area name
                - wages (dict): Dictionary of annual wage percentiles:
                    - "10th" (float): 10th percentile annual wage (bottom 10%)
                    - "25th" (float): 25th percentile annual wage
                    - "50th" (float): 50th percentile (median) annual wage
                    - "75th" (float): 75th percentile annual wage
                    - "90th" (float): 90th percentile annual wage (top 10%)
                  Values are in USD. May be None if data unavailable for that area.

        Example:
            >>> wage_tool("151252", "California")
            {
                "soc_code": "151252",
                "occupation_name": "Software Developers",
                "area": "California",
                "wages": {
                    "10th": 103950.0,
                    "25th": 134820.0,
                    "50th": 170910.0,
                    "75th": 212280.0,
                    "90th": 258450.0
                }
            }

        Note:
            - Thread-safe: Multiple agents can call this simultaneously
            - Queries MongoDB with indexed lookups (~10-50ms per query)
            - Returns None values for missing wage data (some area/occupation combinations unavailable)
            - Automatically handles area name resolution (e.g., "California" → area code "0600000")
        """
        # Handle NaN, None, or empty area - default to National
        # Also check for string "nan" or "none" which may be passed
        if (area is None or
            area == "" or
            str(area).lower() in ["nan", "none"] or
            (isinstance(area, float) and math.isnan(area))):
            area = "National"

        result = await mongo_client.get_wage_by_soc(soc_code=soc_code, area=area)
        return result

    return wage_tool


# ============================================================================
# GSA TOOLS
# ============================================================================

def calculate_gsa_year(contract_start_date: str) -> int:
    """
    Calculate current GSA contract year based on contract start date.

    GSA contracts always use December 30 - December 29 as the year cycle,
    regardless of when the contract was originally awarded.

    Example:
        Contract started: April 1, 2019
        Year 1 starts: December 30, 2019 (first Dec 30 after contract start)
        Current date: December 24, 2024 (before Dec 30, 2024)
        Result: Year 5 (we're still in the Dec 30, 2023 - Dec 29, 2024 cycle)

        If current date: December 31, 2024 (after Dec 30, 2024)
        Result: Year 6 (we're now in the Dec 30, 2024 - Dec 29, 2025 cycle)
    """
    from dateutil import parser as date_parser

    try:
        start_date = date_parser.parse(contract_start_date)
        current_date = datetime.now()

        # Find the first December 30 on or after the contract start date
        # This is the start of Year 1
        if start_date.month == 12 and start_date.day == 30:
            year_1_start = start_date
        elif start_date.month < 12 or (start_date.month == 12 and start_date.day < 30):
            # If before Dec 30, use Dec 30 of the same year
            year_1_start = datetime(start_date.year, 12, 30)
        else:
            # If after Dec 30 (Dec 31), use Dec 30 of next year
            year_1_start = datetime(start_date.year + 1, 12, 30)

        # Count how many Dec 30 to Dec 29 cycles have passed
        # Each cycle starts on Dec 30 of a year and ends on Dec 29 of the next year
        years_diff = current_date.year - year_1_start.year

        # If we haven't reached Dec 30 yet this year, we're still in the previous year
        if (current_date.month, current_date.day) < (12, 30):
            years_diff -= 1

        # Year number = cycles passed + 1
        return max(1, years_diff + 1)

    except Exception:
        return 1


def create_gsa_retriever(organization_id: str, file_id: str, description: Optional[str] = None):
    """
    Create a retriever for GSA labor category search using Pinecone.

    Args:
        organization_id: Organization ID to filter results
        file_id: GSA contract file ID to filter results
        description: Optional job description for enhanced semantic matching

    Returns:
        Callable retriever function for agno agents
    """
    pinecone_client = get_gsa_pinecone_client()

    def gsa_retriever(
        query: str,
        agent: Optional[Agent] = None,
        num_documents: int = 5,
        **kwargs
    ) -> List[Dict[str, str]]:
        """
        Search for matching GSA labor categories using Pinecone vector search.

        Args:
            query: Job title or description to search for
            num_documents: Maximum number of results to return

        Returns:
            List of matching labor categories with lcat_id, title, score
        """
        k = 30

        # Enhance query with description for better semantic matching (like BLS retriever)
        search_query = query
        if description:
            search_query = f"{query}. {description}"

        results = pinecone_client.search_labor_categories(
            query=search_query,
            organization_id=organization_id,
            file_id=file_id,
            top_k=k
        )

        return results

    return gsa_retriever


def create_gsa_rate_tool(
    organization_id: str,
    file_id: str,
    contract_start_date: str = "",
    gsa_current_year: Optional[int] = None,
):
    """
    Create a tool for retrieving GSA rates from MongoDB.

    Args:
        organization_id: Organization ID
        file_id: GSA contract file ID
        contract_start_date: Contract start date for year calculation (fallback)
        gsa_current_year: Current GSA year if already known (takes precedence
                          over contract_start_date calculation)

    Returns:
        Callable tool function for agno agents
    """
    crud = get_company_repository_crud()
    current_gsa_year = gsa_current_year if gsa_current_year is not None else calculate_gsa_year(contract_start_date)

    @tool(stop_after_tool_call=True)
    def gsa_rate_tool(lcat_id: str) -> Dict[str, Any]:
        """
        Get GSA labor category with all rates.

        Args:
            lcat_id: Labor category ID from search results

        Returns:
            Labor category info with all rates_by_year
        """
        lcat = crud.get_labor_category(file_id, organization_id, lcat_id)

        if not lcat:
            return {
                "lcat_id": lcat_id,
                "error": f"Labor category {lcat_id} not found"
            }

        return {
            "lcat_id": lcat_id,
            "title": lcat.get("title", ""),
            "sin": lcat.get("sin", ""),
            "education": lcat.get("education", ""),
            "experience": lcat.get("experience", ""),
            "rates_by_year": lcat.get("rates_by_year", {}),
            "current_gsa_year": current_gsa_year
        }

    return gsa_rate_tool


# ============================================================================
# HELP CENTER TOOLS
# ============================================================================

def create_help_center_retriever():
    """
    Create a retriever for help center documentation search.

    Args:
        category: Optional category filter (e.g., "getting-started", "pricing")

    Returns:
        Callable retriever function for agno agents
    """
    

    pinecone_client = get_help_center_pinecone_client()

    def help_center_retriever(
        query: str,
        agent: Optional[Agent] = None,
        num_documents: int = 5,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Search help center documentation using Pinecone vector search.

        Args:
            query: User question or search query
            num_documents: Maximum number of results to return

        Returns:
            List of dicts with content, metadata, and score
        """
        # Handle None value from agno (use default of 5)
        k = num_documents if num_documents is not None else 5

        results = pinecone_client.search(
            query=query,
            namespace="help-center",
            top_k=k
        )

        return results

    return help_center_retriever



def create_reasoning_tool(
    instructions: str = "only show reasoning no need for for action confidence",
    add_instructions: bool = True,
    think: bool = True,
    analyze: bool = True,
    add_few_shot: bool = False,
    few_shot_examples: Optional[List[Dict[str, str]]] = None,
) -> ReasoningTools:
    """
    Create a reasoning tool with customizable parameters.

    Args:
        instructions: Instructions for reasoning
        add_instructions: Whether to add instructions
        think: Enable thinking
        analyze: Enable analysis
        add_few_shot: Whether to add few-shot examples
        few_shot_examples: List of few-shot examples

    Returns:
        Configured ReasoningTools instance
    """
    try:
        tool = ReasoningTools(
            instructions=instructions,
            add_instructions=add_instructions,
            enable_think=think,
            enable_analyze=analyze,
            add_few_shot=add_few_shot,
            few_shot_examples=few_shot_examples,
        )
    
        return tool
    except Exception as e:
        raise RuntimeError(f"Failed to create reasoning tool: {str(e)}")


# ============================================================================
# WEB SEARCH (Exa) — for govcon competitive intel in PtW analysis
# ============================================================================

# Authoritative govcon domains — bias Exa toward these so search results are
# concrete award/wage data, not generic blog posts.
_GOVCON_INCLUDE_DOMAINS = [
    "sam.gov",
    "usaspending.gov",
    "fpds.gov",
    "apps.fpds.gov",
    "gsa.gov",
    "gsaadvantage.gov",
    "highergov.com",
    "govtribe.com",
    "beta.sam.gov",
]


@lru_cache(maxsize=1)
def get_web_search_tool(
    num_results: int = 6,
    text_length_limit: int = 2000,
) -> Optional[ExaTools]:
    """
    Return a cached ExaTools instance configured for govcon competitive intel.

    Used by Q for Price-to-Win analysis: pulling past contract awards,
    incumbent identification, agency buying patterns, GSA Schedule rates,
    and indirect rate / fee benchmarks.

    Configuration:
    - Domain bias toward sam.gov, usaspending.gov, fpds.gov, gsa.gov, etc.
    - `livecrawl='always'` for fresh data (Exa's index can be stale).
    - Compact text limit so the LLM context stays small.
    - `enable_answer=False` — we want raw results, not Exa's synthesis.

    Args:
        num_results: Max results per search (default 6 — small + focused).
        text_length_limit: Cap on text per result (keeps LLM context lean).

    Returns:
        Configured ExaTools, or None if EXA_API_KEY is not set.
    """
    api_key = settings.EXA_API_KEY
    if not api_key:
        logger.warning("[web_search_tool] EXA_API_KEY not set — web search disabled")
        return None

    try:
        tool = ExaTools(
            api_key=api_key,
            num_results=num_results,
            include_domains=list(_GOVCON_INCLUDE_DOMAINS),
            enable_get_contents=True,
            enable_find_similar=False,
            enable_answer=False,
            text=True,
            text_length_limit=text_length_limit,
            summary=False,
            livecrawl="always",
        )
        logger.info(
            f"[web_search_tool] initialized (num_results={num_results}, "
            f"domains={len(_GOVCON_INCLUDE_DOMAINS)})"
        )
        return tool
    except Exception as e:
        logger.error(f"[web_search_tool] failed to init ExaTools: {e}", exc_info=True)
        return None


# ============================================================================
# PROPOSAL MUTATION TOOLS — direct $set on proposal documents, gated by
# `requires_confirmation=True` (agno emits run_paused → frontend shows an
# approval card → /resume endpoint executes after user approves).
#
# Identity (proposal_id, user_id, org, role) is captured by closure at tool-
# creation time so the agent never has to pass it. Mirrors the closure
# pattern used by Kroolo's create_custom_retreiver, create_mongodb_query_tool,
# etc. The actual mutation logic lives in proposal_mutation_tools.py — these
# factories are thin agno-wrapping shells.
# ============================================================================

from utils.proposal_mutation_tools import (  # noqa: E402
    apply_position_update,
    apply_rate_update,
)


def create_update_rates_tool(
    proposal_id: str,
    user_id: str,
    organization_id: Optional[str] = None,
    role: Optional[str] = None,
):
    """
    Build a request-scoped `update_rates` tool. Identity is bound at creation
    time via closure — the inner @tool function captures proposal/user/org so
    the agent never has to pass them.

    The inner function is `requires_confirmation=True` — agno emits
    `run_paused` before execution and the frontend renders an approval card.

    Args:
        proposal_id: MongoDB ObjectId (as string) of the proposal to mutate.
        user_id: MongoDB ObjectId of the calling user (for authz check).
        organization_id: User's organization ID for org-scoped access.
        role: User's role ('admin' gets full org access).

    Returns:
        An agno @tool function ready to register on an Agent.
    """
    if not proposal_id or not str(proposal_id).strip():
        raise ValueError("proposal_id is required to build update_rates tool")
    if not user_id or not str(user_id).strip():
        raise ValueError("user_id is required to build update_rates tool")

    @tool(requires_confirmation=True)
    def update_rates(
        rates: Optional[Dict[str, Any]] = None,
        escalation_rates: Optional[Dict[str, Any]] = None,
        rationale: str = "",
    ) -> Dict[str, Any]:
        """
        💰 Update the proposal's indirect rates and/or escalation rates.

        REQUIRES USER CONFIRMATION. The frontend renders an approval card
        before execution; only after the user clicks Approve does the change
        land in MongoDB.

        Use this tool whenever you've identified that a rate change would
        help the user — e.g. closing a Price-to-Win gap, reflecting a
        DCAA-approved rate change, or correcting a number. Do NOT just
        describe the change in plain text — the user needs the explicit
        Approve gate.

        Args:
            rates: Subset of indirect rate keys to update. Each value is a
                decimal (NOT a percent — pass 0.055 for 5.5%, not 5.5).
                Accepted keys:
                - fringe          (e.g. 0.247)
                - oh_onsite       (e.g. 0.0711)
                - oh_offsite      (e.g. 0.0711)
                - ga              (e.g. 0.2243)
                - fee             (e.g. 0.07)
                - smh             (e.g. 0.065)
                - ga_passthrough  (e.g. 0.025)
                - sub_fee         (e.g. 0.05)
                - ot_multiplier   (e.g. 1.5)
                - surge_multiplier(e.g. 1.15)
                Pass None or {} to leave indirect rates untouched.
            escalation_rates: Year-to-year escalation rates. Keys are of the
                form "N_to_M" (e.g. "1_to_2", "2_to_3"). Each value is a
                decimal. Pass None or {} to leave escalation untouched.
            rationale: Short past-tense explanation surfaced to the user on
                the approval card. E.g. "Drop fee 1.5pt to close the $1.4M
                PtW gap".

        Returns:
            Dict with success status, the change descriptor the frontend
            uses to patch its local store, and the proposal_id.
        """
        return apply_rate_update(
            proposal_id=proposal_id,
            user_id=user_id,
            organization_id=organization_id,
            role=role,
            rates=rates,
            escalation_rates=escalation_rates,
            rationale=rationale,
        )

    return update_rates


def create_update_positions_tool(
    proposal_id: str,
    user_id: str,
    organization_id: Optional[str] = None,
    role: Optional[str] = None,
):
    """
    Build a request-scoped `update_positions` tool. Same closure pattern as
    create_update_rates_tool.

    Returns:
        An agno @tool function with `requires_confirmation=True`.
    """
    if not proposal_id or not str(proposal_id).strip():
        raise ValueError("proposal_id is required to build update_positions tool")
    if not user_id or not str(user_id).strip():
        raise ValueError("user_id is required to build update_positions tool")

    @tool(requires_confirmation=True)
    def update_positions(
        updates: List[Dict[str, Any]],
        rationale: str = "",
    ) -> Dict[str, Any]:
        """
        👥 Update fields on one or more positions in the current proposal.

        REQUIRES USER CONFIRMATION. The frontend renders an approval card
        showing every field change before execution; only after Approve does
        the change land in MongoDB.

        Use this tool whenever a position-level change would help — e.g.
        dropping a senior wage from 75th to 50th percentile to close a PtW
        gap, moving positions off-site to lower OH cost, or applying a GSA
        discount.

        Args:
            updates: List of position-update entries. Each entry has:
                - position_id (str, required): the `id` field from
                  proposal_state.positions[i] (e.g. "pos_0_177...")
                - fields (dict, required): subset of editable fields. Keys:
                    * percentile         "10th" | "25th" | "50th" | "75th" | "90th"
                    * location_type      "On-Site" | "Off-Site"
                    * custom_salary      annual $ (number)
                    * hours_per_year     {"1": 1920, "2": 1920, ...}
                    * gsa_discount_rate  decimal 0..1 (only for GSA positions)
                    * ot_hours_per_year  {"1": 80, ...}
                    * is_key_position    true | false
            rationale: Short past-tense explanation surfaced on the approval
                card. E.g. "Drop senior-staff to 50th and move SATCOM SME
                off-site (saves $520K)".

        Returns:
            Dict with success, the per-position change descriptor (used by
            the frontend to patch its local store), and the proposal_id.
        """
        return apply_position_update(
            proposal_id=proposal_id,
            user_id=user_id,
            organization_id=organization_id,
            role=role,
            updates=updates,
            rationale=rationale,
        )

    return update_positions