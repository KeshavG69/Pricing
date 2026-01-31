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
    labor_category: str, description: str = None, location: str = "National", soc_code: str = None
) -> Agent:
    """
    Create a stateless pricing agent for wage lookup based on job descriptions.

    This agent:
    1. If SOC code provided: Directly retrieves wage data for that code (skips FAISS matching)
    2. If no SOC code: Uses vector search to find the best matching SOC code for the labor category
    3. Retrieves wage data (5 percentiles) for the SOC code in the specified location
    4. Returns structured wage data dictionary

    Args:
        labor_category: Job title (e.g., "Software Developer", "Senior Python Engineer")
        description: Optional full job description text for better SOC code matching
        location: Geographic area name (default: "National"). Examples: "California", "San Francisco", "Texas"
        soc_code: Optional SOC code extracted from document (e.g., "15-1252" or "151252"). If provided, skips vector search.

    Returns:
        Agent instance configured for wage lookup

    Example:
        >>> agent = await create_pricing_agent("Software Developer", "Designs web applications...", "California")
        >>> result = await agent.run(f"Find wage data for {labor_category} in {location}")
        >>> # Returns: {"soc_code": "151252", "occupation_name": "...", "area": "...", "wages": {...}}
    """
    llm = get_chat_llm_agno(model="google/gemini-3-flash-preview",api_key=settings.OPENROUTER_API_KEY,base_url="https://openrouter.ai/api/v1", max_tokens=10000)

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

    # Build instructions based on whether SOC code is provided
    if soc_code:
        # SOC code provided - skip search, use directly
        instructions = [
            f"""You are a Pricing Agent specialized in finding U.S. government contractor wage data.

IMPORTANT: The document explicitly provided SOC code "{soc_code}" for this position.

Your task:
1. SKIP the search_knowledge_base tool - the SOC code is already provided
2. Directly call wage_tool with soc_code="{soc_code}" and area="{location}"
3. Return the wage data

The labor category is: {labor_category}
{f"Job description: {description}" if description else ""}
The location to search in is: {location}
The SOC code from document: {soc_code}""",
            """<workflow>
Since SOC code is provided from the document, you MUST:
1. SKIP search_knowledge_base (do NOT use it)
2. Directly call: wage_tool(soc_code="{soc_code}", area="{location}")
3. The wage_tool will return the final result and stop execution

DO NOT search for SOC codes - use the provided one directly.
</workflow>""".replace("{soc_code}", soc_code).replace("{location}", location),
            """<strict_rules>
1. DO NOT use search_knowledge_base - the SOC code is already known
2. Directly call wage_tool with the provided SOC code
3. Do not add any additional commentary or formatting
4. The wage_tool will stop execution and return the result directly
</strict_rules>""",
        ]
    else:
        # No SOC code - use normal workflow with FAISS search
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
    soc_code: str = None,
) -> Agent:
    """
    Create a pricing agent for GSA contract rate lookup.

    Args:
        labor_category: Job title to match
        description: Optional job description for better matching
        organization_id: Organization ID
        file_id: GSA contract file ID
        soc_code: Optional SOC code (not used for GSA lookup, included for API consistency)

    Returns:
        Agent instance configured for GSA rate lookup

    Note:
        GSA agents use GSA labor category IDs, not SOC codes. The soc_code parameter
        is included for function signature consistency but is not used in GSA lookups.
    """
    llm = get_chat_llm_agno(model="google/gemini-3-flash-preview",api_key=settings.OPENROUTER_API_KEY,base_url="https://openrouter.ai/api/v1", max_tokens=10000)

    # Get contract start date for year calculation
    crud = get_company_repository_crud()
    contract = crud.get_by_file_id(file_id, organization_id)
    contract_start_date = contract.get("contract_start_date", "") if contract else ""

    # Create GSA tools with description for better matching
    gsa_retriever = create_gsa_retriever(organization_id, file_id, description)
    gsa_rate_tool = create_gsa_rate_tool(organization_id, file_id, contract_start_date)

    # Build instructions with SOC code context if provided
    soc_context = f"\nSOC Code from document: {soc_code} (Use as additional context for matching)" if soc_code else ""

    instructions = [
        f"""You are a GSA Pricing Agent. Your ONLY job is to:
1. Search for GSA labor category matching "{labor_category}"
2. Call gsa_rate_tool with the lcat_id from search results

Labor category: {labor_category}
{f"Description: {description}" if description else ""}{soc_context}

YOU MUST ALWAYS CALL gsa_rate_tool. Never respond with text.""",
        """<strict_rules>
1. ALWAYS call gsa_rate_tool after search - NO EXCEPTIONS
2. Use the lcat_id field from search results (e.g., "lcat_0", "lcat_5")
3. If no exact match, use the HIGHEST SCORE result anyway
4. NEVER ask questions or provide explanations
5. NEVER respond with text - ONLY make tool calls
6. If SOC code is provided, use it as additional context to validate the match makes sense
</strict_rules>""",
        """<workflow>
Step 1: search_knowledge_base → get results with lcat_id, title, score
Step 2: gsa_rate_tool(lcat_id=<best_match_lcat_id>)

Example: search returns [{"lcat_id": "lcat_3", "title": "Analyst", "score": 0.8}]
→ Call: gsa_rate_tool(lcat_id="lcat_3")

Note: If SOC code is provided, it helps validate the occupational category matches the job domain.
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
