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
    months_per_year: Optional[Dict[str, int]] = Field(
        None,
        description="Month duration per year (1-12). Key is year number as string. None if not specified."
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


class YearMonths(BaseModel):
    """Months for a specific year - used internally for LlamaExtract."""
    year: str = Field(
        description="Year number as string: '1' for Base Period, '2' for Option Year 1, etc."
    )
    months: int = Field(
        description="Number of months in this year (1-12). Default to 12 if not specified."
    )


class YearAmount(BaseModel):
    """Dollar amount for a specific year - used for ODCs like travel."""
    year: str = Field(
        description="Year number as string: '1' for Base Period, '2' for Option Year 1, etc."
    )
    amount: float = Field(
        description="Dollar amount for this year (e.g., 299542.60)"
    )


class ODCExtract(BaseModel):
    """Other Direct Cost item extracted from document."""
    category: str = Field(
        description="ODC category (e.g., 'Travel', 'Materials', 'Equipment', 'Software', 'Supplies')"
    )
    description: Optional[str] = Field(
        None,
        description="Description of the ODC item (e.g., 'Government Estimated Travel Amount')"
    )
    amount_per_year: List[YearAmount] = Field(
        description="""Dollar amounts per year.
        Year "1" = Base Period, "2" = Option Year 1, "3" = Option Year 2, etc.
        Example: [{"year": "1", "amount": 299542.60}, {"year": "2", "amount": 308528.88}]"""
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
    months_per_year: Optional[List[YearMonths]] = Field(
        None,
        description="""Month duration for each year (1-12 months). Extract from phrases like:
        - "8-month base period" → [{"year": "1", "months": 8}]
        - "6 month option year 1" → [{"year": "2", "months": 6}]
        - "12 month option year 2" → [{"year": "3", "months": 12}]
        Year "1" = Base Period, "2" = Option Year 1, "3" = Option Year 2, etc.
        Extract as a list where each item has 'year' and 'months'.
        Default to None if not specified (will use 12 months)."""
    )


class GovernmentProposalExtraction(BaseModel):
    """Complete extraction schema for LlamaExtract."""

    metadata: DocumentMetadataExtract = Field(
        description="Document-level information extracted from headers, cover page, and overview sections"
    )
    positions: List[PositionExtract] = Field(
        description="All job positions/labor categories found in the document"
    )
    odcs: Optional[List[ODCExtract]] = Field(
        None,
        description="""Other Direct Costs (ODCs) found in the document.
        Include Travel, Materials, Equipment, Software, Supplies, etc.
        Look for sections labeled 'Travel', 'ODCs', 'Other Direct Costs', 'Non-Labor Costs'.
        Extract amounts per period (Base Period, Option Year 1, etc.)."""
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
        # Case 1: LlamaExtract found year columns
        hours_per_year_dict = {yh.year: yh.hours for yh in position.hours_per_year}

        # If hours_per_year has fewer years than total_years, extend it
        # (e.g., only Base Period extracted but contract has Option Years)
        if doc_metadata.total_years and len(hours_per_year_dict) < doc_metadata.total_years:
            base_hours = hours_per_year_dict.get("1", position.hours or 1920)
            for year in range(1, doc_metadata.total_years + 1):
                if str(year) not in hours_per_year_dict:
                    hours_per_year_dict[str(year)] = base_hours

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


def _convert_excel_to_csv(excel_path: str) -> str:
    """
    Convert Excel file to CSV for LlamaExtract compatibility.

    Handles multiple sheets by combining them into a single CSV with sheet markers.
    Pandas automatically trims empty columns, solving the "too many columns" issue.

    Args:
        excel_path: Path to the Excel file (.xlsx or .xls)

    Returns:
        Path to the temporary CSV file
    """
    import tempfile

    excel_file = pd.ExcelFile(excel_path)
    sheet_names = excel_file.sheet_names

    print(f"  Found {len(sheet_names)} sheet(s): {sheet_names}")

    temp_csv = tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False)

    all_data = []
    for sheet_name in sheet_names:
        df = pd.read_excel(excel_file, sheet_name=sheet_name)
        print(f"    Sheet '{sheet_name}': {df.shape[0]} rows x {df.shape[1]} cols")

        # Add sheet marker if multiple sheets
        if len(sheet_names) > 1:
            marker_row = pd.DataFrame([{df.columns[0]: f"=== SHEET: {sheet_name} ==="}])
            all_data.append(marker_row)

        all_data.append(df)

    if all_data:
        combined_df = pd.concat(all_data, ignore_index=True)
        combined_df.to_csv(temp_csv.name, index=False)
        print(f"  Converted to CSV: {combined_df.shape[0]} rows x {combined_df.shape[1]} cols")

    return temp_csv.name


def extract_with_llamaextract(file_path: str, mode: str = "fast") -> GovernmentProposalExtraction:
    """
    Extract structured data from document using LlamaExtract API.

    Supports PDF, CSV, DOCX, and Excel files (xlsx/xls are converted to CSV).

    Args:
        file_path: Path to the document file
        mode: Extraction mode - "fast" or "thorough"

    Returns:
        GovernmentProposalExtraction object with all data

    Raises:
        ValueError: If LLAMA_CLOUD_API_KEY not found or extraction fails
    """
    import os

    api_key = settings.LLAMA_CLOUD_API_KEY
    if not api_key:
        raise ValueError(
            "LLAMA_CLOUD_API_KEY not found in settings. "
            "Please set it in your .env file."
        )

    # Check if file is Excel and convert to CSV
    file_ext = os.path.splitext(file_path)[1].lower()
    temp_csv_path = None

    if file_ext in ['.xlsx', '.xls']:
        print(f"  Converting Excel to CSV...")
        temp_csv_path = _convert_excel_to_csv(file_path)
        file_path = temp_csv_path

    try:
        extractor = LlamaExtract(api_key=api_key)

        extraction_mode = ExtractMode.FAST if mode == "fast" else ExtractMode.THOROUGH
        config = ExtractConfig(extraction_mode=extraction_mode)

        extract_run = extractor.extract(
            GovernmentProposalExtraction,
            config,
            file_path
        )

        extraction = extract_run.data

        if not isinstance(extraction, GovernmentProposalExtraction):
            if isinstance(extraction, dict):
                extraction = GovernmentProposalExtraction(**extraction)
            else:
                raise ValueError(f"Unexpected data type from LlamaExtract: {type(extraction)}")

        return extraction

    finally:
        # Clean up temporary CSV file
        if temp_csv_path:
            try:
                os.unlink(temp_csv_path)
            except Exception:
                pass


async def parse_documents_to_dataframe(document_paths: List[str]) -> Dict[str, any]:
    """
    Parse multiple documents and extract all job descriptions and ODCs using LlamaExtract.

    Args:
        document_paths: List of paths to documents (PDF, Excel, CSV, DOCX)

    Returns:
        Dict with:
        - 'df': pandas DataFrame with positions (labor_category, hours_per_year, etc.)
        - 'odcs': List of ODC items (travel, materials, etc.) in frontend format
    """
    all_jds: List[JobDescription] = []
    all_metadata_list: List[DocumentMetadata] = []
    all_odcs: List[Dict] = []

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

            # Convert months_per_year from List[YearMonths] to Dict[str, int]
            months_dict = None
            if extraction.metadata.months_per_year:
                months_dict = {
                    ym.year: ym.months
                    for ym in extraction.metadata.months_per_year
                }

            # Convert metadata
            doc_metadata = DocumentMetadata(
                location=extraction.metadata.location,
                project_name=extraction.metadata.project_name,
                base_years=extraction.metadata.base_years,
                option_years=extraction.metadata.option_years,
                total_years=extraction.metadata.total_years,
                standard_fte_hours=extraction.metadata.standard_fte_hours,
                months_per_year=months_dict
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

            # Convert ODCs to frontend format
            if extraction.odcs:
                print(f"  ODCs found: {len(extraction.odcs)}")
                for odc in extraction.odcs:
                    # Convert amount_per_year from List[YearAmount] to Dict[str, float]
                    amount_per_year = {
                        ya.year: ya.amount
                        for ya in odc.amount_per_year
                    }
                    all_odcs.append({
                        "id": f"odc_{len(all_odcs)}_{hash(odc.category)}",
                        "category": odc.category,
                        "description": odc.description,
                        "amount_per_year": amount_per_year,
                        "escalate": False  # Already has per-year amounts
                        # S&MH is always applied to all ODCs
                    })

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
            "base_years", "option_years", "total_years", "project_name", "standard_fte_hours", "months_per_year"
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
                "standard_fte_hours": metadata.standard_fte_hours,
                "months_per_year": metadata.months_per_year
            }
            for jd, metadata in zip(all_jds, all_metadata_list)
        ])

    print(f"✓ Extracted {len(df)} job descriptions")
    if all_odcs:
        print(f"✓ Extracted {len(all_odcs)} ODC items\n")
    else:
        print()

    return {
        "df": df,
        "odcs": all_odcs
    }
