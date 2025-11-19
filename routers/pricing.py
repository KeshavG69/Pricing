"""
Pricing router for document processing and wage lookup.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from typing import List
from pathlib import Path
import tempfile
import shutil
from io import BytesIO

from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents

router = APIRouter()


@router.post("/process")
async def process_documents(files: List[UploadFile] = File(...)):
    """
    Upload documents, process them, and return pricing Excel file.

    Accepts PDF, DOCX, Excel files containing job descriptions.
    Returns Excel file with wage data.
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

        # Step 2: Process with agents (10 parallel workers)
        final_df = await process_dataframe_with_agents(df, max_workers=10)

        # Step 3: Convert DataFrame to Excel bytes
        output = BytesIO()
        final_df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)

        # Return Excel file as streaming response
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=pricing_results.xlsx"
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Clean up temp directory
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
