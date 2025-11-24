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

from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents

router = APIRouter()

# In-memory store for job status
# Structure: {job_id: {"status": "processing"|"completed"|"failed", "progress": str, "result": dict, "error": str}}
jobs_store: Dict[str, Dict[str, Any]] = {}


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

        # Step 3: Clean up data
        jobs_store[job_id]["progress"] = "Finalizing results..."
        
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

        # Build response with metadata
        response_data = {
            "metadata": {
                "total_jobs": len(cleaned_jobs),
                "processed_at": datetime.utcnow().isoformat() + "Z",
                "document_names": file_names
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
