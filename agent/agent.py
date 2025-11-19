from agno.agent import Agent
from client.llm_client import get_chat_llm_agno
from utils.agno_tools import create_custom_retreiver, create_wage_tool


async def create_pricing_agent(
    labor_category: str,
    description: str = None,
    location: str = "National"
) -> Agent:
    """
    Create a stateless pricing agent for wage lookup based on job descriptions.

    This agent:
    1. Uses vector search to find the best matching SOC code for the labor category (with optional description for better matching)
    2. Retrieves wage data (5 percentiles) for that SOC code in the specified location
    3. Returns structured wage data dictionary

    Args:
        labor_category: Job title (e.g., "Software Developer", "Senior Python Engineer")
        description: Optional full job description text for better SOC code matching
        location: Geographic area name (default: "National"). Examples: "California", "San Francisco", "Texas"

    Returns:
        Agent instance configured for wage lookup

    Example:
        >>> agent = await create_pricing_agent("Software Developer", "Designs web applications...", "California")
        >>> result = await agent.run(f"Find wage data for {labor_category} in {location}")
        >>> # Returns: {"soc_code": "151252", "occupation_name": "...", "area": "...", "wages": {...}}
    """
    llm = get_chat_llm_agno()

    # Create SOC code retriever (searches 1,105 occupations with vector similarity)
    # Pass description to retriever so it can use it for better semantic matching
    soc_retriever = create_custom_retreiver(description=description)

    # Create wage lookup tool (queries MongoDB for 5 wage percentiles)
    # Note: wage_tool has stop_after_tool_call=True, so agent returns tool output directly
    wage_lookup_tool = create_wage_tool()

    # Build search context with job title and description (if available)
    search_context = labor_category
    if description:
        search_context = f"{labor_category}. {description}"

    instructions = [
        f"""You are a Pricing Agent specialized in finding U.S. government contractor wage data.

Your task:
1. Search for the most relevant Standard Occupational Classification (SOC) code that matches "{search_context}"
2. Use the wage_tool to retrieve wage percentiles for that SOC code in "{location}"
3. Return the wage data

The labor category to search for is: {labor_category}
{f"Job description: {description}" if description else ""}
The location to search in is: {location}""",

        """<workflow>
Step 1: Use the search_knowledge_base tool to find the best matching SOC code for the labor category.
        - This will return results with soc_code, occupation name, and confidence score
        - Select the SOC code which you think is the best match it doesnt have to have a high confidence score whatever you think is best choose that only

Step 2: Use the wage_tool with:
        - soc_code: The best matching SOC code from step 1
        - area: The location specified

Step 3: The wage_tool will return the final result with all wage percentiles.
        - The agent will automatically stop after the wage_tool call and return its output
</workflow>""",

        """<important>
- Always use the highest confidence SOC code from the search results
- If multiple SOC codes are returned, choose the one with the highest confidence score
- The wage_tool will stop execution and return the result directly
- Do not add any additional commentary or formatting
</important>"""
    ]

    agent = Agent(
        name="Pricing Agent",
        model=llm,
        knowledge_retriever=soc_retriever,
        tools=[wage_lookup_tool],
        telemetry=True,
        add_datetime_to_context=True,
        markdown=True,
        id="PricingAgent",
        description="Pricing Agent that finds SOC codes and retrieves wage data for government contractor pricing.",
        instructions=instructions,
        debug_mode=True
    )

    return agent



