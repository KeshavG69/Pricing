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
        description="State name only for this position (e.g., 'Virginia', 'California', 'Texas'). Extract only the state, not city. Use full state name, not abbreviation."
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
        description="Primary state name only (e.g., 'Virginia', 'California', 'Texas'). Extract only the state, not city. Use full state name, not abbreviation."
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


def _convert_to_job_description(
    position: PositionExtract,
    doc_metadata: DocumentMetadata
) -> JobDescription:
    """
    Convert PositionExtract to JobDescription with intelligent hour distribution.

    Handles two scenarios:
    1. hours_per_year exists (year columns in PDF) → use directly
    2. hours exists but no hours_per_year (total hours only) → distribute across years

    Args:
        position: PositionExtract from LlamaExtract
        doc_metadata: Document metadata (location, years, FTE hours)

    Returns:
        JobDescription object with hours_per_year populated
    """
    # Convert hours_per_year from List[YearHours] to dict[str, int]
    hours_per_year_dict = None

    if position.hours_per_year:
        # Case 1: LlamaExtract found year columns (Personnel Qualifications format)
        # System already works correctly - use directly
        hours_per_year_dict = {yh.year: yh.hours for yh in position.hours_per_year}

    elif position.hours and not position.hours_per_year and doc_metadata.total_years and doc_metadata.total_years > 1:
        # Case 2: Only total hours + multi-year contract (SeaPort format)
        # Distribute hours evenly across years
        # Backend split_multi_year_position() will handle creating multiple people if needed
        fte_hours = doc_metadata.standard_fte_hours or 1920

        hours_per_year_dict = _distribute_hours_across_years(
            total_hours=position.hours,
            total_years=doc_metadata.total_years,
            fte_hours=fte_hours
        )

        # Keep original hours field for backward compatibility
        # Frontend can display total hours if needed

    # Use doc-level location if position has no location
    location = position.location or doc_metadata.location

    return JobDescription(
        labor_category=position.labor_category,
        description=position.description,
        experience=position.experience,
        location=location,
        hours=position.hours,
        hours_per_year=hours_per_year_dict
    )


def _distribute_hours_across_years(
    total_hours: int,
    total_years: int,
    fte_hours: int = 1920
) -> Dict[str, int]:
    """
    Distribute total hours across contract years based on people-per-year calculation.

    Strategy: Calculate how many people work per year, then distribute accordingly.

    Logic:
    1. total_ftes = total_hours / fte_hours
    2. people_per_year = ceil(total_ftes / total_years)
    3. hours_per_year = people_per_year × fte_hours
    4. Fill each year with hours_per_year until hours run out

    Args:
        total_hours: Total hours for entire contract
        total_years: Total contract duration in years
        fte_hours: Standard FTE hours per year (default 1920)

    Returns:
        Dict mapping year string to hours

    Examples:
        # Case 1: Single person across years
        5120 hours, 3 years, FTE=1920
        → total_ftes = 5120/1920 = 2.67
        → people_per_year = ceil(2.67/3) = 1
        → hours_per_year = 1×1920 = 1920
        → Result: {"1": 1920, "2": 1920, "3": 1280}

        # Case 2: Multiple people per year
        10240 hours, 3 years, FTE=1920
        → total_ftes = 10240/1920 = 5.33
        → people_per_year = ceil(5.33/3) = 2
        → hours_per_year = 2×1920 = 3840
        → Result: {"1": 3840, "2": 3840, "3": 2560}
        Backend splits: 3840→2 people, 3840→2 people, 2560→2 people
    """
    import math

    # Calculate how many people work per year
    total_ftes = total_hours / fte_hours
    people_per_year = math.ceil(total_ftes / total_years)
    hours_per_year = people_per_year * fte_hours

    # Distribute hours year by year
    hours_dict = {}
    remaining = total_hours

    for year in range(1, total_years + 1):
        year_hours = min(remaining, hours_per_year)
        hours_dict[str(year)] = year_hours
        remaining -= year_hours

        if remaining <= 0:
            # Fill remaining years with 0
            for y in range(year + 1, total_years + 1):
                hours_dict[str(y)] = 0
            break

    return hours_dict


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
                jd = _convert_to_job_description(position, doc_metadata)
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
