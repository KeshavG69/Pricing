"""
Company Repository router for managing GSA contract rate sheets.

Handles file upload, parsing, and CRUD operations for company-specific labor rates.
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends, Body
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from pathlib import Path
import tempfile
import shutil
from datetime import datetime
from functools import lru_cache
import time

from auth.dependencies import get_current_user, require_admin
from utils.company_repository import get_company_repository_crud
from client.gsa_parser import parse_gsa_contract
from client.idrive_storage import get_idrive_storage
from client.gsa_pinecone import get_gsa_pinecone_client

router = APIRouter(prefix="/api/company-repository", tags=["company-repository"])

# Simple cache for list endpoint (5 second TTL)
_list_cache = {}
_cache_ttl = 5  # seconds


def invalidate_list_cache(org_id: str):
    """Invalidate list cache for an organization."""
    cache_key = f"list_{org_id}"
    if cache_key in _list_cache:
        del _list_cache[cache_key]

# LlamaExtract supported formats + Excel and RTF (we convert these)
ALLOWED_EXTENSIONS = [
    '.pdf', '.csv', '.docx', '.htm', '.html', '.jpeg', '.jpg',
    '.json', '.md', '.png', '.txt',  # LlamaExtract native
    '.xlsx', '.xls',  # Converted to CSV
    '.rtf'  # Converted to TXT
]


def serialize_repo(repo: dict) -> dict:
    """
    Convert ObjectId to string for JSON serialization.
    Optimized to minimize dict operations.
    """
    if not repo:
        return repo

    # Create new dict with transformed fields (avoid multiple iterations)
    result = {}

    for key, value in repo.items():
        if key == "_id":
            result["id"] = str(value)
        elif key == "organization_id":
            result["organization_id"] = str(value)
        elif key == "created_by":
            result["uploaded_by"] = str(value)
        elif key == "labor_category_count":
            result["labor_categories_count"] = value
        else:
            result[key] = value

    # Add labor_categories_count if missing
    if "labor_categories_count" not in result:
        if "labor_categories" in result:
            result["labor_categories_count"] = len(result["labor_categories"])
        else:
            result["labor_categories_count"] = 0

    return result


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class LaborCategoryUpdate(BaseModel):
    """Request model for updating labor category fields."""
    title: Optional[str] = None
    sin: Optional[str] = None
    description: Optional[str] = None
    experience: Optional[str] = None
    education: Optional[str] = None
    rates_by_year: Optional[Dict[str, float]] = None


class ContractUpdate(BaseModel):
    """Request model for updating contract metadata."""
    name: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None


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
        # Parse the GSA contract (run in thread to avoid blocking event loop)
        result = await asyncio.to_thread(parse_gsa_contract, file_path)

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

        # Invalidate cache so updated status shows immediately
        invalidate_list_cache(organization_id)

    except Exception as e:
        print(f"✗ Error processing GSA contract {file_id}: {e}")
        crud.update_status(file_id, "error", str(e))
        invalidate_list_cache(organization_id)
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

        # Store URL with expiration timestamp (7 days from now)
        from datetime import timezone
        url_expires_at = datetime.now(timezone.utc).timestamp() + 604800  # 7 days

        db["company_repositories"].update_one(
            {"file_id": file_id},
            {"$set": {
                "original_file": {
                    "filename": file.filename,
                    "file_size": file.size,
                    "idrive_key": idrive_key,
                    "idrive_url": idrive_url,
                    "idrive_url_expires_at": url_expires_at
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

        # Invalidate cache
        invalidate_list_cache(org_id)

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
    """
    List all GSA contracts for the organization.
    Uses 5-second cache for performance.
    """
    org_id = str(current_user["organization_id"])

    # Check cache
    cache_key = f"list_{org_id}"
    now = time.time()

    if cache_key in _list_cache:
        cached_data, cache_time = _list_cache[cache_key]
        if now - cache_time < _cache_ttl:
            return cached_data

    # Cache miss - fetch from database
    crud = get_company_repository_crud()
    repos = crud.get_by_organization(org_id)
    result = [serialize_repo(r) for r in repos]

    # Update cache
    _list_cache[cache_key] = (result, now)

    return result


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
    update_data: ContractUpdate = Body(...),
    current_user: dict = Depends(require_admin)
):
    """
    Update GSA contract details. Admin only.

    Used to set contract dates, name, etc.
    """
    crud = get_company_repository_crud()
    org_id = str(current_user["organization_id"])

    # Build updates from provided fields
    updates = {}
    if update_data.name is not None:
        updates["name"] = update_data.name
    if update_data.contract_start_date is not None:
        updates["contract_start_date"] = update_data.contract_start_date
    if update_data.contract_end_date is not None:
        updates["contract_end_date"] = update_data.contract_end_date

    # If date was provided and status was needs_date, set to active
    if update_data.contract_start_date:
        repo = crud.get_by_file_id(file_id, org_id)
        if repo and repo.get("status") == "needs_date":
            updates["status"] = "active"

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    result = crud.update(file_id, org_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="GSA contract not found")

    # Invalidate cache
    invalidate_list_cache(org_id)

    return serialize_repo(result)


@router.patch("/{file_id}/labor-categories/{lcat_id}")
async def update_labor_category(
    file_id: str,
    lcat_id: str,
    update_data: LaborCategoryUpdate = Body(...),
    current_user: dict = Depends(require_admin)
):
    """
    Update a specific labor category within a GSA contract. Admin only.

    Pinecone update logic:
    - If title or description changes: re-embed vector (semantic search needs new embedding)
    - If SIN/experience/education changes: update metadata only (faster)
    - If rates change: MongoDB only (rates not stored in Pinecone)

    Args:
        file_id: GSA contract file ID
        lcat_id: Labor category ID
        update_data: Fields to update (title, sin, description, experience, education, rates_by_year)
    """
    print(f"[UPDATE LABOR CATEGORY] Received: {update_data}")
    print(f"[UPDATE LABOR CATEGORY] File ID: {file_id}, Labor Cat ID: {lcat_id}")

    crud = get_company_repository_crud()
    org_id = str(current_user["organization_id"])

    # Get contract
    repo = crud.get_by_file_id(file_id, org_id)
    if not repo:
        raise HTTPException(status_code=404, detail="GSA contract not found")

    # Find labor category
    labor_categories = repo.get("labor_categories", [])
    lcat_found = False
    lcat_updated = None
    old_title = None
    old_description = None

    for lcat in labor_categories:
        if lcat.get("lcat_id") == lcat_id:
            lcat_found = True
            old_title = lcat.get("title")
            old_description = lcat.get("description")

            # Update fields if provided
            if update_data.title is not None:
                lcat["title"] = update_data.title
            if update_data.sin is not None:
                lcat["sin"] = update_data.sin
            if update_data.description is not None:
                lcat["description"] = update_data.description
            if update_data.experience is not None:
                lcat["experience"] = update_data.experience
            if update_data.education is not None:
                lcat["education"] = update_data.education
            if update_data.rates_by_year is not None:
                lcat["rates_by_year"] = update_data.rates_by_year

            lcat_updated = lcat
            break

    if not lcat_found:
        raise HTTPException(status_code=404, detail="Labor category not found")

    # Update MongoDB
    result = crud.update(file_id, org_id, {"labor_categories": labor_categories})
    if not result:
        raise HTTPException(status_code=500, detail="Failed to update labor category")

    # Update Pinecone if title or description changed (requires re-embedding)
    needs_reembed = (
        (update_data.title is not None and update_data.title != old_title) or
        (update_data.description is not None and update_data.description != old_description)
    )

    if needs_reembed:
        try:
            pinecone_client = get_gsa_pinecone_client()
            vector_id = f"{org_id}_{file_id}_{lcat_id}"

            # Delete old vector
            index = pinecone_client._ensure_index()
            index.delete(ids=[vector_id])

            # Store new vector with updated embedding
            pinecone_client.store_labor_categories(org_id, file_id, [lcat_updated])

            print(f"✓ Re-embedded labor category: {lcat_id} (title or description changed)")
        except Exception as e:
            print(f"⚠️  Pinecone update failed: {e}")
            # Don't fail the whole request - Pinecone is secondary to MongoDB

    # Invalidate cache
    invalidate_list_cache(org_id)

    return serialize_repo(result)


@router.get("/{file_id}/document-url")
async def get_contract_document_url(
    file_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a presigned URL to view/download the original GSA contract document.

    Returns cached presigned URL if still valid (7 days), otherwise generates new one.
    URLs are cached in MongoDB to avoid regenerating on every request.
    """
    crud = get_company_repository_crud()
    org_id = str(current_user["organization_id"])

    repo = crud.get_by_file_id(file_id, org_id)
    if not repo:
        raise HTTPException(status_code=404, detail="GSA contract not found")

    # Check if file has an iDrive key
    original_file = repo.get("original_file", {})
    idrive_key = original_file.get("idrive_key")

    if not idrive_key:
        raise HTTPException(
            status_code=404,
            detail="Original document not found in storage"
        )

    # Check if we have a cached URL that's still valid
    from datetime import timezone
    cached_url = original_file.get("idrive_url")
    url_expires_at = original_file.get("idrive_url_expires_at")
    current_timestamp = datetime.now(timezone.utc).timestamp()

    # If cached URL exists and is still valid (not expired), return it
    if cached_url and url_expires_at and url_expires_at > current_timestamp:
        time_remaining = int(url_expires_at - current_timestamp)
        return {
            "url": cached_url,
            "filename": original_file.get("filename", "contract.pdf"),
            "expires_in": time_remaining,
            "cached": True
        }

    # Otherwise, generate fresh presigned URL and cache it
    try:
        storage = get_idrive_storage()
        presigned_url = storage.get_presigned_url(idrive_key)
        new_expires_at = current_timestamp + 604800  # 7 days from now

        # Update MongoDB with new cached URL
        from auth.database import get_mongodb_client
        mongodb = get_mongodb_client()
        db = mongodb.get_database()

        db["company_repositories"].update_one(
            {"file_id": file_id},
            {"$set": {
                "original_file.idrive_url": presigned_url,
                "original_file.idrive_url_expires_at": new_expires_at
            }}
        )

        return {
            "url": presigned_url,
            "filename": original_file.get("filename", "contract.pdf"),
            "expires_in": 604800,
            "cached": False
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate document URL: {str(e)}"
        )


# ============================================================================
# AI SEARCH ENDPOINT
# ============================================================================

class GSASearchAIRequest(BaseModel):
    """Request model for AI-powered GSA labor category search."""
    labor_category: str = Field(..., description="Job title or labor category to search for")
    description: Optional[str] = Field(None, description="Job description for better matching")
    top_k: int = Field(5, ge=1, le=20, description="Number of top matches to return")


@router.post("/{file_id}/search-ai")
async def search_gsa_labor_categories_ai(
    file_id: str,
    request: GSASearchAIRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    AI-powered GSA labor category search using Pinecone vector search.

    Uses semantic search with OpenAI embeddings to find the most relevant
    labor categories from the specified GSA contract.

    Args:
        file_id: GSA contract file ID
        request: Search request with labor_category, description (optional), and parameters
        current_user: Authenticated user (from JWT token)

    Returns:
        Dict with status and list of AI-suggested labor categories with similarity scores
    """
    try:
        org_id = str(current_user["organization_id"])

        # Verify user has access to this GSA contract
        crud = get_company_repository_crud()
        repo = crud.get_by_file_id(file_id, org_id)
        if not repo:
            raise HTTPException(status_code=404, detail="GSA contract not found")

        # Build search query
        query = request.labor_category
        if request.description:
            query = f"{query}: {request.description}"

        # Search using Pinecone
        pinecone_client = get_gsa_pinecone_client()
        results = pinecone_client.search_labor_categories(
            query=query,
            organization_id=org_id,
            file_id=file_id,
            top_k=request.top_k
        )

        # Get rates from MongoDB for each matching category
        labor_categories = repo.get("labor_categories", [])
        lcat_rates = {lcat["lcat_id"]: lcat.get("rates_by_year", {}) for lcat in labor_categories}

        # Format results with rates
        suggestions = []
        for i, match in enumerate(results):
            suggestions.append({
                "lcat_id": match["lcat_id"],
                "title": match["title"],
                "rates_by_year": lcat_rates.get(match["lcat_id"], {}),
                "similarity_score": round(match["score"], 4),
                "is_best_match": i == 0
            })

        return {
            "status": "success",
            "suggestions": suggestions
        }

    except HTTPException:
        raise

    except Exception as e:
        print(f"❌ GSA AI search failed: {e}")
        import traceback
        traceback.print_exc()

        return {
            "status": "success",
            "suggestions": []
        }


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

    # Invalidate cache
    invalidate_list_cache(org_id)

    return {"success": True, "message": "GSA contract deleted"}
