"""
Proposals router for managing government contract proposals.

Handles document upload, storage, processing, and full CRUD operations.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends, status
from fastapi.responses import JSONResponse
from typing import List, Dict, Any
from pathlib import Path
import tempfile
import shutil
from datetime import datetime
import asyncio
from bson import ObjectId

# Authentication
from routers.auth import get_current_user
from auth.models import UserResponse

# Proposal models and CRUD
from models.proposal import ProposalCreate, ProposalUpdate, DocumentInfo
from utils.proposals import get_proposal_crud

# Document processing
from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents

# Position splitting
from routers.pricing import split_position_by_hours, split_multi_year_position

# Storage
from client.idrive_storage import get_idrive_storage

# Database
from auth.database import MongoDB

router = APIRouter(prefix="/proposals", tags=["proposals"])

# Get singleton ProposalCRUD instance
def get_crud():
    """Get singleton ProposalCRUD instance (thread-safe)."""
    return get_proposal_crud(MongoDB.get_collection("proposals"))


# ============================================================================
# DOCUMENT UPLOAD & ASYNC PROCESSING
# ============================================================================

async def process_proposal_documents(
    proposal_id: str,
    user_id: str,
    file_paths: List[str],
    file_names: List[str],
    temp_dir: Path
):
    """
    Background task to process uploaded documents.

    Updates proposal status as processing progresses.
    Uses singleton ProposalCRUD instance for thread safety.
    """
    # Get singleton CRUD instance
    crud = get_crud()

    try:
        # Update status to processing
        crud.update_proposal(
            proposal_id,
            user_id,
            {"status": "processing", "progress": 0, "message": "Parsing documents..."}
        )

        # Step 1: Parse documents to DataFrame
        df = await parse_documents_to_dataframe(file_paths)

        crud.update_proposal(
            proposal_id,
            user_id,
            {"progress": 30, "message": f"Found {len(df)} positions. Fetching wage data..."}
        )

        # Step 2: Process with agents
        final_df = await process_dataframe_with_agents(df, max_workers=10)

        crud.update_proposal(
            proposal_id,
            user_id,
            {"progress": 80, "message": "Finalizing results..."}
        )

        # Step 3: Clean and process data
        import numpy as np
        final_df = final_df.replace([np.inf, -np.inf], None)
        final_df = final_df.where(final_df.notna(), None)

        # Rename columns to match API schema (snake_case field names)
        column_mapping = {
            'BLS Code': 'soc_code',
            'BLS Labour Category Mapping': 'soc_title',
            'BLS Occupation Description': 'bls_occupation_description',
        }
        final_df = final_df.rename(columns=column_mapping)

        jobs_data = final_df.to_dict('records')

        # Clean NaN/inf values
        def clean_value(val):
            if isinstance(val, float):
                if np.isnan(val) or np.isinf(val):
                    return None
            return val

        cleaned_jobs = []
        for job in jobs_data:
            cleaned_job = {k: clean_value(v) for k, v in job.items()}
            cleaned_jobs.append(cleaned_job)

        # Apply position splitting by FTE hours
        # Extract FTE threshold from document (or use default)
        fte_threshold = 1920  # Default fallback
        if cleaned_jobs and len(cleaned_jobs) > 0:
            first_job_threshold = cleaned_jobs[0].get('standard_fte_hours')
            if first_job_threshold and 1500 <= first_job_threshold <= 2500:
                fte_threshold = int(first_job_threshold)

        final_split_jobs = []
        for job in cleaned_jobs:
            # Check if job has hours_per_year (multi-year contract)
            if 'hours_per_year' in job and job['hours_per_year']:
                # Multi-year position - use split_multi_year_position
                split_positions = split_multi_year_position(job, max_hours=fte_threshold)
                final_split_jobs.extend(split_positions)
            elif 'hours' in job and job['hours'] and job['hours'] > fte_threshold:
                # Legacy single-year contract with high hours
                split_positions = split_position_by_hours(job, max_hours=fte_threshold)
                final_split_jobs.extend(split_positions)
            else:
                # No splitting needed
                final_split_jobs.append(job)

        # Replace cleaned_jobs with split jobs
        cleaned_jobs = final_split_jobs

        # Extract metadata
        base_years = None
        option_years = None
        total_years = None

        if cleaned_jobs and len(cleaned_jobs) > 0:
            first_job = cleaned_jobs[0]
            base_years = first_job.get('base_years')
            option_years = first_job.get('option_years')
            total_years = first_job.get('total_years')

        # Defaults
        if total_years is None:
            total_years = 5
        if base_years is None:
            base_years = 1
        if option_years is None:
            option_years = total_years - base_years

        # Generate dynamic escalation rates based on total_years
        escalation_rates = {}
        for year in range(1, total_years):
            key = f"{year}_to_{year + 1}"
            if year == 1:
                escalation_rates[key] = 0.0272  # 2.72% for Year 1 to 2
            else:
                escalation_rates[key] = 0.0299  # 2.99% for all other years

        # Update proposal with results
        crud.update_proposal(
            proposal_id,
            user_id,
            {
                "status": "completed",
                "progress": 100,
                "message": "Processing complete",
                "jobs": cleaned_jobs,
                "metadata": {
                    "total_jobs": len(cleaned_jobs),
                    "base_years": base_years,
                    "option_years": option_years,
                    "total_years": total_years,
                    "fte_hours_threshold": fte_threshold
                },
                "rates": {
                    "fringe": 0.247,
                    "oh": 0.0711,
                    "ga": 0.2243,
                    "fee": 0.08,
                    "smh": 0.0665,
                    "sub_fee": 0.0126,
                    "ga_passthrough": 0.0,
                    "ga_adder": 0.2212
                },
                "escalation_rates": escalation_rates
            }
        )

    except Exception as e:
        # Update proposal with error
        crud.update_proposal(
            proposal_id,
            user_id,
            {
                "status": "error",
                "progress": 0,
                "message": f"Error: {str(e)}"
            }
        )
        import traceback
        traceback.print_exc()

    finally:
        # Clean up temp directory
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/upload")
async def upload_proposal_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    solicitation_number: str = 
    
    Form(None),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Upload documents, store in iDrive e2, and start async processing.

    Returns proposal_id immediately for status polling.
    """
    try:
        # Initialize services
        storage = get_idrive_storage()
        crud = get_crud()

        # Create temp directory for processing
        temp_dir = Path(tempfile.mkdtemp())
        file_paths = []
        file_names = []

        # Save uploaded files temporarily
        for file in files:
            file_path = temp_dir / file.filename
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
            file_paths.append(str(file_path))
            file_names.append(file.filename)

        # Create proposal in MongoDB (status: processing)
        proposal_data = {
            "name": f"Proposal {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
            "solicitation_number": solicitation_number,
            "documents": [],
            "progress": 0,
            "message": "Uploading documents..."
        }

        proposal = crud.create_proposal(str(current_user.id), proposal_data)
        proposal_id = str(proposal["_id"])

        # Upload documents to iDrive e2
        documents_info = []
        for file, file_path in zip(files, file_paths):
            # Upload to iDrive
            idrive_url, idrive_key = storage.upload_document(
                file_path=file_path,
                user_id=str(current_user.id),
                proposal_id=proposal_id,
                filename=file.filename
            )

            doc_info = {
                "filename": file.filename,
                "file_size": file.size,
                "upload_date": datetime.utcnow(),
                "idrive_url": idrive_url,
                "idrive_key": idrive_key,
                "extracted_content": None  # Will be filled during processing
            }
            documents_info.append(doc_info)

        # Update proposal with document info
        crud.update_proposal(
            proposal_id,
            str(current_user.id),
            {"documents": documents_info}
        )

        # Start background processing
        background_tasks.add_task(
            process_proposal_documents,
            proposal_id,
            str(current_user.id),
            file_paths,
            file_names,
            temp_dir
        )

        return {
            "proposal_id": proposal_id,
            "status": "processing",
            "message": "Documents uploaded. Processing started."
        }

    except Exception as e:
        # Clean up on error
        if 'temp_dir' in locals() and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )


# ============================================================================
# STATUS POLLING (LIGHTWEIGHT)
# ============================================================================

@router.get("/{proposal_id}/status")
async def get_proposal_status(
    proposal_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get lightweight status for polling during processing.

    Returns only status, progress, and message (not full data).
    """
    crud = get_crud()
    proposal = crud.get_proposal(proposal_id, str(current_user.id))

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    return {
        "status": proposal.get("status", "processing"),
        "progress": proposal.get("progress", 0),
        "message": proposal.get("message", "Processing...")
    }


# ============================================================================
# CRUD OPERATIONS
# ============================================================================

@router.get("")
async def list_proposals(
    skip: int = 0,
    limit: int = 20,
    sort_by: str = "date",
    sort_order: str = "desc",
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get paginated list of user's proposals (summary view).

    Returns basic info only (no full jobs/rates data).

    Args:
        skip: Number of proposals to skip for pagination
        limit: Maximum number of proposals to return
        sort_by: Field to sort by ("date", "name", "status")
        sort_order: Sort order ("asc", "desc")
    """
    crud = get_crud()
    proposals = crud.get_user_proposals(str(current_user.id), skip, limit, sort_by, sort_order)

    # Convert ObjectId to string for JSON serialization
    result = []
    for prop in proposals:
        prop["_id"] = str(prop["_id"])
        # Only include summary fields
        summary = {
            "id": prop["_id"],
            "name": prop.get("name", "Untitled"),
            "solicitation_number": prop.get("solicitation_number"),
            "status": prop.get("status", "draft"),
            "created_at": prop.get("created_at"),
            "updated_at": prop.get("updated_at"),
            "total_cost": prop.get("total_cost")
        }
        result.append(summary)

    return result


@router.get("/{proposal_id}")
async def get_proposal(
    proposal_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get complete proposal data including all jobs, rates, and spreadsheet data.

    Called after status shows 'completed' or when user opens existing proposal.
    """
    crud = get_crud()
    proposal = crud.get_proposal(proposal_id, str(current_user.id))

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Convert ObjectId to string
    proposal["_id"] = str(proposal["_id"])
    proposal["id"] = proposal["_id"]

    return proposal


@router.patch("/{proposal_id}")
async def update_proposal(
    proposal_id: str,
    updates: ProposalUpdate,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Update proposal (name, rates, jobs, spreadsheet data, etc.).
    """
    crud = get_crud()

    # Convert Pydantic model to dict, excluding None values
    update_dict = updates.dict(exclude_none=True)

    if not update_dict:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    updated_proposal = crud.update_proposal(
        proposal_id,
        str(current_user.id),
        update_dict
    )

    if not updated_proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Convert ObjectId to string
    updated_proposal["_id"] = str(updated_proposal["_id"])
    updated_proposal["id"] = updated_proposal["_id"]

    return updated_proposal


@router.patch("/{proposal_id}/positions/{position_index}")
async def update_position_subcontractor_hours(
    proposal_id: str,
    position_index: int,
    update_data: Dict[str, Any],
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Update a specific position's subcontractor hours.

    This allows splitting a position between prime and subcontractor labor.
    """
    crud = get_crud()
    proposal = crud.get_proposal(proposal_id, str(current_user.id))

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    jobs = proposal.get("jobs", [])

    if position_index < 0 or position_index >= len(jobs):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Position index {position_index} not found. Valid range: 0-{len(jobs)-1}"
        )

    position = jobs[position_index]

    # Validate and update subcontractor hours
    if "subcontractor_hours" in update_data:
        sub_hours = update_data["subcontractor_hours"]

        # Calculate total hours (sum all years for multi-year contracts)
        if "hours_per_year" in position and position["hours_per_year"]:
            total_hours = sum(position["hours_per_year"].values())
        else:
            total_hours = position.get("hours", 0)

        if sub_hours < 0 or sub_hours > total_hours:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid subcontractor hours. Must be between 0 and {total_hours}"
            )

        # Update subcontractor hours and calculate prime hours
        position["subcontractor_hours"] = sub_hours
        position["prime_hours"] = total_hours - sub_hours

        # For multi-year contracts, split hours proportionally per year
        if "hours_per_year" in position and position["hours_per_year"]:
            ratio = sub_hours / total_hours if total_hours > 0 else 0

            position["subcontractor_hours_per_year"] = {}
            position["prime_hours_per_year"] = {}

            for year, year_hours in position["hours_per_year"].items():
                sub_year_hours = int(year_hours * ratio)
                position["subcontractor_hours_per_year"][year] = sub_year_hours
                position["prime_hours_per_year"][year] = year_hours - sub_year_hours

    # Update the proposal with modified jobs
    updated_proposal = crud.update_proposal(
        proposal_id,
        str(current_user.id),
        {"jobs": jobs}
    )

    if not updated_proposal:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update proposal"
        )

    return {
        "success": True,
        "position": position,
        "message": f"Updated position {position_index} subcontractor hours to {sub_hours}"
    }


@router.delete("/{proposal_id}")
async def delete_proposal(
    proposal_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Delete proposal and all associated documents from iDrive e2.
    """
    crud = get_crud()
    storage = get_idrive_storage()

    # Get proposal first to access documents
    proposal = crud.get_proposal(proposal_id, str(current_user.id))

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Delete documents from iDrive e2
    try:
        deleted_count = storage.delete_proposal_documents(
            str(current_user.id),
            proposal_id
        )
        print(f"Deleted {deleted_count} documents from iDrive e2")
    except Exception as e:
        print(f"Warning: Failed to delete documents from iDrive: {e}")
        # Continue with proposal deletion even if iDrive cleanup fails

    # Delete proposal from MongoDB
    success = crud.delete_proposal(proposal_id, str(current_user.id))

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete proposal"
        )

    return {
        "message": "Proposal deleted successfully",
        "deleted_documents": deleted_count
    }


@router.post("/{proposal_id}/duplicate")
async def duplicate_proposal(
    proposal_id: str,
    new_name: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Duplicate proposal (copies data, not documents).
    """
    crud = get_crud()

    new_proposal = crud.duplicate_proposal(
        proposal_id,
        str(current_user.id),
        new_name
    )

    if not new_proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source proposal not found"
        )

    # Convert ObjectId to string
    new_proposal["_id"] = str(new_proposal["_id"])
    new_proposal["id"] = new_proposal["_id"]

    return new_proposal


# ============================================================================
# DOCUMENT MANAGEMENT
# ============================================================================

@router.get("/{proposal_id}/documents")
async def list_proposal_documents(
    proposal_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get list of documents for a proposal with iDrive URLs.
    """
    crud = get_crud()
    proposal = crud.get_proposal(proposal_id, str(current_user.id))

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    return proposal.get("documents", [])


@router.delete("/{proposal_id}/documents/{document_index}")
async def delete_proposal_document(
    proposal_id: str,
    document_index: int,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Delete a specific document from proposal and iDrive e2.
    """
    crud = get_crud()
    storage = get_idrive_storage()

    # Get proposal
    proposal = crud.get_proposal(proposal_id, str(current_user.id))

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    documents = proposal.get("documents", [])

    if document_index < 0 or document_index >= len(documents):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid document index"
        )

    # Get document to delete
    doc = documents[document_index]

    # Delete from iDrive e2
    try:
        storage.delete_document(doc["idrive_key"])
    except Exception as e:
        print(f"Warning: Failed to delete document from iDrive: {e}")

    # Remove from documents array
    documents.pop(document_index)

    # Update proposal
    crud.update_proposal(
        proposal_id,
        str(current_user.id),
        {"documents": documents}
    )

    return {
        "message": "Document deleted successfully",
        "filename": doc["filename"]
    }
