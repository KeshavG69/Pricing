"""GSA Contract parsing using LlamaExtract API."""

from typing import List, Optional
from pydantic import BaseModel, Field

from app.settings import settings
from client.jd_parser import _convert_excel_to_csv

try:
    from llama_cloud_services import LlamaExtract
    from llama_cloud import ExtractConfig, ExtractMode
except ImportError:
    raise ImportError(
        "llama-cloud-services not installed. "
        "Run: pip install llama-cloud-services"
    )


# =====================================================================
# LLAMAEXTRACT SCHEMA
# =====================================================================

class YearRate(BaseModel):
    """Hourly rate for a specific contract year."""
    year: str = Field(description="Year number: '1', '2', '3', etc.")
    rate: float = Field(description="Hourly rate in dollars (e.g., 201.23)")


class LaborCategoryExtract(BaseModel):
    """Labor category from GSA contract."""

    sin: Optional[str] = Field(None, description="Special Item Number (e.g., '54151S')")
    title: str = Field(description="Labor category title (e.g., 'Program Manager Senior')")
    description: Optional[str] = Field(None, description="Job description")
    education: Optional[str] = Field(None, description="Minimum education (e.g., 'Bachelors')")
    experience: Optional[str] = Field(None, description="Minimum years of experience (e.g., '5')")
    rates_per_year: List[YearRate] = Field(
        description="Hourly rates per year: [{'year': '1', 'rate': 201.23}, ...]"
    )


class GSAContractExtraction(BaseModel):
    """Extraction schema for GSA contract."""

    contract_number: Optional[str] = Field(None, description="GSA contract number")
    contract_start_date: Optional[str] = Field(None, description="Contract start date")
    contract_end_date: Optional[str] = Field(None, description="Contract end date")
    company_name: Optional[str] = Field(None, description="Company name")
    labor_categories: List[LaborCategoryExtract] = Field(
        description="All labor categories with rates"
    )


# =====================================================================
# HELPER FUNCTIONS
# =====================================================================

def _convert_rtf_to_txt(rtf_path: str) -> str:
    """
    Convert RTF file to TXT for LlamaExtract compatibility.

    Args:
        rtf_path: Path to the RTF file

    Returns:
        Path to temporary TXT file
    """
    import subprocess
    import tempfile

    temp_txt = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
    temp_txt.close()

    try:
        # Use textutil (macOS) to convert RTF to TXT
        subprocess.run(
            ['textutil', '-convert', 'txt', '-output', temp_txt.name, rtf_path],
            check=True,
            capture_output=True
        )
        print(f"  Converted RTF to TXT: {temp_txt.name}")
        return temp_txt.name
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Fallback: try striprtf library
        try:
            from striprtf.striprtf import rtf_to_text
            with open(rtf_path, 'r', encoding='utf-8', errors='ignore') as f:
                rtf_content = f.read()
            txt_content = rtf_to_text(rtf_content)
            with open(temp_txt.name, 'w', encoding='utf-8') as f:
                f.write(txt_content)
            print(f"  Converted RTF to TXT (striprtf): {temp_txt.name}")
            return temp_txt.name
        except ImportError:
            raise ValueError("Cannot convert RTF. Install striprtf: pip install striprtf")


# =====================================================================
# MAIN FUNCTION
# =====================================================================

def parse_gsa_contract(file_path: str) -> dict:
    """
    Parse GSA contract and return data for MongoDB storage.

    Args:
        file_path: Path to GSA contract (PDF, Excel, or RTF)

    Returns:
        Dict with contract_number, dates, labor_categories, needs_date
    """
    import os

    api_key = settings.LLAMA_CLOUD_API_KEY
    if not api_key:
        raise ValueError("LLAMA_CLOUD_API_KEY not found")

    file_ext = os.path.splitext(file_path)[1].lower()
    temp_file_path = None

    # Handle Excel files
    if file_ext in ['.xlsx', '.xls']:
        print(f"  Converting Excel to CSV...")
        temp_file_path = _convert_excel_to_csv(file_path)
        file_path = temp_file_path

    # Handle RTF files
    elif file_ext == '.rtf':
        print(f"  Converting RTF to TXT...")
        temp_file_path = _convert_rtf_to_txt(file_path)
        file_path = temp_file_path

    try:
        extractor = LlamaExtract(api_key=api_key)
        config = ExtractConfig(extraction_mode=ExtractMode.PREMIUM)

        extract_run = extractor.extract(
            GSAContractExtraction,
            config,
            file_path
        )

        extraction = extract_run.data
        if isinstance(extraction, dict):
            extraction = GSAContractExtraction(**extraction)

        # Convert to simple storage format
        labor_categories = []
        for i, lcat in enumerate(extraction.labor_categories):
            rates_by_year = {yr.year: yr.rate for yr in lcat.rates_per_year}
            labor_categories.append({
                "lcat_id": f"lcat_{i}",
                "sin": lcat.sin,
                "title": lcat.title,
                "description": lcat.description,
                "education": lcat.education,
                "experience": lcat.experience,
                "rates_by_year": rates_by_year
            })

        # Parse dates
        start_date = _parse_date(extraction.contract_start_date)
        end_date = _parse_date(extraction.contract_end_date)

        return {
            "contract_number": extraction.contract_number,
            "contract_start_date": start_date,
            "contract_end_date": end_date,
            "company_name": extraction.company_name,
            "labor_categories": labor_categories,
            "needs_date": start_date is None
        }

    finally:
        if temp_file_path:
            try:
                os.unlink(temp_file_path)
            except Exception:
                pass


def _parse_date(date_str: Optional[str]) -> Optional[str]:
    """Parse date string to ISO format."""
    if not date_str:
        return None
    try:
        from dateutil import parser
        return parser.parse(date_str).strftime("%Y-%m-%d")
    except Exception:
        return date_str
