"""
Company Repository router for managing GSA contract rate sheets.

Handles file upload, parsing, and CRUD operations for company-specific labor rates.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from typing import List, Optional
from pathlib import Path
import tempfile
import shutil
from datetime import datetime

from auth.dependencies import get_current_user, require_admin
from utils.company_repository import get_company_repository_crud
from client.gsa_parser import parse_gsa_contract
from client.idrive_storage import get_idrive_storage
from client.gsa_pinecone import get_gsa_pinecone_client

router = APIRouter(prefix="/api/company-repository", tags=["company-repository"])

# LlamaExtract supported formats + Excel and RTF (we convert these)
ALLOWED_EXTENSIONS = [
    '.pdf', '.csv', '.docx', '.htm', '.html', '.jpeg', '.jpg',
    '.json', '.md', '.png', '.txt',  # LlamaExtract native
    '.xlsx', '.xls',  # Converted to CSV
    '.rtf'  # Converted to TXT
]


def serialize_repo(repo: dict) -> dict:
    """Convert ObjectId to string for JSON serialization."""
    if not repo:
        return repo

    if "_id" in repo:
        repo["id"] = str(repo["_id"])
        del repo["_id"]

    if "organization_id" in repo:
        repo["organization_id"] = str(repo["organization_id"])

    if "created_by" in repo:
        repo["created_by"] = str(repo["created_by"])

    return repo


# ============================================================================
# BACKGROUND PROCESSING
# ============================================================================

async def process_gsa_contract(file_id: str, organization_id: str, file_path: str, temp_dir: Path):
    """
    Background task to parse GSA contract and store to MongoDB + Pinecone in parallel.
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    crud = get_company_repository_crud()

    try:
        # Parse the GSA contract
        result = parse_gsa_contract(file_path)

        # Determine status based on whether date was found
        status = "needs_date" if result["needs_date"] else "active"

        # Define MongoDB update function
        def update_mongodb():
            from auth.database import get_mongodb_client
            mongodb = get_mongodb_client()
            db = mongodb.get_database()

            db["company_repositories"].update_one(
                {"file_id": file_id},
                {"$set": {
                    "contract_number": result["contract_number"],
                    "contract_start_date": result["contract_start_date"],
                    "contract_end_date": result["contract_end_date"],
                    "company_name": result["company_name"],
                    "labor_categories": result["labor_categories"],
                    "labor_category_count": len(result["labor_categories"]),
                    "status": status,
                    "updated_at": datetime.utcnow()
                }}
            )
            print(f"  ✓ MongoDB: Stored {len(result['labor_categories'])} labor categories")

        # Define Pinecone store function
        def store_pinecone():
            if result["labor_categories"]:
                pinecone_client = get_gsa_pinecone_client()
                count = pinecone_client.store_labor_categories(
                    organization_id=organization_id,
                    file_id=file_id,
                    labor_categories=result["labor_categories"]
                )
                print(f"  ✓ Pinecone: Stored {count} vectors")

        # Run MongoDB and Pinecone storage in parallel using thread pool
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=2) as executor:
            mongo_future = loop.run_in_executor(executor, update_mongodb)
            pinecone_future = loop.run_in_executor(executor, store_pinecone)

            # Wait for both to complete
            await asyncio.gather(mongo_future, pinecone_future)

        print(f"✓ Processed GSA contract: {file_id}, {len(result['labor_categories'])} labor categories")

    except Exception as e:
        print(f"✗ Error processing GSA contract {file_id}: {e}")
        crud.update_status(file_id, "error", str(e))
        import traceback
        traceback.print_exc()

    finally:
        # Clean up temp directory
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


# ============================================================================
# UPLOAD ENDPOINT
# ============================================================================

@router.post("/upload")
async def upload_gsa_contract(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    name: str = Form(...),
    current_user: dict = Depends(require_admin)
):
    """
    Upload GSA contract file and start async processing.

    Admin only. Accepts PDF, Excel, RTF, and other formats.

    Returns file_id immediately for status polling.
    """
    file_ext = Path(file.filename).suffix.lower()

    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    try:
        storage = get_idrive_storage()
        crud = get_company_repository_crud()

        # Create temp directory
        temp_dir = Path(tempfile.mkdtemp())
        file_path = temp_dir / file.filename

        # Save uploaded file temporarily
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Create initial record in MongoDB
        org_id = str(current_user["organization_id"])
        user_id = str(current_user["_id"])

        repo_data = {
            "name": name,
            "status": "processing"
        }

        repo = crud.create(org_id, user_id, repo_data)
        file_id = repo["file_id"]

        # Upload to iDrive
        idrive_url, idrive_key = storage.upload_document(
            file_path=str(file_path),
            user_id=user_id,
            proposal_id=f"gsa_{file_id}",
            filename=file.filename
        )

        # Update record with file info
        from auth.database import get_mongodb_client
        mongodb = get_mongodb_client()
        db = mongodb.get_database()

        db["company_repositories"].update_one(
            {"file_id": file_id},
            {"$set": {
                "original_file": {
                    "filename": file.filename,
                    "file_size": file.size,
                    "idrive_key": idrive_key,
                    "idrive_url": idrive_url
                }
            }}
        )

        # Start background processing
        background_tasks.add_task(
            process_gsa_contract,
            file_id,
            org_id,
            str(file_path),
            temp_dir
        )

        return {
            "file_id": file_id,
            "status": "processing",
            "message": "File uploaded, processing started"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# LIST & GET ENDPOINTS
# ============================================================================

@router.get("")
async def list_company_repositories(
    current_user: dict = Depends(get_current_user)
):
    """List all GSA contracts for the organization."""
    crud = get_company_repository_crud()
    org_id = str(current_user["organization_id"])

    repos = crud.get_by_organization(org_id)
    return [serialize_repo(r) for r in repos]


@router.get("/{file_id}")
async def get_company_repository(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get full details of a GSA contract."""
    crud = get_company_repository_crud()
    org_id = str(current_user["organization_id"])

    repo = crud.get_by_file_id(file_id, org_id)
    if not repo:
        raise HTTPException(status_code=404, detail="GSA contract not found")

    return serialize_repo(repo)


@router.get("/{file_id}/status")
async def get_processing_status(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Check processing status of uploaded GSA contract."""
    crud = get_company_repository_crud()
    org_id = str(current_user["organization_id"])

    repo = crud.get_by_file_id(file_id, org_id)
    if not repo:
        raise HTTPException(status_code=404, detail="GSA contract not found")

    return {
        "file_id": file_id,
        "status": repo.get("status", "unknown"),
        "error_message": repo.get("error_message"),
        "labor_category_count": repo.get("labor_category_count", 0)
    }


# ============================================================================
# UPDATE & DELETE ENDPOINTS
# ============================================================================

@router.patch("/{file_id}")
async def update_company_repository(
    file_id: str,
    name: Optional[str] = None,
    contract_start_date: Optional[str] = None,
    contract_end_date: Optional[str] = None,
    current_user: dict = Depends(require_admin)
):
    """
    Update GSA contract details. Admin only.

    Used to set contract dates if LLM couldn't extract them.
    """
    crud = get_company_repository_crud()
    org_id = str(current_user["organization_id"])

    # Build updates
    updates = {}
    if name:
        updates["name"] = name
    if contract_start_date:
        updates["contract_start_date"] = contract_start_date
    if contract_end_date:
        updates["contract_end_date"] = contract_end_date

    # If date was provided and status was needs_date, set to active
    if contract_start_date:
        repo = crud.get_by_file_id(file_id, org_id)
        if repo and repo.get("status") == "needs_date":
            updates["status"] = "active"

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    result = crud.update(file_id, org_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="GSA contract not found")

    return serialize_repo(result)


@router.delete("/{file_id}")
async def delete_company_repository(
    file_id: str,
    current_user: dict = Depends(require_admin)
):
    """Delete a GSA contract. Admin only."""
    crud = get_company_repository_crud()
    org_id = str(current_user["organization_id"])

    repo = crud.get_by_file_id(file_id, org_id)
    if not repo:
        raise HTTPException(status_code=404, detail="GSA contract not found")

    # Delete from iDrive if exists
    if repo.get("original_file", {}).get("idrive_key"):
        try:
            storage = get_idrive_storage()
            storage.delete_document(repo["original_file"]["idrive_key"])
        except Exception as e:
            print(f"Warning: Could not delete from iDrive: {e}")

    # Delete from Pinecone
    try:
        pinecone_client = get_gsa_pinecone_client()
        pinecone_client.delete_labor_categories(org_id, file_id)
    except Exception as e:
        print(f"Warning: Could not delete from Pinecone: {e}")

    # Delete from MongoDB
    success = crud.delete(file_id, org_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete")

    return {"success": True, "message": "GSA contract deleted"}
