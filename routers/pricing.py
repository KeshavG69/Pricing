"""
Pricing router for document processing and wage lookup.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from typing import List
from pathlib import Path
import tempfile
import shutil
from datetime import datetime

from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents

router = APIRouter()


@router.post("/process")
async def process_documents(files: List[UploadFile] = File(...)):
    """
    Upload documents, process them, and return pricing data as JSON.

    Accepts PDF, DOCX, Excel files containing job descriptions.
    Returns JSON with all job data and wage information.
    """
    temp_dir = None

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

        # Step 1: Parse documents to DataFrame
        df = await parse_documents_to_dataframe(file_paths)

        # Step 2: Process with agents (10 parallel workers)
        final_df = await process_dataframe_with_agents(df, max_workers=10)

        # Step 3: Convert DataFrame to JSON
        # Replace NaN values with None for proper JSON serialization
        final_df = final_df.where(final_df.notna(), None)

        jobs_data = final_df.to_dict('records')

        # Build response with metadata
        response_data = {
            "metadata": {
                "total_jobs": len(jobs_data),
                "processed_at": datetime.utcnow().isoformat() + "Z",
                "document_names": file_names
            },
            "jobs": jobs_data
        }

        return JSONResponse(content=response_data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Clean up temp directory
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
