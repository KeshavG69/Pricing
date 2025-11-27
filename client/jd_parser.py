"""Job description parsing using LlamaExtract API."""

from typing import List, Dict, Optional
from pathlib import Path
import pandas as pd
from pydantic import BaseModel, Field

from models.job_description import JobDescription
from app.settings import settings

# Import LlamaExtract
try:
    from llama_cloud_services import LlamaExtract
    from llama_cloud import ExtractConfig, ExtractMode
except ImportError:
    raise ImportError(
        "llama-cloud-services not installed. "
        "Run: pip install llama-cloud-services"
    )


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
    standard_fte_hours: Optional[int] = Field(
        None,
        description="""Standard full-time hours per year for this contract.
        Look at the hours table and identify the most common hours value that represents
        a single full-time position (e.g., 1880, 1920, or 2080). This is typically the
        smallest non-zero hours value that appears frequently for individual positions.
        Ignore larger values that are clearly multiples (e.g., 3760, 5640, etc.).
        Default to None if unclear."""
    )


# =====================================================================
# LLAMAEXTRACT SCHEMA (Internal - for extraction only)
# =====================================================================

class YearHours(BaseModel):
    """Hours for a specific year - used internally for LlamaExtract."""
    year: str = Field(
        description="Year number as string: '1' for Base Period, '2' for Option Year 1, etc."
    )
    hours: int = Field(
        description="Hours worked in this year (e.g., 1880 for full-time, 0 for not working)"
    )


class PositionExtract(BaseModel):
    """Position model for LlamaExtract - includes List[YearHours]."""

    labor_category: str = Field(
        description="Job title or role name (e.g., 'Senior Software Engineer', 'Project Manager III')"
    )

    description: Optional[str] = Field(
        None,
        description="Full job description including responsibilities, requirements, qualifications, and duties. Extract complete text, not summary."
    )

    experience: Optional[int] = Field(
        None,
        description="Years of experience required (as integer). Parse from phrases like 'Six (6) years' → 6, 'Minimum 10 years' → 10."
    )

    location: Optional[str] = Field(
        None,
        description="Specific work location for this position"
    )

    hours: Optional[int] = Field(
        None,
        description="Annual hours for single-year contracts (e.g., 1880 for full-time, 940 for part-time). LEGACY FIELD."
    )

    hours_per_year: Optional[List[YearHours]] = Field(
        None,
        description="""Hours worked per year in multi-year contracts.
        Extract as a list where each item has 'year' and 'hours'.
        Year "1" = Base Period, "2" = Option Year 1, "3" = Option Year 2, etc.
        Example: [{"year": "1", "hours": 1880}, {"year": "2", "hours": 1880}, {"year": "3", "hours": 0}]"""
    )


class DocumentMetadataExtract(BaseModel):
    """Document metadata for LlamaExtract."""

    project_name: Optional[str] = Field(
        None,
        description="Project or contract name"
    )
    location: Optional[str] = Field(
        None,
        description="Primary work location, city, state, or region"
    )
    base_years: Optional[int] = Field(
        None,
        description="Number of base period years (typically 1)"
    )
    option_years: Optional[int] = Field(
        None,
        description="Number of option years (e.g., 4 for Option Year 1-4)"
    )
    total_years: Optional[int] = Field(
        None,
        description="Total contract duration in years (base + option)"
    )
    standard_fte_hours: Optional[int] = Field(
        None,
        description="""Standard full-time hours per year for this contract.
        Look at the hours table and identify the most common hours value that represents
        a single full-time position (e.g., 1880, 1920, or 2080). This is typically the
        smallest non-zero hours value that appears frequently for individual positions.
        Ignore larger values that are clearly multiples (e.g., 3760, 5640, etc.).
        Default to None if unclear."""
    )


class GovernmentProposalExtraction(BaseModel):
    """Complete extraction schema for LlamaExtract."""

    metadata: DocumentMetadataExtract = Field(
        description="Document-level information extracted from headers, cover page, and overview sections"
    )
    positions: List[PositionExtract] = Field(
        description="All job positions/labor categories found in the document"
    )


def _convert_to_job_description(position: PositionExtract, doc_location: Optional[str] = None) -> JobDescription:
    """
    Convert PositionExtract (with List[YearHours]) to JobDescription (with dict[str, int]).

    This bridges the gap between LlamaExtract schema (List[YearHours])
    and the existing JobDescription model (dict[str, int]).

    Args:
        position: PositionExtract from LlamaExtract
        doc_location: Document-level location to use if position has no location

    Returns:
        JobDescription object with correct field types
    """
    # Convert hours_per_year from List[YearHours] to dict[str, int]
    hours_per_year_dict = None
    if position.hours_per_year:
        hours_per_year_dict = {yh.year: yh.hours for yh in position.hours_per_year}

    # Use doc-level location if position has no location
    location = position.location or doc_location

    return JobDescription(
        labor_category=position.labor_category,
        description=position.description,
        experience=position.experience,
        location=location,
        hours=position.hours,
        hours_per_year=hours_per_year_dict
    )


def extract_with_llamaextract(pdf_path: str, mode: str = "fast") -> GovernmentProposalExtraction:
    """
    Extract structured data from PDF using LlamaExtract API.

    Args:
        pdf_path: Path to the PDF file
        mode: Extraction mode - "fast" or "thorough"

    Returns:
        GovernmentProposalExtraction object with all data

    Raises:
        ValueError: If LLAMA_CLOUD_API_KEY not found or extraction fails
    """
    # Get API key from settings
    api_key = settings.LLAMA_CLOUD_API_KEY
    if not api_key:
        raise ValueError(
            "LLAMA_CLOUD_API_KEY not found in settings. "
            "Please set it in your .env file."
        )

    # Initialize LlamaExtract
    extractor = LlamaExtract(api_key=api_key)

    # Create config
    extraction_mode = ExtractMode.FAST if mode == "fast" else ExtractMode.THOROUGH
    config = ExtractConfig(extraction_mode=extraction_mode)

    # Extract with Pydantic model CLASS
    extract_run = extractor.extract(
        GovernmentProposalExtraction,
        config,
        pdf_path
    )

    # Access the .data property to get the actual extracted data
    extraction = extract_run.data

    if not isinstance(extraction, GovernmentProposalExtraction):
        if isinstance(extraction, dict):
            extraction = GovernmentProposalExtraction(**extraction)
        else:
            raise ValueError(f"Unexpected data type from LlamaExtract: {type(extraction)}")

    return extraction


async def parse_documents_to_dataframe(document_paths: List[str]) -> pd.DataFrame:
    """
    Parse multiple documents and extract all job descriptions into a DataFrame using LlamaExtract.

    Args:
        document_paths: List of paths to PDF documents

    Returns:
        pandas DataFrame with columns:
        - labor_category, description, experience, location, hours, hours_per_year (job-level)
        - base_years, option_years, total_years, project_name (document-level, same for all rows)
        One row per job description found across all documents
    """
    all_jds: List[JobDescription] = []
    all_metadata_list: List[DocumentMetadata] = []

    print(f"\n{'='*60}")
    print(f"Parsing {len(document_paths)} document(s) with LlamaExtract")
    print(f"{'='*60}")

    for doc_path in document_paths:
        doc_name = Path(doc_path).name
        print(f"\nProcessing: {doc_name}")

        try:
            # Extract everything in one pass using LlamaExtract
            print(f"  Extracting with LlamaExtract...", end=" ")
            extraction = extract_with_llamaextract(doc_path, mode="fast")

            # Convert metadata
            doc_metadata = DocumentMetadata(
                location=extraction.metadata.location,
                project_name=extraction.metadata.project_name,
                base_years=extraction.metadata.base_years,
                option_years=extraction.metadata.option_years,
                total_years=extraction.metadata.total_years,
                standard_fte_hours=extraction.metadata.standard_fte_hours
            )

            doc_location = doc_metadata.location

            print(f"✓")
            print(f"  Positions found: {len(extraction.positions)}")

            if doc_location:
                print(f"  Location: {doc_location}")

            if doc_metadata.base_years or doc_metadata.option_years or doc_metadata.total_years:
                print(f"  Contract years: base={doc_metadata.base_years}, option={doc_metadata.option_years}, total={doc_metadata.total_years}")

            # Convert positions from PositionExtract to JobDescription
            for position in extraction.positions:
                jd = _convert_to_job_description(position, doc_location)
                all_jds.append(jd)
                all_metadata_list.append(doc_metadata)

        except Exception as e:
            print(f"  ❌ Error processing {doc_path}: {e}")
            import traceback
            traceback.print_exc()
            continue

    print(f"\n{'='*60}")
    print(f"✓ Total job descriptions found: {len(all_jds)}")
    print(f"{'='*60}\n")

    # Convert to DataFrame
    if not all_jds:
        # Create empty DataFrame with correct columns
        df = pd.DataFrame(columns=[
            "labor_category", "description", "experience", "location", "hours", "hours_per_year",
            "base_years", "option_years", "total_years", "project_name", "standard_fte_hours"
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
                "project_name": metadata.project_name,
                "standard_fte_hours": metadata.standard_fte_hours
            }
            for jd, metadata in zip(all_jds, all_metadata_list)
        ])

    print(f"✓ Extracted {len(df)} job descriptions\n")
    return df
