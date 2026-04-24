"""
Custom agno tools for SOC code vector search retriever and GSA labor category tools.
"""

from typing import Any, Optional, List, Dict
from datetime import datetime
import math
from agno.agent import Agent
from agno.tools import tool
from client.soc_vector_search import get_soc_vector_search_client
from client.oews_mongodb import get_oews_mongo_client
from client.gsa_pinecone import get_gsa_pinecone_client
from utils.company_repository import get_company_repository_crud
from client.help_center_pinecone import get_help_center_pinecone_client
from agno.tools.reasoning import ReasoningTools
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


def create_gsa_rate_tool(organization_id: str, file_id: str, contract_start_date: str):
    """
    Create a tool for retrieving GSA rates from MongoDB.

    Args:
        organization_id: Organization ID
        file_id: GSA contract file ID
        contract_start_date: Contract start date for year calculation

    Returns:
        Callable tool function for agno agents
    """
    crud = get_company_repository_crud()
    current_gsa_year = calculate_gsa_year(contract_start_date)

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