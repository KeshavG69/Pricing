"""
Pricing router for document processing and wage lookup.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import List, Dict, Any
from pathlib import Path
import tempfile
import numpy as np
import shutil
from datetime import datetime
import uuid
import asyncio
import math

from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents

router = APIRouter()

# In-memory store for job status
# Structure: {job_id: {"status": "processing"|"completed"|"failed", "progress": str, "result": dict, "error": str}}
jobs_store: Dict[str, Dict[str, Any]] = {}


def split_position_by_hours(position: Dict, max_hours: int = 1920) -> List[Dict]:
    """
    Split a position into multiple FTE rows if hours > max_hours.

    Args:
        position: Job position dict with 'hours' field
        max_hours: Max hours per person (default 1920)

    Returns:
        List of position dicts (1 or more)

    Example:
        Input: {"labor_category": "Engineer", "hours": 5760, "wage_75th": 150000}
        Output: [
            {"labor_category": "Engineer", "hours": 1920, "wage_75th": 150000},
            {"labor_category": "Engineer", "hours": 1920, "wage_75th": 150000},
            {"labor_category": "Engineer", "hours": 1920, "wage_75th": 150000}
        ]
    """
    hours = position.get('hours', 1920)

    if hours <= max_hours:
        return [position]  # No split needed

    # Calculate number of FTEs needed
    fte_count = math.ceil(hours / max_hours)

    # Split into multiple positions
    positions = []
    for i in range(fte_count):
        new_position = position.copy()
        # Keep labor_category unchanged - no FTE labeling

        # Distribute hours: first N-1 get max_hours, last one gets remainder
        if i < fte_count - 1:
            new_position['hours'] = max_hours
        else:
            new_position['hours'] = hours - (max_hours * (fte_count - 1))

        positions.append(new_position)

    return positions


async def process_documents_task(
    job_id: str, 
    file_paths: List[str], 
    file_names: List[str], 
    temp_dir: Path
):
    """Background task to process documents."""
    try:
        jobs_store[job_id]["status"] = "processing"
        jobs_store[job_id]["progress"] = "Parsing documents..."

        # Step 1: Parse documents to DataFrame
        df = await parse_documents_to_dataframe(file_paths)
        
        jobs_store[job_id]["progress"] = f"Found {len(df)} positions. Fetching wage data..."

        # Step 2: Process with agents (10 parallel workers)
        final_df = await process_dataframe_with_agents(df, max_workers=10)

        print(f"\n{'='*60}")
        print(f"✅ Agent processing complete. DataFrame shape: {final_df.shape}")
        print(f"{'='*60}\n")

        # Step 3: Clean up data
        jobs_store[job_id]["progress"] = "Finalizing results..."
        print("📝 Starting data cleanup...")
        
        # Replace inf and -inf with None
        final_df = final_df.replace([np.inf, -np.inf], None)
        # Replace NaN with None using where
        final_df = final_df.where(final_df.notna(), None)

        # Convert to list of dicts
        jobs_data = final_df.to_dict('records')

        # Helper to clean values
        def clean_value(val):
            if isinstance(val, float):
                if np.isnan(val) or np.isinf(val):
                    return None
            return val

        cleaned_jobs = []
        for job in jobs_data:
            cleaned_job = {k: clean_value(v) for k, v in job.items()}
            cleaned_jobs.append(cleaned_job)

        # Split positions with hours > 1920 into multiple FTE rows
        expanded_jobs = []
        for job in cleaned_jobs:
            split_positions = split_position_by_hours(job, max_hours=1920)
            expanded_jobs.extend(split_positions)

        # Replace cleaned_jobs with expanded list
        cleaned_jobs = expanded_jobs

        # Extract document-level years from first job (same for all jobs from same doc)
        base_years = None
        option_years = None
        total_years = None

        if cleaned_jobs and len(cleaned_jobs) > 0:
            first_job = cleaned_jobs[0]
            base_years = first_job.get('base_years')
            option_years = first_job.get('option_years')
            total_years = first_job.get('total_years')

        # Default to 5 years if not extracted
        if total_years is None:
            total_years = 5

        # Calculate base_years if we have total but not base
        if base_years is None and total_years:
            base_years = 1  # Default to 1 base year

        # Calculate option_years if we have total and base
        if option_years is None and total_years and base_years:
            option_years = total_years - base_years

        # Build response with metadata
        response_data = {
            "metadata": {
                "total_jobs": len(cleaned_jobs),
                "processed_at": datetime.utcnow().isoformat() + "Z",
                "document_names": file_names,
                "base_years": base_years,
                "option_years": option_years,
                "total_years": total_years
            },
            "jobs": cleaned_jobs
        }

        jobs_store[job_id]["status"] = "completed"
        jobs_store[job_id]["result"] = response_data
        jobs_store[job_id]["progress"] = "Completed"

    except Exception as e:
        jobs_store[job_id]["status"] = "failed"
        jobs_store[job_id]["error"] = str(e)
        jobs_store[job_id]["progress"] = "Failed"
        import traceback
        traceback.print_exc()
    
    finally:
        # Clean up temp directory
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/process")
async def process_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...)
):
    """
    Upload documents and start background processing.
    
    Args:
        files: List of files to process
        
    Returns:
        {"job_id": "..."} to track progress.
    """
    try:
        # Create temp directory for uploaded files
        temp_dir = Path(tempfile.mkdtemp())
        file_paths = []
        file_names = []

        # Save uploaded files
        for file in files:
            file_path = temp_dir / file.filename
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
            file_paths.append(str(file_path))
            file_names.append(file.filename)

        # Generate Job ID
        job_id = str(uuid.uuid4())
        
        # Initialize job state
        jobs_store[job_id] = {
            "status": "pending",
            "progress": "Queued",
            "submitted_at": datetime.utcnow().isoformat(),
            "file_names": file_names
        }

        # Start background task
        background_tasks.add_task(
            process_documents_task, 
            job_id, 
            file_paths, 
            file_names, 
            temp_dir
        )

        return {"job_id": job_id, "status": "pending"}

    except Exception as e:
        # Clean up if immediate failure
        if 'temp_dir' in locals() and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """Check the status of a processing job."""
    if job_id not in jobs_store:
        raise HTTPException(status_code=404, detail="Job not found")

    return jobs_store[job_id]


@router.post("/recalculate")
async def recalculate_spreadsheet(request: Dict[str, Any]):
    """
    Recalculate spreadsheet values using backend calculator.

    Expected request structure:
    {
        "positions": [
            {
                "id": "pos_0",
                "percentile": "75th",
                "wage_10th": 60320,
                "wage_50th": 96800,
                "wage_75th": 123390,
                "year1_hours": 1880,
                "year2_hours": 1880,
                ...
            }
        ],
        "rates": {
            "fringe": 0.247,
            "oh": 0.0711,
            "ga": 0.2243,
            "fee": 0.08
        },
        "escalation_rates": {
            "1_to_2": 0.0272,
            "2_to_3": 0.0299,
            ...
        },
        "total_years": 5
    }

    Returns calculated FBLR, amounts, and totals for all positions.
    """
    try:
        from client.calculation_service import Calculator

        positions = request.get("positions", [])
        rates = request.get("rates", {})
        escalation_rates = request.get("escalation_rates", {})
        total_years = request.get("total_years", 5)

        results = []

        # Calculate each position
        for pos in positions:
            # Get wage based on percentile
            percentile = pos.get("percentile", "50th")
            base_wage = pos.get(f"wage_{percentile}", pos.get("selected_wage", 0))

            if base_wage <= 0:
                # Skip positions with invalid wages
                results.append({
                    "id": pos.get("id"),
                    "years": [],
                    "total_hours": 0,
                    "total_amount": 0
                })
                continue

            # Build hours per year (convert to string keys for Calculator)
            hours_per_year = {}
            for year in range(1, total_years + 1):
                hours_per_year[str(year)] = pos.get(f"year{year}_hours", 1880)

            # Calculate Year 1 FBLR
            year_1_hours = hours_per_year.get("1", 1880)
            fblr_breakdown = Calculator.calculate_fblr(
                annual_wage=base_wage,
                hours=year_1_hours,
                fringe_rate=rates.get("fringe", 0.247),
                oh_rate=rates.get("oh", 0.0711),
                ga_rate=rates.get("ga", 0.2243)
            )
            base_fblr = fblr_breakdown["fblr"]

            # Build yearly data with escalation
            yearly_data = []
            for year in range(1, total_years + 1):
                if year == 1:
                    rate = base_fblr
                else:
                    rate = Calculator.calculate_year_rate(
                        base_rate=base_fblr,
                        escalation_rates=escalation_rates,
                        from_year=1,
                        to_year=year
                    )

                hours = hours_per_year.get(str(year), 0)
                amount = round(rate * hours, 2)

                yearly_data.append({
                    "year": year,
                    "hours": hours,
                    "amount": amount,
                    "breakdown": {
                        "fblr": rate,
                        "dlRate": fblr_breakdown["dl_rate"] if year == 1 else round(rate / (1 + rates.get("fringe", 0.247) + rates.get("oh", 0.0711) + rates.get("ga", 0.2243)), 2),
                        "fringe": fblr_breakdown["fringe"] if year == 1 else 0,
                        "oh": fblr_breakdown["oh"] if year == 1 else 0,
                        "ga": fblr_breakdown["ga"] if year == 1 else 0
                    }
                })

            # Calculate totals
            total_hours = sum(y["hours"] for y in yearly_data)
            total_amount = sum(y["amount"] for y in yearly_data)

            results.append({
                "id": pos.get("id"),
                "years": yearly_data,
                "total_hours": total_hours,
                "total_amount": total_amount
            })

        return {
            "status": "success",
            "results": results
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Calculation failed: {str(e)}"
        )
