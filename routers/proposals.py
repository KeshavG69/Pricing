"""
Proposals router for managing government contract proposals.

Handles document upload, storage, processing, and full CRUD operations.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Depends, status
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
from utils.proposals import ProposalCRUD

# Document processing
from client.jd_parser import parse_documents_to_dataframe
from utils.pipeline import process_dataframe_with_agents

# Storage
from client.idrive_storage import get_idrive_storage

# Database
from auth.database import MongoDB

router = APIRouter(prefix="/proposals", tags=["proposals"])

# Get proposals collection
def get_proposals_collection():
    """Get MongoDB proposals collection."""
    return MongoDB.get_collection("proposals")


# ============================================================================
# DOCUMENT UPLOAD & ASYNC PROCESSING
# ============================================================================

async def process_proposal_documents(
    proposal_id: str,
    user_id: str,
    file_paths: List[str],
    file_names: List[str],
    temp_dir: Path,
    crud: ProposalCRUD
):
    """
    Background task to process uploaded documents.

    Updates proposal status as processing progresses.
    """
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
                    "total_years": total_years
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
                "escalation_rates": {
                    "1_to_2": 0.0272,
                    "2_to_3": 0.0299,
                    "3_to_4": 0.0299,
                    "4_to_5": 0.0299
                }
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
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Upload documents, store in iDrive e2, and start async processing.

    Returns proposal_id immediately for status polling.
    """
    try:
        # Initialize services
        storage = get_idrive_storage()
        crud = ProposalCRUD(get_proposals_collection())

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
            "solicitation_number": None,
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
            temp_dir,
            crud
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
    crud = ProposalCRUD(get_proposals_collection())
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
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get paginated list of user's proposals (summary view).

    Returns basic info only (no full jobs/rates data).
    """
    crud = ProposalCRUD(get_proposals_collection())
    proposals = crud.get_user_proposals(str(current_user.id), skip, limit)

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
    crud = ProposalCRUD(get_proposals_collection())
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
    crud = ProposalCRUD(get_proposals_collection())

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


@router.delete("/{proposal_id}")
async def delete_proposal(
    proposal_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Delete proposal and all associated documents from iDrive e2.
    """
    crud = ProposalCRUD(get_proposals_collection())
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
    crud = ProposalCRUD(get_proposals_collection())

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
    crud = ProposalCRUD(get_proposals_collection())
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
    crud = ProposalCRUD(get_proposals_collection())
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
