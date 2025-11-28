"""
Excel export router for generating government contract cost proposals.

Provides endpoints to:
1. Generate Excel from job data (JSON input)
2. Generate Excel from uploaded documents (full pipeline)
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Dict, Any
from pathlib import Path
from pydantic import BaseModel, Field
import tempfile
import shutil
from io import BytesIO
from datetime import datetime

from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents
from client.excel_generator import ExcelGenerator
from main import build_project_data_from_dataframe

router = APIRouter()


class ProjectConfig(BaseModel):
    """Project configuration for cost proposal generation."""
    solicitation_number: str = Field(..., description="Solicitation number (e.g., N0017825R3013)")
    prime_contractor_name: str = Field(..., description="Prime contractor company name")
    subcontractor_names: List[str] = Field(default_factory=list, description="List of subcontractor names")
    dcaa_contact: str = Field(default="", description="DCAA point of contact information")
    total_years: int = Field(..., ge=1, le=10, description="Total contract years (1-10)")
    base_years: int = Field(..., ge=1, description="Number of base years")

    # Escalation rates (year-over-year wage increases)
    escalation_rates: Dict[str, float] = Field(
        ...,
        description="Year-over-year escalation rates (e.g., {'1_to_2': 0.0272, '2_to_3': 0.0299})"
    )

    # Indirect rates for FBLR calculation
    indirect_rates: Dict[str, float] = Field(
        ...,
        description="Indirect rates: {'fringe': 0.247, 'oh': 0.0711, 'ga': 0.2243}"
    )

    # Pass-through rates for managing subcontractors
    passthrough_rates: Dict[str, float] = Field(
        ...,
        description="Pass-through rates: {'smh': 0.0665, 'ga': 0.0}"
    )

    # Fee rates (profit margins)
    fee_rates: Dict[str, float] = Field(
        ...,
        description="Fee rates: {'prime_labor': 0.08, 'sub_labor': 0.0126}"
    )

    # G&A adder for ODCs
    ga_adder_rate: float = Field(..., description="G&A adder rate for ODCs (e.g., 0.2212)")

    # Subcontractors with labor categories and rates
    subcontractors: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of subcontractor data with labor categories and rates"
    )

    # Other Direct Costs
    odcs: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of ODCs with category, amount, escalate flag, and apply_adder flag"
    )

    # Optional settings
    include_rate_table: bool = Field(
        default=True,
        description="Include Sheet 2 with subcontractor rate table"
    )


class ExcelGenerationRequest(BaseModel):
    """Request body for generating Excel from job data."""
    jobs: List[Dict[str, Any]] = Field(..., description="List of job records with wage data")
    project_config: ProjectConfig = Field(..., description="Project configuration")


@router.post("/generate-from-data")
async def generate_excel_from_data(request: ExcelGenerationRequest):
    """
    Generate Excel cost proposal from pre-processed job data.

    Use this endpoint when you already have job data with wage information
    (e.g., from the /api/pricing/process endpoint).

    Args:
        request: Job data and project configuration

    Returns:
        Excel file as downloadable attachment

    Example:
        ```json
        {
          "jobs": [
            {
              "labor_category": "Program Manager",
              "selected_wage": 216220,
              "hours": 1880,
              ...
            }
          ],
          "project_config": {
            "solicitation_number": "N0017825R3013",
            "prime_contractor_name": "Your Company",
            "total_years": 6,
            "base_years": 1,
            "escalation_rates": {"1_to_2": 0.0272, ...},
            "indirect_rates": {"fringe": 0.247, "oh": 0.0711, "ga": 0.2243},
            ...
          }
        }
        ```
    """
    try:
        import pandas as pd

        # Convert jobs list to DataFrame
        df = pd.DataFrame(request.jobs)

        # Build project data structure
        project_data = build_project_data_from_dataframe(
            df,
            request.project_config.model_dump()
        )

        # Generate Excel workbook
        generator = ExcelGenerator()
        workbook = generator.generate_cost_proposal(project_data)

        # Save to BytesIO buffer
        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        # Generate filename with timestamp
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"cost_proposal_{request.project_config.solicitation_number}_{timestamp}.xlsx"

        # Return as downloadable file
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate Excel: {str(e)}"
        )


@router.post("/generate-from-documents")
async def generate_excel_from_documents(
    files: List[UploadFile] = File(..., description="Document files to parse (PDF, DOCX, etc.)"),
    solicitation_number: str = File(..., description="Solicitation number"),
    prime_contractor_name: str = File(..., description="Prime contractor name"),
    total_years: int = File(..., description="Total contract years"),
    base_years: int = File(..., description="Number of base years"),
    # Note: Complex objects need to be passed as JSON strings in multipart form data
):
    """
    Generate Excel cost proposal from uploaded documents (full pipeline).

    This endpoint runs the complete pipeline:
    1. Parse documents → Extract job descriptions
    2. Fetch wage data for each position
    3. Generate professional Excel cost proposal

    Use this for a complete end-to-end workflow from documents to Excel.

    Note: Due to multipart form limitations, complex configuration objects
    should be passed as JSON strings. For more control, use the two-step approach:
    1. POST /api/pricing/process (get job data)
    2. POST /api/excel/generate-from-data (generate Excel)

    Args:
        files: Document files containing job descriptions
        solicitation_number: Contract solicitation number
        prime_contractor_name: Your company name
        total_years: Total contract years (e.g., 6)
        base_years: Base period years (e.g., 1)

    Returns:
        Excel file as downloadable attachment
    """
    temp_dir = None

    try:
        # Create temp directory for uploaded files
        temp_dir = Path(tempfile.mkdtemp())
        file_paths = []

        # Save uploaded files
        for file in files:
            file_path = temp_dir / file.filename
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
            file_paths.append(str(file_path))

        # Step 1: Parse documents to DataFrame
        df = await parse_documents_to_dataframe(file_paths)

        if len(df) == 0:
            raise HTTPException(
                status_code=400,
                detail="No job descriptions found in uploaded documents"
            )

        # Step 2: Process with agents to get wage data
        final_df = await process_dataframe_with_agents(df, max_workers=10)

        # Step 3: Build default project configuration
        # User should ideally provide this via /generate-from-data endpoint
        option_years = total_years - base_years

        # Default escalation rates (2.5% annually)
        escalation_rates = {}
        for year in range(1, total_years):
            escalation_rates[f"{year}_to_{year+1}"] = 0.025

        project_config = {
            'solicitation_number': solicitation_number,
            'prime_contractor_name': prime_contractor_name,
            'subcontractor_names': [],
            'dcaa_contact': '',
            'total_years': total_years,
            'base_years': base_years,
            'option_years': option_years,
            'escalation_rates': escalation_rates,
            'indirect_rates': {
                'fringe': 0.247,
                'oh': 0.0711,
                'ga': 0.2243
            },
            'passthrough_rates': {
                'smh': 0.0665,
                'ga': 0.0
            },
            'fee_rates': {
                'prime_labor': 0.08,
                'sub_labor': 0.0126
            },
            'ga_adder_rate': 0.2212,
            'subcontractors': [],
            'odcs': []
        }

        # Step 4: Build project data structure
        project_data = build_project_data_from_dataframe(final_df, project_config)

        # Step 5: Generate Excel
        generator = ExcelGenerator()
        workbook = generator.generate_cost_proposal(project_data)

        # Save to BytesIO buffer
        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        # Generate filename
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"cost_proposal_{solicitation_number}_{timestamp}.xlsx"

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate Excel from documents: {str(e)}"
        )

    finally:
        # Clean up temp directory
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


@router.get("/template")
async def get_project_config_template():
    """
    Get a template/example of the ProjectConfig structure.

    Use this to understand the required format for the project configuration
    when calling /generate-from-data.

    Returns:
        JSON template with example values and descriptions
    """
    template = {
        "jobs": [
            {
                "labor_category": "Program Manager",
                "description": "Ten (10) years of professional management experience...",
                "experience": 10,
                "location": "National",
                "hours": 1880,
                "hours_per_year": "{'1': 1880, '2': 1880, '3': 1880, '4': 1880, '5': 1880, '6': 1880}",
                "selected_wage": 216220,
                "selected_percentile": "75th",
                "wage_10th": 104450,
                "wage_25th": 134350,
                "wage_50th": 171200,
                "wage_75th": 216220,
                "wage_90th": None
            }
        ],
        "project_config": {
            "solicitation_number": "N0017825R3013",
            "prime_contractor_name": "Your Company Inc.",
            "subcontractor_names": ["Subcontractor A", "Subcontractor B"],
            "dcaa_contact": "contact@example.com",
            "total_years": 6,
            "base_years": 1,
            "escalation_rates": {
                "1_to_2": 0.0272,
                "2_to_3": 0.0299,
                "3_to_4": 0.0280,
                "4_to_5": 0.0285,
                "5_to_6": 0.0290
            },
            "indirect_rates": {
                "fringe": 0.247,
                "oh": 0.0711,
                "ga": 0.2243
            },
            "passthrough_rates": {
                "smh": 0.0665,
                "ga": 0.0
            },
            "fee_rates": {
                "prime_labor": 0.08,
                "sub_labor": 0.0126
            },
            "ga_adder_rate": 0.2212,
            "subcontractors": [
                {
                    "name": "Subcontractor A",
                    "labor_categories": [
                        {
                            "labor_category": "Systems Administrator",
                            "ecraft_code": "SYSTEMS ADMINISTRATOR II",
                            "year_1_rate": 107.33,
                            "year_1_hours": 1880,
                            "year_2_rate": 110.25,
                            "year_2_hours": 1880,
                            "year_3_rate": 113.54,
                            "year_3_hours": 1880,
                            "year_4_rate": 116.72,
                            "year_4_hours": 1880,
                            "year_5_rate": 120.05,
                            "year_5_hours": 1880,
                            "year_6_rate": 123.53,
                            "year_6_hours": 1880
                        }
                    ]
                }
            ],
            "odcs": [
                {
                    "category": "Travel",
                    "amount_year_1": 5000,
                    "escalate": False,
                    "apply_adder": True
                },
                {
                    "category": "Equipment",
                    "amount_year_1": 10000,
                    "escalate": True,
                    "apply_adder": True
                }
            ],
            "include_rate_table": True
        }
    }

    return {
        "description": "Template for generating Excel cost proposal",
        "template": template,
        "notes": {
            "jobs": "Array of job records with wage data (from /api/pricing/process)",
            "project_config": {
                "escalation_rates": "Year-over-year wage increase rates (as decimals, e.g., 0.0272 = 2.72%)",
                "indirect_rates": "Fringe, Overhead, and G&A rates for FBLR calculation",
                "passthrough_rates": "S&MH and G&A rates for subcontractor management",
                "fee_rates": "Profit margins: higher for prime labor, lower for sub labor",
                "ga_adder_rate": "G&A rate applied to ODCs",
                "subcontractors": "Optional: Include if you have subcontractor labor",
                "odcs": "Optional: Other Direct Costs like travel, equipment, etc.",
                "include_rate_table": "Set to true to include Sheet 2 with rate calculations"
            }
        }
    }
