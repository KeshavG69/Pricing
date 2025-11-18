"""Job description parsing using LangChain and LLM."""

from client.llm_client import get_chat_llm
from models.job_description import JobDescriptionList
from app.settings import settings


def parse_page_for_jds(page_text: str) -> JobDescriptionList:
    """
    Extract job descriptions from page text using LLM with structured output.

    Args:
        page_text: Extracted text from a single page

    Returns:
        JobDescriptionList containing all JDs found on the page
    """
    llm = get_chat_llm(model=settings.OPENROUTER_MODEL, api_key=settings.OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")
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
