"""Job description parsing using LangChain and LLM."""

from typing import List
from pathlib import Path
import pandas as pd
from unstructured.partition.auto import partition

from client.llm_client import get_chat_llm
from models.job_description import JobDescriptionList, JobDescription
from app.settings import settings


async def parse_page_for_jds(page_text: str) -> JobDescriptionList:
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

    result = await structured_llm.ainvoke(prompt)
    return result


async def parse_documents_to_dataframe(document_paths: List[str]) -> pd.DataFrame:
    """
    Parse multiple documents and extract all job descriptions into a DataFrame.

    Args:
        document_paths: List of paths to documents (PDF, DOCX, Excel, etc.)

    Returns:
        pandas DataFrame with columns: labor_category, experience, location, hours
        One row per job description found across all documents
    """
    all_jds: List[JobDescription] = []

    print(f"\n{'='*60}")
    print(f"Parsing {len(document_paths)} document(s)")
    print(f"{'='*60}")

    for doc_path in document_paths:
        print(f"\nProcessing: {Path(doc_path).name}")

        # Extract text from document using unstructured
        try:
            elements = partition(filename=doc_path)
            pages_text = []
            current_page_text = []

            # Group elements by page (if available)
            for element in elements:
                page_num = getattr(element.metadata, 'page_number', None)
                text = element.text.strip()

                if text:
                    current_page_text.append(text)

                    # If we detect a new page, save previous page
                    if page_num and len(current_page_text) > 100:  # Arbitrary threshold
                        pages_text.append("\n".join(current_page_text))
                        current_page_text = []

            # Add remaining text as final page
            if current_page_text:
                pages_text.append("\n".join(current_page_text))

            # If no pages detected, treat entire document as one page
            if not pages_text:
                pages_text = ["\n".join([elem.text for elem in elements if elem.text.strip()])]

            print(f"  Extracted {len(pages_text)} page(s)")

            # Parse each page for JDs
            for i, page_text in enumerate(pages_text, 1):
                if not page_text.strip():
                    continue

                print(f"  Parsing page {i}...", end=" ")
                jd_list = await parse_page_for_jds(page_text)
                page_jd_count = len(jd_list.job_descriptions)
                print(f"Found {page_jd_count} JD(s)")

                all_jds.extend(jd_list.job_descriptions)

        except Exception as e:
            print(f"  ❌ Error processing {doc_path}: {e}")
            continue

    print(f"\n{'='*60}")
    print(f"✓ Total job descriptions found: {len(all_jds)}")
    print(f"{'='*60}\n")

    # Convert to DataFrame
    if not all_jds:
        # Create empty DataFrame with correct columns
        df = pd.DataFrame(columns=["labor_category", "experience", "location", "hours"])
    else:
        df = pd.DataFrame([
            {
                "labor_category": jd.labor_category,
                "experience": jd.experience,
                "location": jd.location,
                "hours": jd.hours
            }
            for jd in all_jds
        ])

    print(f"✓ Extracted {len(df)} job descriptions\n")
    return df
