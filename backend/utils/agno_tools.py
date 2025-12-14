"""
Custom agno tools for SOC code vector search retriever.
"""

from typing import Any, Optional, List, Dict
import math
from agno.agent import Agent
from agno.tools import tool
from client.soc_vector_search import get_soc_vector_search_client
from client.oews_mongodb import get_oews_mongo_client


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
        num_documents: int = 5,
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
            num_documents (int): Maximum number of similar SOC codes to return. Default is 5.
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
        # Handle None value from agno (use default of 5)
        k = num_documents if num_documents is not None else 15
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

