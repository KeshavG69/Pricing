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


class TravelExtract(BaseModel):
    """Travel cost item extracted from document - SEPARATE from ODCs."""
    description: Optional[str] = Field(
        None,
        description="Description of the travel item (e.g., 'Government Estimated Travel Amount', 'Airfare', 'Per Diem')"
    )
    amount_per_year: List[YearAmount] = Field(
        description="""Dollar amounts per year.
        Year "1" = Base Period, "2" = Option Year 1, "3" = Option Year 2, etc.
        Example: [{"year": "1", "amount": 299542.60}, {"year": "2", "amount": 308528.88}]"""
    )


class ODCExtract(BaseModel):
    """Other Direct Cost item extracted from document - DOES NOT include Travel."""
    category: str = Field(
        description="ODC category (e.g., 'Materials', 'Equipment', 'Software', 'Supplies'). DO NOT use 'Travel' - that has its own section."
    )
    description: Optional[str] = Field(
        None,
        description="Description of the ODC item"
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

    ftes: Optional[int] = Field(
        1,
        description="""Number of full-time equivalents (FTEs) for this position.

        WHEN TO USE: Only extract FTE count if the table has a dedicated FTE/Count column
        AND the hours columns show per-person hours (not totals).

        WHEN NOT TO USE: If the hours columns show TOTAL hours for all FTEs combined,
        set ftes=1 (default) and extract total hours in hours_per_year.
        The backend will automatically split multi-FTE positions based on total hours.

        Examples:
        - Table shows "FTEs: 4 | Hours: 1920" → Extract ftes=4, hours=1920 (per-person)
        - Table shows "Base: 3,808 | OY1: 3,808" (no FTE column, total hours) → ftes=1, hours_per_year=[...] (totals)
        - No FTE column → Default to ftes=1"""
    )

    hours: Optional[int] = Field(
        None,
        description="""Annual hours for a SINGLE person in this position (NOT multiplied by FTE count).

        USE THIS FIELD WHEN: The document has a single "Hours" column (not year-by-year columns).
        DO NOT USE: If the document has separate columns for Base Period, Option Year 1, etc.

        Extract the per-person hours only. Examples:
        - Table shows "Hours: 1920" → Extract hours=1920 (even if FTEs=4)
        - Table shows "Annual Hours: 2080" → Extract hours=2080
        - Table has year columns → Leave hours=None, use hours_per_year instead"""
    )

    hours_per_year: Optional[List[YearHours]] = Field(
        None,
        description="""Hours per year - EXACT values from the table row (TOTAL hours, not per-person).

        ONLY USE THIS FIELD IF: The document has ACTUAL year-by-year hour columns.
        Look for column headers like: "Base Period", "BY", "Option Year 1", "OY1", "Year 1", "Year 2", etc.

        CRITICAL RULES:
        1. Each table row = ONE position extraction (even if hours vary by year)
        2. Extract EXACTLY what's in the table row - don't split into multiple positions
        3. Extract TOTAL hours shown in each year column (as-is from the table)
        4. Year "1" = Base Period/Base Year, "2" = Option Year 1, "3" = Option Year 2, etc.
        5. If document only has single "Hours" column, use 'hours' field instead

        Examples:
        - Table row: "IT Specialist/Networks | Base: 3,808 | OY1: 3,808 | OY2: 5,712 | OY3: 5,712 | OY4: 5,712"
          → Extract ONE position with: [{"year": "1", "hours": 3808}, {"year": "2", "hours": 3808}, {"year": "3", "hours": 5712}, {"year": "4", "hours": 5712}, {"year": "5", "hours": 5712}]
          → Do NOT create multiple positions just because hours change

        - Table row: "Engineer | Base: 1920 | OY1: 1920 | OY2: 1920"
          → Extract: [{"year": "1", "hours": 1920}, {"year": "2", "hours": 1920}, {"year": "3", "hours": 1920}]

        - Table row: "Specialist | Base: - | OY1: 1904 | OY2: 1904 | OY3: 1904"
          → Extract: [{"year": "1", "hours": 0}, {"year": "2", "hours": 1904}, {"year": "3", "hours": 1904}, {"year": "4", "hours": 1904}]
          → "-" or empty means 0 hours

        - Table row with single Hours column: "Analyst | Hours: 1920"
          → Leave hours_per_year=None, use 'hours' field instead"""
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
    travel: Optional[List[TravelExtract]] = Field(
        None,
        description="""Travel costs found in the document - SEPARATE from ODCs.
        Look for sections labeled 'Travel', 'Travel Expenses', 'Government Estimated Travel'.
        Extract amounts per period (Base Period, Option Year 1, etc.).
        IMPORTANT: Travel is NOT an ODC - it's a separate category."""
    )
    odcs: Optional[List[ODCExtract]] = Field(
        None,
        description="""Other Direct Costs (ODCs) found in the document - DOES NOT include Travel.
        Include Materials, Equipment, Software, Supplies, etc.
        Look for sections labeled 'ODCs', 'Other Direct Costs', 'Non-Labor Costs', 'Materials'.
        Extract amounts per period (Base Period, Option Year 1, etc.).
        IMPORTANT: Do NOT extract Travel here - Travel has its own separate field."""
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
    # Get FTE multiplier (default to 1 if not specified)
    ftes = position.ftes or 1

    # Convert hours_per_year from List[YearHours] to dict[str, int]
    hours_per_year_dict = None

    if position.hours_per_year:
        # Case 1: LlamaExtract found year columns
        # Two scenarios:
        # A) ftes > 1: Table has FTE column, hours are per-person → multiply by ftes
        # B) ftes = 1: No FTE column, hours are totals → use as-is
        if ftes > 1:
            # Multiply per-person hours by FTE count
            hours_per_year_dict = {yh.year: yh.hours * ftes for yh in position.hours_per_year}
        else:
            # Use total hours as-is
            hours_per_year_dict = {yh.year: yh.hours for yh in position.hours_per_year}

        # If hours_per_year has fewer years than total_years, extend it
        # (e.g., only Base Period extracted but contract has Option Years)
        if doc_metadata.total_years and len(hours_per_year_dict) < doc_metadata.total_years:
            base_hours = hours_per_year_dict.get("1", position.hours or 1920)
            for year in range(1, doc_metadata.total_years + 1):
                if str(year) not in hours_per_year_dict:
                    hours_per_year_dict[str(year)] = base_hours

    elif position.hours and not position.hours_per_year and doc_metadata.total_years and doc_metadata.total_years > 1:
        # Case 2: Single hours field + multi-year contract
        # The hours field represents annual hours per person
        # We need to multiply by FTE count and repeat for all years

        # Calculate hours per year (all FTEs combined)
        annual_hours = position.hours * ftes

        # Repeat the same hours for all contract years
        hours_per_year_dict = {
            str(year): annual_hours
            for year in range(1, doc_metadata.total_years + 1)
        }

        # Keep original hours field for backward compatibility
        # Frontend can display total hours if needed

    # Use doc-level location if position has no location
    location = position.location or doc_metadata.location

    # Multiply legacy hours field by FTE count
    total_hours = (position.hours * ftes) if position.hours else None

    return JobDescription(
        labor_category=position.labor_category,
        description=position.description,
        experience=position.experience,
        location=location,
        hours=total_hours,
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


def extract_with_llamaextract(file_path: str, mode: str = "premium") -> GovernmentProposalExtraction:
    """
    Extract structured data from document using LlamaExtract API.

    Supports PDF, CSV, DOCX, and Excel files (xlsx/xls are converted to CSV).

    Args:
        file_path: Path to the document file
        mode: Extraction mode - "premium" (default, high quality), "balanced", "fast", or "multimodal"

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
        # Create LlamaExtract client with increased timeout
        # NOTE: verify=False disables SSL certificate verification (useful for SSL hostname mismatch errors)
        # WARNING: Only use verify=False for testing/development. Re-enable in production.
        extractor = LlamaExtract(
            api_key=api_key,
            httpx_timeout=300.0,  # 5 minutes timeout for HTTP requests
            max_timeout=3000,  # 50 minutes max wait for extraction job
            verify=False  # Disable SSL verification to bypass certificate hostname mismatch
        )

        # Map mode string to ExtractMode enum
        mode_mapping = {
            "balanced": ExtractMode.BALANCED,
            "fast": ExtractMode.FAST,
            "premium": ExtractMode.PREMIUM,
            "multimodal": ExtractMode.MULTIMODAL
        }
        extraction_mode = mode_mapping.get(mode.lower(), ExtractMode.BALANCED)
        config = ExtractConfig(extraction_mode=extraction_mode)

        # Retry logic for connection timeouts
        max_retries = 3
        for attempt in range(max_retries):
            try:
                extract_run = extractor.extract(
                    GovernmentProposalExtraction,
                    config,
                    file_path
                )
                break  # Success, exit retry loop
            except TimeoutError:
                if attempt < max_retries - 1:
                    print(f"  Timeout on attempt {attempt + 1}/{max_retries}, retrying...")
                    import time
                    time.sleep(5)  # Wait 5 seconds before retry
                else:
                    raise  # Final attempt failed, re-raise

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
    Parse multiple documents and extract all job descriptions, Travel, and ODCs using LlamaExtract.

    Args:
        document_paths: List of paths to documents (PDF, Excel, CSV, DOCX)

    Returns:
        Dict with:
        - 'df': pandas DataFrame with positions (labor_category, hours_per_year, etc.)
        - 'travel': List of Travel items in frontend format
        - 'odcs': List of ODC items (materials, equipment, etc.) in frontend format
    """
    all_jds: List[JobDescription] = []
    all_metadata_list: List[DocumentMetadata] = []
    all_travel: List[Dict] = []
    all_odcs: List[Dict] = []

    print(f"\n{'='*60}")
    print(f"Parsing {len(document_paths)} document(s) with LlamaExtract")
    print(f"{'='*60}")

    for doc_path in document_paths:
        doc_name = Path(doc_path).name
        print(f"\nProcessing: {doc_name}")

        try:
            # Extract everything in one pass using LlamaExtract
            print(f"  Extracting with LlamaExtract (premium mode)...", end=" ")
            extraction = extract_with_llamaextract(doc_path, mode="premium")

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

            # Convert Travel to frontend format (SEPARATE from ODCs)
            if extraction.travel:
                print(f"  Travel items found: {len(extraction.travel)}")
                for travel in extraction.travel:
                    # Convert amount_per_year from List[YearAmount] to Dict[str, float]
                    amount_per_year = {
                        ya.year: ya.amount
                        for ya in travel.amount_per_year
                    }
                    all_travel.append({
                        "id": f"travel_{len(all_travel)}_{hash(travel.description or 'travel')}",
                        "description": travel.description,
                        "amount_per_year": amount_per_year,
                        "escalate": False  # Already has per-year amounts
                        # G&A Rate is applied to Travel (NOT S&MH)
                    })

            # Convert ODCs to frontend format (SEPARATE from Travel)
            if extraction.odcs:
                print(f"  ODC items found: {len(extraction.odcs)}")
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
                        # S&MH Rate is applied to ODCs (NOT G&A)
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
    if all_travel:
        print(f"✓ Extracted {len(all_travel)} Travel items")
    if all_odcs:
        print(f"✓ Extracted {len(all_odcs)} ODC items")
    print()

    # Detect and extract extension periods
    # Extensions are years beyond the regular contract period (base + options)
    extensions = []
    total_years_from_metadata = df['total_years'].iloc[0] if not df.empty and 'total_years' in df.columns else 0

    if total_years_from_metadata > 0:
        # Collect all years that have data
        years_with_data = set()

        # Check travel items
        for travel in all_travel:
            if travel.get("amount_per_year"):
                for year_str in travel["amount_per_year"].keys():
                    if year_str.isdigit():
                        years_with_data.add(int(year_str))

        # Check ODC items
        for odc in all_odcs:
            if odc.get("amount_per_year"):
                for year_str in odc["amount_per_year"].keys():
                    if year_str.isdigit():
                        years_with_data.add(int(year_str))

        # Check position hours_per_year
        for jd in all_jds:
            if jd.hours_per_year:
                for year_str in jd.hours_per_year.keys():
                    if year_str.isdigit():
                        years_with_data.add(int(year_str))

        # Find extension years (years beyond total_years)
        extension_years = sorted([y for y in years_with_data if y > total_years_from_metadata])

        if extension_years:
            print(f"⚠️  Detected extension periods beyond year {total_years_from_metadata}: {extension_years}")

            for ext_year in extension_years:
                ext_year_str = str(ext_year)

                # Try to determine duration from description or default to 6 months
                duration_months = 6  # Default
                description_parts = []

                # Check travel descriptions for duration hints
                for travel in all_travel:
                    if ext_year_str in travel.get("amount_per_year", {}):
                        desc = travel.get("description", "")
                        if desc and "month" in desc.lower():
                            description_parts.append(desc)
                            # Try to extract month count (e.g., "6-Month" -> 6)
                            import re
                            month_match = re.search(r'(\d+)[\s-]*month', desc, re.IGNORECASE)
                            if month_match:
                                duration_months = int(month_match.group(1))

                # Create extension entry
                extension = {
                    "year": ext_year,
                    "label": f"{duration_months} Month Extension" if duration_months != 12 else "12 Month Extension",
                    "duration_months": duration_months,
                    "description": " / ".join(description_parts) if description_parts else f"Extension Period {ext_year}"
                }
                extensions.append(extension)
                print(f"   Extension {ext_year}: {extension['label']}")

    # Add extension hours to positions and update months_per_year
    if extensions and not df.empty:
        print(f"\n⚙️  Adding extension hours to positions...")

        # Get the standard FTE hours (default to 1920 if not set)
        standard_fte_hours = df['standard_fte_hours'].iloc[0] if 'standard_fte_hours' in df.columns else 1920

        # Update months_per_year for each extension
        for ext in extensions:
            ext_year = ext['year']
            ext_months = ext['duration_months']

            # Update months_per_year column for all rows
            for idx in df.index:
                months_dict = df.at[idx, 'months_per_year']
                if months_dict is None:
                    months_dict = {}
                    df.at[idx, 'months_per_year'] = months_dict

                # Add extension month duration
                months_dict[str(ext_year)] = ext_months
                df.at[idx, 'months_per_year'] = months_dict

            # Calculate prorated hours for extension period
            # For 6 months: (6/12) * standard_fte_hours = 960 hours
            prorated_hours = int((ext_months / 12) * standard_fte_hours)

            print(f"   Year {ext_year} ({ext_months} months): Adding {prorated_hours} hours to each position")

            # Add extension year hours to each position's hours_per_year
            for idx in df.index:
                hours_per_year = df.loc[idx, 'hours_per_year']
                if hours_per_year and isinstance(hours_per_year, dict):
                    # Add prorated hours for extension year
                    hours_per_year[str(ext_year)] = prorated_hours
                    df.at[idx, 'hours_per_year'] = hours_per_year

    return {
        "df": df,
        "travel": all_travel,
        "odcs": all_odcs,
        "extensions": extensions  # New field
    }
