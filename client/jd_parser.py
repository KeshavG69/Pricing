"""Job description parsing using LangChain and LLM."""

from langchain_openai import ChatOpenAI
from app.settings import settings
from models.job_description import JobDescriptionList


def parse_page_for_jds(page_text: str) -> JobDescriptionList:
    """
    Extract job descriptions from page text using LLM with structured output.

    Args:
        page_text: Extracted text from a single page

    Returns:
        JobDescriptionList containing all JDs found on the page
    """
    llm = ChatOpenAI(
        model=settings.OPENROUTER_MODEL,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base="https://openrouter.ai/api/v1",
    )

    structured_llm = llm.with_structured_output(JobDescriptionList)

    prompt = f"""Extract all job descriptions from the following text.

For each job description, extract:
- labor_category: Job title or role name
- experience: Years of experience required (as integer, or null if not specified)
- location: Job location (or null if not specified)
- hours: Annual hours like 1920 for full-time, 960 for part-time (or null if not specified)

If no job descriptions are found, return an empty list.

Text:
{page_text}
"""

    result = structured_llm.invoke(prompt)
    return result
