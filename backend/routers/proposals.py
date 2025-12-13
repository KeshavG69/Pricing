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
from auth.dependencies import get_current_user

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
async def get_crud():
    """Get singleton ProposalCRUD instance (async, thread-safe)."""
    db = await MongoDB.get_database()
    return get_proposal_crud(db["proposals"])


def serialize_proposal(proposal: dict) -> dict:
    """
    Convert all ObjectId fields to strings for JSON serialization.
    Also converts snake_case date fields to camelCase for frontend consistency.

    Args:
        proposal: Proposal document from MongoDB

    Returns:
        Proposal with all ObjectIds converted to strings and dates in camelCase
    """
    if not proposal:
        return proposal

    # Convert _id
    if "_id" in proposal:
        proposal["_id"] = str(proposal["_id"])
        proposal["id"] = proposal["_id"]

    # Convert organization_id
    if "organization_id" in proposal and proposal["organization_id"]:
        proposal["organization_id"] = str(proposal["organization_id"])

    # Convert snake_case to camelCase for date fields
    if "created_at" in proposal:
        proposal["createdAt"] = proposal.pop("created_at")
    if "updated_at" in proposal:
        proposal["updatedAt"] = proposal.pop("updated_at")

    return proposal


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
    crud = await get_crud()

    try:
        # Update status to processing
        await crud.update_proposal(
            proposal_id,
            user_id,
            {"status": "processing", "progress": 0, "message": "Parsing documents..."}
        )

        # Step 1: Parse documents to DataFrame
        df = await parse_documents_to_dataframe(file_paths)

        await crud.update_proposal(
            proposal_id,
            user_id,
            {"progress": 30, "message": f"Found {len(df)} positions. Fetching wage data..."}
        )

        # Step 2: Process with agents
        final_df = await process_dataframe_with_agents(df, max_workers=10)

        await crud.update_proposal(
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
        # Extract FTE threshold and months_per_year from document (or use defaults)
        fte_threshold = 1920  # Default fallback
        months_per_year_dict = None
        if cleaned_jobs and len(cleaned_jobs) > 0:
            first_job_threshold = cleaned_jobs[0].get('standard_fte_hours')
            if first_job_threshold and 1500 <= first_job_threshold <= 2500:
                fte_threshold = int(first_job_threshold)

            # Extract months_per_year from first job (for month-aware splitting)
            months_per_year_dict = cleaned_jobs[0].get('months_per_year')

        final_split_jobs = []
        for job in cleaned_jobs:
            # Check if job has hours_per_year (multi-year contract)
            if 'hours_per_year' in job and job['hours_per_year']:
                # Multi-year position - use split_multi_year_position with month awareness
                split_positions = split_multi_year_position(
                    job,
                    max_hours=fte_threshold,
                    months_per_year=months_per_year_dict
                )
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
        await crud.update_proposal(
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
        await crud.update_proposal(
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
    solicitation_number: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload documents, store in iDrive e2, and start async processing.

    Returns proposal_id immediately for status polling.
    """
    try:
        # Initialize services
        storage = get_idrive_storage()
        crud = await get_crud()

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

        # Use organization-aware creation if user belongs to an organization
        if current_user.get("organization_id"):
            proposal = await crud.create_proposal_with_organization(
                user_id=str(current_user["_id"]),  # Pass as string (UUID format)
                organization_id=current_user["organization_id"],
                data=proposal_data
            )
        else:
            # Fallback to old method for backward compatibility
            proposal = await crud.create_proposal(str(current_user["_id"]), proposal_data)

        proposal_id = str(proposal["_id"])

        # Upload documents to iDrive e2
        documents_info = []
        for file, file_path in zip(files, file_paths):
            # Upload to iDrive
            idrive_url, idrive_key = storage.upload_document(
                file_path=file_path,
                user_id=str(current_user["_id"]),
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
        await crud.update_proposal(
            proposal_id,
            str(current_user["_id"]),
            {"documents": documents_info}
        )

        # Start background processing
        background_tasks.add_task(
            process_proposal_documents,
            proposal_id,
            str(current_user["_id"]),
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
    current_user: dict = Depends(get_current_user)
):
    """
    Get lightweight status for polling during processing.

    Returns only status, progress, and message (not full data).
    """
    crud = await get_crud()
    proposal = await crud.get_proposal(proposal_id, str(current_user["_id"]))

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
    current_user: dict = Depends(get_current_user)
):
    """
    Get paginated list of user's proposals (summary view).

    Returns basic info only (no full jobs/rates data).
    Filtered by user's current organization.

    Args:
        skip: Number of proposals to skip for pagination
        limit: Maximum number of proposals to return
        sort_by: Field to sort by ("date", "name", "status")
        sort_order: Sort order ("asc", "desc")
    """
    crud = await get_crud()

    # Use organization-aware query if user belongs to an organization
    if current_user.get("organization_id"):
        # Note: user_id is stored as string (UUID) in proposals, not ObjectId
        proposals = await crud.get_user_proposals_by_org(
            user_id=str(current_user["_id"]),  # Convert to string to match database format
            organization_id=current_user["organization_id"],
            role=current_user.get("role", "user")
        )
    else:
        # Fallback to old method for backward compatibility
        proposals = await crud.get_user_proposals(str(current_user["_id"]), skip, limit, sort_by, sort_order)

    # Convert ObjectId to string for JSON serialization
    result = []
    for prop in proposals:
        prop["_id"] = str(prop["_id"])
        # Only include summary fields (use camelCase for frontend)
        summary = {
            "id": prop["_id"],
            "name": prop.get("name", "Untitled"),
            "solicitation_number": prop.get("solicitation_number"),
            "status": prop.get("status", "draft"),
            "createdAt": prop.get("created_at"),  # Convert to camelCase
            "updatedAt": prop.get("updated_at"),  # Convert to camelCase
            "total_cost": prop.get("total_cost")
        }
        result.append(summary)

    return result


@router.get("/{proposal_id}")
async def get_proposal(
    proposal_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get complete proposal data including all jobs, rates, and spreadsheet data.

    Called after status shows 'completed' or when user opens existing proposal.
    Checks RBAC for shared access.
    """
    # Validate ObjectId
    try:
        prop_oid = ObjectId(proposal_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid proposal ID format"
        )

    crud = await get_crud()
    # Get proposal without user_id filter (we'll check access with RBAC)
    proposal = await crud.get_by_id(prop_oid)

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Check if user has access (owner, admin, or shared)
    if not can_access_proposal(proposal, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this proposal"
        )

    # Convert all ObjectIds to strings
    return serialize_proposal(proposal)


@router.patch("/{proposal_id}")
async def update_proposal(
    proposal_id: str,
    updates: ProposalUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update proposal (name, rates, jobs, spreadsheet data, etc.).
    """
    crud = await get_crud()

    # Convert Pydantic model to dict, excluding None values
    update_dict = updates.dict(exclude_none=True)

    if not update_dict:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )

    updated_proposal = await crud.update_proposal(
        proposal_id,
        str(current_user["_id"]),
        update_dict
    )

    if not updated_proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Convert all ObjectIds to strings
    return serialize_proposal(updated_proposal)


@router.patch("/{proposal_id}/positions/{position_index}")
async def update_position_subcontractor_hours(
    proposal_id: str,
    position_index: int,
    update_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    """
    Update a specific position's subcontractor hours.

    This allows splitting a position between prime and subcontractor labor.
    """
    crud = await get_crud()
    proposal = await crud.get_proposal(proposal_id, str(current_user["_id"]))

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
    updated_proposal = await crud.update_proposal(
        proposal_id,
        str(current_user["_id"]),
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
    current_user: dict = Depends(get_current_user)
):
    """
    Delete proposal and all associated documents from iDrive e2.
    """
    crud = await get_crud()
    storage = get_idrive_storage()

    # Get proposal first to access documents
    proposal = await crud.get_proposal(proposal_id, str(current_user["_id"]))

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Delete documents from iDrive e2
    try:
        deleted_count = storage.delete_proposal_documents(
            str(current_user["_id"]),
            proposal_id
        )
        print(f"Deleted {deleted_count} documents from iDrive e2")
    except Exception as e:
        print(f"Warning: Failed to delete documents from iDrive: {e}")
        # Continue with proposal deletion even if iDrive cleanup fails

    # Delete proposal from MongoDB
    success = await crud.delete_proposal(proposal_id, str(current_user["_id"]))

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
    current_user: dict = Depends(get_current_user)
):
    """
    Duplicate proposal (copies data, not documents).
    """
    crud = await get_crud()

    new_proposal = crud.duplicate_proposal(
        proposal_id,
        str(current_user["_id"]),
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
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of documents for a proposal with iDrive URLs.
    """
    crud = await get_crud()
    proposal = await crud.get_proposal(proposal_id, str(current_user["_id"]))

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
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a specific document from proposal and iDrive e2.
    """
    crud = await get_crud()
    storage = get_idrive_storage()

    # Get proposal
    proposal = await crud.get_proposal(proposal_id, str(current_user["_id"]))

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
    await crud.update_proposal(
        proposal_id,
        str(current_user["_id"]),
        {"documents": documents}
    )

    return {
        "message": "Document deleted successfully",
        "filename": doc["filename"]
    }


# ============================================================================
# PROPOSAL SHARING (Organization Feature)
# ============================================================================

from pydantic import BaseModel
from auth.dependencies import require_admin
from auth.rbac import can_access_proposal
from utils.helpers import serialize_doc


class ShareProposalRequest(BaseModel):
    """Request body for sharing proposals"""
    user_ids: List[str]


@router.post("/{proposal_id}/share")
async def share_proposal_with_users(
    proposal_id: str,
    share_data: ShareProposalRequest,
    current_user: dict = Depends(require_admin)
):
    """
    Share proposal with specific users (admin only).

    Allows specified users to view the proposal in read-only mode.
    All user_ids must belong to the same organization.

    Args:
        proposal_id: Proposal's ObjectId as string
        share_data: List of user ObjectIds to share with

    Returns:
        Updated proposal document

    Raises:
        HTTPException 400: If invalid IDs or users not in organization
        HTTPException 403: If not admin
        HTTPException 404: If proposal not found
    """
    # Validate proposal ObjectId
    try:
        prop_oid = ObjectId(proposal_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid proposal ID format: {proposal_id}"
        )

    # User IDs are strings (UUIDs), no conversion needed
    if not share_data.user_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one user ID must be provided"
        )

    # Use organization-aware proposal methods
    crud = await get_crud()

    try:
        updated_proposal = await crud.share_proposal(
            proposal_id=prop_oid,
            user_ids=share_data.user_ids,  # Pass strings directly
            admin_id=str(current_user["_id"])
        )

        return {
            "message": "Proposal shared successfully",
            "proposal": serialize_doc(updated_proposal),
            "shared_with_count": len(share_data.user_ids)
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to share proposal: {str(e)}"
        )


@router.delete("/{proposal_id}/share")
async def unshare_proposal(
    proposal_id: str,
    current_user: dict = Depends(require_admin)
):
    """
    Make proposal private (remove all shares) (admin only).

    Removes all users from shared_with list, making proposal
    visible only to owner and admins.

    Args:
        proposal_id: Proposal's ObjectId as string

    Returns:
        Success message

    Raises:
        HTTPException 400: If invalid proposal ID
        HTTPException 403: If not admin or proposal not in your org
        HTTPException 404: If proposal not found
    """
    # Validate ObjectId
    try:
        prop_oid = ObjectId(proposal_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid proposal ID format"
        )

    crud = await get_crud()

    # Get proposal to verify ownership
    proposal = await crud.get_by_id(prop_oid)

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Verify proposal belongs to admin's organization
    if proposal.get("organization_id") != current_user["organization_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify proposals from other organizations"
        )

    # Update to private visibility
    from auth.database import MongoDB
    db = await MongoDB.get_database()
    result = await db["proposals"].update_one(
        {"_id": prop_oid},
        {
            "$set": {
                "visibility": "private",
                "shared_with": [],
                "updated_at": datetime.utcnow()
            }
        }
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found or already private"
        )

    return {
        "message": "Proposal is now private",
        "proposal_id": proposal_id
    }


@router.get("/{proposal_id}/access")
async def get_proposal_access_info(
    proposal_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get access information for a proposal.

    Shows visibility setting and list of users with access.
    Useful for admins to see who can view a proposal.

    Args:
        proposal_id: Proposal's ObjectId as string

    Returns:
        Access information including visibility and shared_with users

    Raises:
        HTTPException 400: If invalid proposal ID
        HTTPException 403: If user cannot access proposal
        HTTPException 404: If proposal not found
    """
    # Validate ObjectId
    try:
        prop_oid = ObjectId(proposal_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid proposal ID format"
        )

    crud = await get_crud()
    proposal = await crud.get_by_id(prop_oid)

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Check if user can access this proposal
    if not can_access_proposal(proposal, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this proposal"
        )

    # Get details of shared users
    shared_with_ids = proposal.get("shared_with", [])
    shared_users = []

    if shared_with_ids:
        from auth.database import MongoDB
        from auth.crud import get_user_crud

        db = await MongoDB.get_database()
        user_crud = await get_user_crud()
        await user_crud._ensure_initialized()

        # Query users by string IDs
        # Try both _id (if they're stored as strings) and a separate id field
        cursor = user_crud.collection.find(
            {
                "$or": [
                    {"_id": {"$in": shared_with_ids}},
                    {"id": {"$in": shared_with_ids}}
                ]
            },
            {"firstName": 1, "lastName": 1, "email": 1, "_id": 1, "id": 1}
        )
        users = await cursor.to_list(length=None)

        for user in users:
            user_id = user.get("id") or str(user.get("_id"))
            shared_users.append({
                "id": user_id,
                "firstName": user.get("firstName", ""),
                "lastName": user.get("lastName", ""),
                "email": user["email"]
            })

    # Check if current user is the owner
    owner_id = str(proposal.get("user_id"))
    current_user_id = str(current_user.get("_id")) if current_user.get("_id") else current_user.get("id")
    is_owner = (owner_id == current_user_id)

    return {
        "proposal_id": proposal_id,
        "visibility": proposal.get("visibility", "private"),
        "owner_id": owner_id,
        "is_owner": is_owner,
        "shared_with": shared_users,
        "shared_count": len(shared_users)
    }
