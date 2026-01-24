from agno.agent import Agent
from client.llm_client import get_chat_llm_agno
from utils.agno_tools import (
    create_custom_retreiver,
    create_wage_tool,
    create_gsa_retriever,
    create_gsa_rate_tool,
)
from utils.company_repository import get_company_repository_crud
from app.settings import settings


async def create_pricing_agent(
    labor_category: str, description: str = None, location: str = "National"
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
    llm = get_chat_llm_agno(model="gpt-4.1",api_key=settings.OPENAI_API_KEY,base_url="https://api.openai.com/v1", max_tokens=10000)

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
        """<critical_context>
You are matching GOVERNMENT and MILITARY contractor job titles. These often contain:
- Military/agency acronyms (NMCI, VTC, IW, etc.)
- Government-specific terminology
- Non-standard job titles that map to standard occupations

Before selecting a SOC code, you MUST:
1. Analyze the job title to understand the ACTUAL job function
2. Identify keywords that reveal the true occupation domain:
   - Words like "Cyber", "Network", "Systems", "Database", "IT", "Computer" → Technology/IT occupations
   - Words like "Administrator", "Technician", "Support" in tech context → Computer/IT roles
   - Words like "Security" with tech context → Information Security, NOT physical security
   - Words like "Analyst", "Engineer", "Developer" → Technical/professional occupations
3. Understand industry context - government contractors use specialized terminology for standard occupations

Key reasoning principles:
- Job titles containing technical/IT terminology should map to Computer and Mathematical Occupations (SOC 15-xxxx)
- Acronyms often represent systems, tools, or platforms relevant to the job domain
- "Technician" or "Specialist" in government IT context typically means technical support, not physical trades
- Administrative roles in technical contexts are usually technical administrators, not clerical staff
</critical_context>""",
        """<workflow>
Step 1: Use the search_knowledge_base tool to find matching SOC codes.
        - This returns 30 results with soc_code, occupation name, and similarity scores
        - The retriever does simple text matching - you must apply semantic understanding

Step 2: ANALYZE ALL 30 RESULTS carefully:
        a) First, understand what the job ACTUALLY does by analyzing:
           - Keywords in the labor category
           - Industry context (government contractor = often IT/technical roles)
           - Any description provided
        b) Then scan through all 30 results to find occupations that match the TRUE job function
        c) Apply common sense reasoning:
           - Does an "IT support" role make sense as an "MRI Technologist"? NO
           - Does a "Network" role make sense as "Air Traffic Control"? NO
           - Does a "Computer" role make sense as "Heavy Vehicle Mechanic"? NO
        d) Look for occupation titles that match the actual domain:
           - Technical roles → Computer/IT occupations (SOC 15-xxxx)
           - Healthcare roles → Healthcare occupations (SOC 29-xxxx)
           - Physical trades → Installation/Maintenance occupations (SOC 49-xxxx)
           - Transportation → Transportation occupations (SOC 53-xxxx)
        e) The correct match may be ranked anywhere in the 30 results - don't blindly pick #1

Step 3: Select the SOC code that makes LOGICAL SENSE for the actual job function

Step 4: Use the wage_tool with the selected soc_code and location

Step 5: The wage_tool will return the final result and stop execution
</workflow>""",
        """<selection_rules>
1. SEMANTIC UNDERSTANDING > TEXT SIMILARITY: The highest-scored result may be wrong if it doesn't match the actual job domain
2. ANALYZE CONTEXT: Government contractor terminology often needs translation to standard occupations
3. DOMAIN MATCHING: Match the job to the correct occupational category:
   - Technology/IT keywords → Computer occupations (15-xxxx)
   - Security + Technology → Information Security
   - Engineering keywords → Engineering occupations
   - Healthcare keywords → Healthcare occupations
4. CROSS-DOMAIN ERRORS ARE WRONG: Never match IT → Healthcare, IT → Physical Trades, Office → Transportation, etc.
5. USE ALL 30 OPTIONS: Review the full list - the correct match might not be the top result
6. THINK LIKE A HUMAN: Ask yourself "Does this occupation make sense for this job title?"
7. The wage_tool will stop execution and return the result directly
8. Do not add any additional commentary or formatting
</selection_rules>""",
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
        debug_mode=True,
    )

    return agent


async def create_gsa_pricing_agent(
    labor_category: str,
    description: str = None,
    organization_id: str = None,
    file_id: str = None,
) -> Agent:
    """
    Create a pricing agent for GSA contract rate lookup.

    Args:
        labor_category: Job title to match
        description: Optional job description for better matching
        organization_id: Organization ID
        file_id: GSA contract file ID

    Returns:
        Agent instance configured for GSA rate lookup
    """
    llm = get_chat_llm_agno(model="gpt-4.1",api_key=settings.OPENAI_API_KEY,base_url="https://api.openai.com/v1", max_tokens=10000)

    # Get contract start date for year calculation
    crud = get_company_repository_crud()
    contract = crud.get_by_file_id(file_id, organization_id)
    contract_start_date = contract.get("contract_start_date", "") if contract else ""

    # Create GSA tools with description for better matching
    gsa_retriever = create_gsa_retriever(organization_id, file_id, description)
    gsa_rate_tool = create_gsa_rate_tool(organization_id, file_id, contract_start_date)

    instructions = [
        f"""You are a GSA Pricing Agent. Your ONLY job is to:
1. Search for GSA labor category matching "{labor_category}"
2. Call gsa_rate_tool with the lcat_id from search results

YOU MUST ALWAYS CALL gsa_rate_tool. Never respond with text.""",
        """<strict_rules>
1. ALWAYS call gsa_rate_tool after search - NO EXCEPTIONS
2. Use the lcat_id field from search results (e.g., "lcat_0", "lcat_5")
3. If no exact match, use the HIGHEST SCORE result anyway
4. NEVER ask questions or provide explanations
5. NEVER respond with text - ONLY make tool calls
</strict_rules>""",
        """<workflow>
Step 1: search_knowledge_base → get results with lcat_id, title, score
Step 2: gsa_rate_tool(lcat_id=<best_match_lcat_id>)

Example: search returns [{"lcat_id": "lcat_3", "title": "Analyst", "score": 0.8}]
→ Call: gsa_rate_tool(lcat_id="lcat_3")
</workflow>""",
    ]

    agent = Agent(
        name="GSA Pricing Agent",
        model=llm,
        knowledge_retriever=gsa_retriever,
        tools=[gsa_rate_tool],
        telemetry=True,
        add_datetime_to_context=True,
        markdown=True,
        id="GSAPricingAgent",
        description="GSA Pricing Agent for GSA contract rates.",
        instructions=instructions,
        debug_mode=True,
    )

    return agent
