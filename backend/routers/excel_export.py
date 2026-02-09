"""
Excel export router for generating government contract cost proposals.

Provides endpoints to:
1. Generate Excel from job data (JSON input)
2. Generate Excel from uploaded documents (full pipeline)
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import List, Dict, Any
from pathlib import Path
from pydantic import BaseModel, Field
import tempfile
import shutil
from io import BytesIO
from datetime import datetime

from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents, build_project_data_from_dataframe
from client.excel_generator import ExcelGenerator
from utils.proposals import ProposalCRUD
from utils.helpers import serialize_doc
from auth.dependencies import get_current_user

router = APIRouter()






@router.get("/generate-from-proposal/{proposal_id}")
async def generate_excel_from_proposal(
    proposal_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Generate Excel cost proposal from a saved proposal ID.

    Fetches the proposal data from MongoDB and generates an Excel file.
    This is the recommended endpoint for exporting existing proposals.

    Args:
        proposal_id: MongoDB proposal ID
        current_user: Authenticated user (injected by dependency)

    Returns:
        Excel file as downloadable attachment
    """
    try:
        import pandas as pd
        from bson import ObjectId
        import logging

        logger = logging.getLogger(__name__)

        # Fetch proposal from MongoDB
        proposal_crud = ProposalCRUD()
        proposal = proposal_crud.get_by_id(ObjectId(proposal_id))
        logger.info(f"Generating Excel for proposal {proposal_id}")

        if not proposal:
            raise HTTPException(status_code=404, detail="Proposal not found")

        # Check if user has access to this proposal
        if proposal['user_id'] != current_user['_id']:
            # Check if proposal is shared with user
            shared_with = proposal.get('shared_with', [])
            if current_user['_id'] not in shared_with:
                # Check organization access for admins
                if current_user['organization_id'] != proposal.get('organization_id'):
                    raise HTTPException(status_code=403, detail="Access denied")

        # Extract spreadsheet data
        spreadsheet_data = proposal.get('spreadsheet_data', {})

        # Infer total_years from data if not explicitly set
        total_years = spreadsheet_data.get('total_years')
        if not total_years:
            # Try to infer from positions' hours_per_year
            positions = spreadsheet_data.get('positions', [])
            max_year = 1
            for pos in positions:
                hours_per_year = pos.get('hours_per_year', {})
                if hours_per_year:
                    year_nums = [int(y) for y in hours_per_year.keys() if y.isdigit()]
                    if year_nums:
                        max_year = max(max_year, max(year_nums))

            # Also check escalation_rates
            escalation_rates = spreadsheet_data.get('escalation_rates', {})
            if escalation_rates:
                # Escalation rates are like "1_to_2", "2_to_3", etc.
                # Number of years = max "to" number
                for key in escalation_rates.keys():
                    if '_to_' in key:
                        parts = key.split('_to_')
                        if len(parts) == 2 and parts[1].isdigit():
                            max_year = max(max_year, int(parts[1]))

            total_years = max_year

        # Build project_config from proposal data
        project_config = {
            'solicitation_number': proposal.get('solicitation_number', 'N/A'),
            'prime_contractor_name': proposal.get('prime_contractor_name', 'N/A'),
            'subcontractor_names': [sub['name'] for sub in spreadsheet_data.get('subcontractors', [])],
            'dcaa_contact': spreadsheet_data.get('dcaa_contact', ''),
            'total_years': total_years,
            'base_years': 1,  # Default to 1 base year
            'task_order_number': proposal.get('task_order_number', ''),

            # Rates
            'escalation_rates': spreadsheet_data.get('escalation_rates') or {},
            'indirect_rates': spreadsheet_data.get('rates') or {},
            'passthrough_rates': {
                'smh': (spreadsheet_data.get('rates') or {}).get('smh') or 0.0665,
                'ga': (spreadsheet_data.get('rates') or {}).get('ga_passthrough') or 0.0
            },
            'fee_rates': {
                'prime_labor': (spreadsheet_data.get('rates') or {}).get('fee') or 0.08,
                'sub_labor': (spreadsheet_data.get('rates') or {}).get('sub_fee') or 0.0126
            },
            'ga_adder_rate': (spreadsheet_data.get('rates') or {}).get('ga') or 0.2243,

            # Data
            'subcontractors': [],
            'travel': spreadsheet_data.get('travel', []),
            'odcs': spreadsheet_data.get('odcs', []),
            'extensions': spreadsheet_data.get('extensions', []),
            'include_rate_table': True
        }

        # Convert positions to DataFrame format
        positions = spreadsheet_data.get('positions', [])
        jobs = []

        for pos in positions:
            # Skip positions assigned to subcontractors
            if pos.get('assigned_subcontractor_id'):
                continue

            job = {
                'labor_category': pos.get('labor_category', ''),
                'description': pos.get('description', ''),
                'experience': pos.get('experience', 0),
                'location': pos.get('location', ''),
                'location_type': pos.get('location_type', 'On-Site'),
                'soc_code': pos.get('soc_code', ''),
                'soc_title': pos.get('soc_title', ''),
                'percentile': pos.get('percentile', '50th'),
                'wage_10th': pos.get('wage_10th'),
                'wage_25th': pos.get('wage_25th'),
                'wage_50th': pos.get('wage_50th'),
                'wage_75th': pos.get('wage_75th'),
                'wage_90th': pos.get('wage_90th'),
                'selected_wage': pos.get('selected_wage'),
                'selected_salaries': pos.get('selected_salaries', []),
                'hours_per_year': pos.get('hours_per_year', {}),
                'standard_fte_hours': pos.get('standard_fte_hours', 2080),
                'wage_source': pos.get('wage_source', 'bls'),
                'gsa_lcat_id': pos.get('gsa_lcat_id'),
                'gsa_title': pos.get('gsa_title'),
                'gsa_rates_by_year': pos.get('gsa_rates_by_year', {}),
                'gsa_current_year': pos.get('gsa_current_year'),
                'gsa_custom_rate': pos.get('gsa_custom_rate'),
                'gsa_discount_rate': pos.get('gsa_discount_rate'),
            }
            jobs.append(job)

        # Convert jobs list to DataFrame
        df = pd.DataFrame(jobs)

        # Build project data structure
        logger.info("Building project data from dataframe")
        try:
            project_data = build_project_data_from_dataframe(df, project_config)
            logger.info(f"Project data built successfully with {len(project_data.get('prime_positions', []))} prime positions")
        except Exception as e:
            logger.error(f"Error building project data: {e}", exc_info=True)
            raise

        # Add subcontractor data
        logger.info(f"Processing {len(spreadsheet_data.get('subcontractors', []))} subcontractors")
        for sub in spreadsheet_data.get('subcontractors', []):
            sub_labor_categories = []
            logger.info(f"Processing subcontractor: {sub.get('name')} with {len(sub.get('positions', []))} positions")
            for pos in sub.get('positions', []):
                labor_cat = {
                    'labor_category': pos.get('labor_category', ''),
                    'ecraft_code': pos.get('ecraft_code', ''),
                    'site': pos.get('site', 'Government'),
                }

                # Add hours and rates per year
                for year in range(1, project_config['total_years'] + 1):
                    year_key = str(year)
                    hours_per_year = pos.get('hours_per_year') or {}
                    hours = hours_per_year.get(year_key) or 0

                    # Calculate escalated rate
                    base_rate = pos.get('rate') or 0
                    escalated_rate = base_rate
                    try:
                        for y in range(1, year):
                            esc_key = f"{y}_to_{y + 1}"
                            esc_rate = project_config['escalation_rates'].get(esc_key) or 0
                            escalated_rate *= (1 + esc_rate)
                    except Exception as e:
                        logger.error(f"Error calculating escalated rate for year {year}: {e}")
                        logger.error(f"base_rate: {base_rate}, escalated_rate: {escalated_rate}, esc_rate: {esc_rate}")
                        raise

                    labor_cat[f'year_{year}_hours'] = hours
                    labor_cat[f'year_{year}_rate'] = escalated_rate

                sub_labor_categories.append(labor_cat)

            project_data['subcontractors'].append({
                'name': sub['name'],
                'labor_categories': sub_labor_categories
            })

        # Add wage data for the new tab
        project_data['wage_data'] = {
            'positions': spreadsheet_data.get('positions', []),
            'standard_fte_hours': spreadsheet_data.get('standard_fte_hours', 2080)
        }

        # Generate Excel workbook
        logger.info("Generating Excel workbook")
        try:
            generator = ExcelGenerator()
            workbook = generator.generate_cost_proposal(project_data)
            logger.info("Excel workbook generated successfully")
        except Exception as e:
            logger.error(f"Error generating Excel workbook: {e}", exc_info=True)
            raise

        # Save to BytesIO buffer
        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        # Generate filename with timestamp
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"cost_proposal_{project_config['solicitation_number']}_{timestamp}.xlsx"

        # Return as downloadable file
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
        import traceback
        logger.error(f"Failed to generate Excel from proposal: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate Excel from proposal: {str(e)}"
        )


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
                "oh_onsite": 0.0711,
                "oh_offsite": 0.0711,
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
