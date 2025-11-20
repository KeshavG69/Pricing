"""Job description parsing using LangChain and LLM."""

from typing import List, Dict, Optional
from pathlib import Path
import pandas as pd
from unstructured.partition.auto import partition
from pydantic import BaseModel, Field

from client.llm_client import get_chat_llm
from models.job_description import JobDescriptionList, JobDescription
from app.settings import settings


class DocumentMetadata(BaseModel):
    """Document-level metadata extracted from the entire document."""

    location: Optional[str] = Field(
        None,
        description="Primary location, city, state, or region mentioned in the document"
    )
    project_name: Optional[str] = Field(
        None,
        description="Project or contract name if mentioned"
    )
    base_years: Optional[int] = Field(
        None,
        description="Number of base period years (e.g., 1). None if not specified."
    )
    option_years: Optional[int] = Field(
        None,
        description="Number of option years (e.g., 4). None if not specified."
    )
    total_years: Optional[int] = Field(
        None,
        description="Total contract years (base + option). None if not specified."
    )


async def extract_document_metadata(document_path: str) -> DocumentMetadata:
    """
    Extract document-level metadata like location and project name.

    This analyzes the entire document (or key sections) to find information
    that applies to all jobs, such as:
    - Location mentioned in headers, footers, cover page
    - Project or contract name
    - Client information

    Args:
        document_path: Path to the document

    Returns:
        DocumentMetadata with location and project_name (or None if not found)
    """
    try:
        # Extract text from document
        elements = partition(filename=document_path)

        # Get first 50 elements (covers intro, headers, cover page)
        # and last 10 elements (might have project details)
        first_text = "\n".join([elem.text.strip() for elem in elements[:50] if elem.text.strip()])
        last_text = "\n".join([elem.text.strip() for elem in elements[-10:] if elem.text.strip()])

        combined_text = f"Document Start:\n{first_text}\n\nDocument End:\n{last_text}"

        # Limit to reasonable size for LLM
        if len(combined_text) > 4000:
            combined_text = combined_text[:4000]

        llm = get_chat_llm(model=settings.OPENROUTER_MODEL, api_key=settings.OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")
        structured_llm = llm.with_structured_output(DocumentMetadata)

        prompt = f"""Analyze this document and extract metadata that applies to the entire document.

Look for:
- location: The primary geographic location, city, state, or region for this project/contract.
  This might appear in:
  * Document headers or footers
  * Cover page
  * Project overview sections
  * Contract location or place of performance
  * Client location

- project_name: The name of the project, contract, or engagement (if mentioned)

- base_years: Number of base period years (integer)
  Look for phrases like:
  * "Base Period: 1 year"
  * "base year"
  * "1 base year"

- option_years: Number of option years (integer)
  Look for phrases like:
  * "Option Year 1", "Option Year 2", etc. (count them)
  * "4 option years"
  * "plus four option years"

- total_years: Total contract duration in years (integer)
  Look for phrases like:
  * "5-year contract"
  * "five year period"
  * "1 base + 4 option years" (calculate: 1 + 4 = 5)
  * "Period of Performance: 5 years"

Common patterns:
  * "5-year contract (1 base + 4 option years)"
  * "Base Period: 1 year, Option Periods: Years 1-4"
  * "Contract period: Base year plus four option years"

If you cannot find this information, return null for that field.

Document text:
{combined_text}
"""

        result = await structured_llm.ainvoke(prompt)
        return result

    except Exception as e:
        print(f"  ⚠️  Could not extract document metadata: {e}")
        return DocumentMetadata(location=None, project_name=None)


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
- description: Full job description text including responsibilities, requirements, qualifications, and duties (or null if not available)
- experience: Years of experience required (as integer, or null if not specified)
- location: Job location (or null if not specified)
- hours: Annual hours like 1880 for full-time, 940 for part-time (or null if not specified) - LEGACY FIELD
- hours_per_year: Hours per year for multi-year contracts as a dictionary with string keys
  Format: {{"1": 1880, "2": 1880, "3": 0, "4": 1880, "5": 1880}}
  Year keys MUST be strings ("1", "2", "3", etc.), NOT integers

  Look for patterns like:
  * "Year 1: 1880 hours, Year 2: 1880 hours, Year 3: Not working, Year 4: 1880 hours"
  * "Full-time (1880 hours/year) for all 5 years"
  * "Part-time in Year 1 (940 hours), full-time thereafter (1880 hours)"
  * Tables showing hours per year
  * "Base year: 1880 hours, Option years 1-4: 1880 hours each"

  If document specifies different hours per year, extract them into the dictionary.
  If document only mentions total annual hours without year breakdown, use that value for all years mentioned in the document.
  If not specified at all, return null.

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
        pandas DataFrame with columns:
        - labor_category, description, experience, location, hours, hours_per_year (job-level)
        - base_years, option_years, total_years, project_name (document-level, same for all rows)
        One row per job description found across all documents
    """
    all_jds: List[JobDescription] = []
    all_metadata: List[DocumentMetadata] = []

    print(f"\n{'='*60}")
    print(f"Parsing {len(document_paths)} document(s)")
    print(f"{'='*60}")

    for doc_path in document_paths:
        print(f"\nProcessing: {Path(doc_path).name}")

        # Step 1: Extract document-level metadata (location, project name, contract years)
        print(f"  Extracting document metadata...", end=" ")
        doc_metadata = await extract_document_metadata(doc_path)
        doc_location = doc_metadata.location
        if doc_location:
            print(f"Found location: {doc_location}")
        else:
            print("No document-level location found")

        if doc_metadata.base_years or doc_metadata.option_years or doc_metadata.total_years:
            print(f"  Contract years: base={doc_metadata.base_years}, option={doc_metadata.option_years}, total={doc_metadata.total_years}")

        # Step 2: Extract text from document using unstructured
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

                # Apply document-level location to jobs that don't have one
                # and store metadata for each job
                for jd in jd_list.job_descriptions:
                    if not jd.location and doc_location:
                        jd.location = doc_location
                    # Store metadata for this job
                    all_metadata.append(doc_metadata)

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
        df = pd.DataFrame(columns=[
            "labor_category", "description", "experience", "location", "hours", "hours_per_year",
            "base_years", "option_years", "total_years", "project_name"
        ])
    else:
        df = pd.DataFrame([
            {
                "labor_category": jd.labor_category,
                "description": jd.description,
                "experience": jd.experience,
                "location": jd.location,
                "hours": jd.hours,
                "hours_per_year": jd.hours_per_year,
                # Document-level metadata (same for all jobs from same document)
                "base_years": metadata.base_years,
                "option_years": metadata.option_years,
                "total_years": metadata.total_years,
                "project_name": metadata.project_name
            }
            for jd, metadata in zip(all_jds, all_metadata)
        ])

    print(f"✓ Extracted {len(df)} job descriptions\n")
    return df
