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
# OLD: from client.jd_parser import parse_documents_to_dataframe  # Replaced by intelligent parser
from client.intelligent_parser import parse_document_intelligent
from utils.pipeline import process_dataframe_with_agents

# Position splitting
from routers.pricing import split_position_by_hours, split_multi_year_position

# Billing
from client.stripe_client import get_stripe_service, ChargeType
from utils.billing_crud import get_billing_crud

# Storage
from client.idrive_storage import get_idrive_storage

# Database
from auth.database import get_mongodb_client

router = APIRouter(prefix="/proposals", tags=["proposals"])

# Document preview cache (in-memory with 7-day TTL)
import time

class DocumentCache:
    """Simple in-memory cache for document previews with 7-day TTL."""

    def __init__(self):
        self._cache = {}  # {idrive_key: (content, content_type, timestamp)}
        self._ttl = 7 * 24 * 60 * 60  # 7 days in seconds

    def get(self, key: str):
        """Get cached document if exists and not expired."""
        if key in self._cache:
            content, content_type, timestamp = self._cache[key]
            # Check if expired (7 days)
            if time.time() - timestamp < self._ttl:
                return content, content_type
            else:
                # Expired, remove from cache
                del self._cache[key]
        return None, None

    def set(self, key: str, content: bytes, content_type: str):
        """Cache document content with 7-day TTL."""
        self._cache[key] = (content, content_type, time.time())

# Global document cache instance
document_cache = DocumentCache()

# Get singleton ProposalCRUD instance
async def get_crud():
    """Get singleton ProposalCRUD instance (async, thread-safe)."""
    return get_proposal_crud()


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

    # Convert snake_case to camelCase for date fields and ensure ISO format with timezone
    if "created_at" in proposal:
        dt = proposal.pop("created_at")
        # Ensure timezone-aware ISO format (MongoDB datetimes are UTC)
        if dt:
            iso_str = dt.isoformat()
            proposal["createdAt"] = iso_str if iso_str.endswith('Z') or '+' in iso_str else iso_str + 'Z'
        else:
            proposal["createdAt"] = None
    if "updated_at" in proposal:
        dt = proposal.pop("updated_at")
        # Ensure timezone-aware ISO format (MongoDB datetimes are UTC)
        if dt:
            iso_str = dt.isoformat()
            proposal["updatedAt"] = iso_str if iso_str.endswith('Z') or '+' in iso_str else iso_str + 'Z'
        else:
            proposal["updatedAt"] = None

    return proposal


def convert_intelligent_output_to_dataframe(intelligent_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert intelligent parser output to the same format as jd_parser output.

    Args:
        intelligent_result: Output from parse_document_intelligent()

    Returns:
        Dict with keys: df, travel, odcs, extensions (same as parse_documents_to_dataframe)
    """
    import pandas as pd

    metadata = intelligent_result.get("metadata", {})
    positions = intelligent_result.get("positions", [])
    travel = intelligent_result.get("travel", [])
    odcs = intelligent_result.get("odcs", [])
    extensions = intelligent_result.get("extensions", [])

    # Build months_per_year dict from extensions
    total_years = metadata.get("total_years", 5)
    months_per_year_dict = {}

    # Default: all regular years have 12 months
    for year in range(1, total_years + 1):
        months_per_year_dict[str(year)] = 12

    # Add extension years with their specific month counts
    for ext in extensions:
        ext_year = ext.get("year")
        ext_months = ext.get("duration_months", 6)
        if ext_year:
            months_per_year_dict[str(ext_year)] = ext_months

    # Convert positions to DataFrame rows
    rows = []
    for pos in positions:
        # Extract hours_per_year dict
        hours_per_year = pos.get("hours_per_year", {})

        # Extract ot_hours_per_year if present (optional field)
        ot_hours_per_year = pos.get("ot_hours_per_year", None)

        row = {
            "labor_category": pos.get("labor_category", ""),
            "description": pos.get("description", ""),
            "experience": pos.get("experience"),
            "location": pos.get("location"),
            "location_type": pos.get("location_type", "On-Site"),
            "is_key_position": pos.get("is_key_position", False),
            "is_surge": pos.get("is_surge", False),  # NEW: Surge position flag
            "hours_per_year": hours_per_year,
            "ot_hours_per_year": ot_hours_per_year,  # NEW: Overtime hours per year

            # Metadata (document-level info)
            "base_years": metadata.get("base_years", 1),
            "option_years": metadata.get("option_years", 4),
            "total_years": metadata.get("total_years", 5),
            "project_name": metadata.get("project_name"),
            "standard_fte_hours": metadata.get("standard_fte_hours", 1920),
            "months_per_year": months_per_year_dict if months_per_year_dict else None
        }

        rows.append(row)

    # Create DataFrame
    df = pd.DataFrame(rows)

    # Convert travel list
    travel_list = []
    for t in travel:
        travel_list.append({
            "description": t.get("description", ""),
            "amount_per_year": t.get("amount_per_year", {})
        })

    # Convert ODCs list
    odc_list = []
    for o in odcs:
        odc_list.append({
            "category": o.get("category", ""),
            "description": o.get("description", ""),
            "amount_per_year": o.get("amount_per_year", {})
        })

    # Convert extensions list
    extension_list = []
    for e in extensions:
        extension_list.append({
            "year": e.get("year"),
            "label": e.get("label", ""),
            "duration_months": e.get("duration_months", 6),
            "description": e.get("description", "")
        })

    return {
        "df": df,
        "travel": travel_list,
        "odcs": odc_list,
        "extensions": extension_list
    }


# ============================================================================
# DOCUMENT UPLOAD & ASYNC PROCESSING
# ============================================================================

async def process_proposal_documents(
    proposal_id: str,
    user_id: str,
    organization_id: str,
    file_paths: List[str],
    file_names: List[str],
    temp_dir: Path,
    wage_source: Dict[str, Any] = None,
    preserved_advanced_mode: bool = None,
    preserved_subcontractor_configured: bool = None,
    preserved_subcontractors: List[Dict] = None
):
    """
    Background task to process uploaded documents.

    For re-ingestion, preserved_* parameters will restore the previous state.

    Updates proposal status as processing progresses.
    Uses singleton ProposalCRUD instance for thread safety.

    Args:
        wage_source: {"type": "bls"} or {"type": "gsa", "file_id": "..."}
    """
    # Get singleton CRUD instance
    crud = await get_crud()

    # Default to BLS if not specified
    if wage_source is None:
        wage_source = {"type": "bls"}

    try:
        # Get organization settings for default rates and escalation rate
        default_escalation_rate = 0.03  # Fallback default
        default_rates = {
            "fringe": 0.247,
            "oh_onsite": 0.0711,
            "oh_offsite": 0.0711,
            "ga": 0.2243,
            "fee": 0.07,
            "smh": 0.065,
            "sub_fee": 0.05,
            "ga_passthrough": 0.025,
            "ga_adder": 0.0,
            "ot_multiplier": 1.5,  # Overtime multiplier (1.5 = time-and-a-half)
            "surge_multiplier": 1.15  # Surge pricing multiplier (15% premium)
        }

        if organization_id:
            from utils.organizations import get_organization_crud
            org_crud = get_organization_crud()
            org = org_crud.get_by_id(ObjectId(organization_id))
            if org and "settings" in org:
                settings = org.get("settings", {})
                default_escalation_rate = settings.get("default_escalation_rate", 0.03)
                if "default_rates" in settings:
                    default_rates = settings.get("default_rates")

        # Update status to processing
        crud.update_proposal(
            proposal_id,
            user_id,
            {"status": "processing", "progress": 0, "message": "Parsing documents..."}
        )

        # Step 1: Parse documents with Intelligent Parser (replaces JD parser)
        # Use first file (for multi-file support, we'd loop and merge)
        intelligent_result = await parse_document_intelligent(file_paths[0])

        # Convert intelligent parser output to DataFrame format
        parse_result = convert_intelligent_output_to_dataframe(intelligent_result)
        df = parse_result["df"]
        extracted_travel = parse_result.get("travel", [])
        extracted_odcs = parse_result.get("odcs", [])
        extracted_extensions = parse_result.get("extensions", [])
        extracted_surge = intelligent_result.get("surge", None)  # Extract surge from raw result

        crud.update_proposal(
            proposal_id,
            user_id,
            {"progress": 30, "message": f"Found {len(df)} positions, {len(extracted_travel)} Travel items, {len(extracted_odcs)} ODCs. Fetching wage data..."}
        )

        # NEW: Fetch organization rates for BLS comparison (if GSA mode)
        organization_rates = None
        if wage_source.get("type") == "gsa":
            try:
                from utils.organizations import get_organization_crud
                org_crud = get_organization_crud()
                org = org_crud.get_by_id(ObjectId(organization_id))

                if org and org.get("settings"):
                    default_rates = org["settings"].get("default_rates", {})
                    organization_rates = {
                        "fringe": default_rates.get("fringe", 0.247),
                        "oh_onsite": default_rates.get("oh_onsite", default_rates.get("oh", 0.0711)),
                        "oh_offsite": default_rates.get("oh_offsite", default_rates.get("oh", 0.0711)),
                        "ga": default_rates.get("ga", 0.2243),
                        "fee": default_rates.get("fee", 0.07)
                    }
                    print(f"📊 Using organization rates for BLS comparison: Fringe={organization_rates['fringe']}, OH On-Site={organization_rates['oh_onsite']}, OH Off-Site={organization_rates['oh_offsite']}, G&A={organization_rates['ga']}, Fee={organization_rates['fee']}")
            except Exception as e:
                print(f"⚠️ Failed to fetch organization rates for BLS comparison: {e}")
                # Continue without rates - no discount suggestions will be generated

        # Step 2: Process with agents (BLS or GSA based on wage_source)
        final_df = await process_dataframe_with_agents(
            df,
            max_workers=10,
            wage_source=wage_source,
            organization_id=organization_id,
            organization_rates=organization_rates  # NEW: Pass rates for BLS comparison
        )

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

        # Generate dynamic escalation rates based on total_years using organization default
        escalation_rates = {}
        for year in range(1, total_years):
            key = f"{year}_to_{year + 1}"
            escalation_rates[key] = default_escalation_rate

        # Charge for basic proposal (with free first proposal logic)
        billing_status = "unpaid"
        billing_message = None
        should_trigger_advanced = False

        try:
            stripe_service = get_stripe_service()
            billing_crud = get_billing_crud()

            # Check if already charged (idempotent)
            if not billing_crud.is_proposal_charged(proposal_id, "basic"):
                # Get proposal name for description
                proposal_doc = crud.get_by_id(ObjectId(proposal_id))
                proposal_name = proposal_doc.get("name", "Untitled") if proposal_doc else "Untitled"

                # Check for free first proposal
                first_free_proposal_id = org.get("first_free_proposal_id") if org else None
                is_first_proposal = first_free_proposal_id is None

                if is_first_proposal:
                    # FREE FIRST PROPOSAL
                    billing_id = billing_crud.create_billing_record(
                        organization_id=str(org["_id"]),
                        proposal_id=proposal_id,
                        charge_type="basic",
                        amount_cents=0,
                        description=f"PriceIQ Basic (Free First Proposal): {proposal_name[:50]}",
                        triggered_by_user_id=user_id,
                        status="succeeded"
                    )

                    # Set first_free_proposal_id
                    org_crud = get_organization_crud()
                    org_crud.collection.update_one(
                        {"_id": org["_id"]},
                        {"$set": {"first_free_proposal_id": ObjectId(proposal_id), "updated_at": datetime.utcnow()}}
                    )

                    billing_status = "paid"
                    should_trigger_advanced = True  # Auto-trigger advanced for free first proposal

                elif stripe_service.is_configured and org and org.get("stripe_customer_id") and org.get("default_payment_method_id"):
                    # PAID PROPOSAL (not first)
                    amount_cents = stripe_service.get_price(ChargeType.BASIC)
                    billing_id = billing_crud.create_billing_record(
                        organization_id=str(org["_id"]),
                        proposal_id=proposal_id,
                        charge_type="basic",
                        amount_cents=amount_cents,
                        description=f"PriceIQ Basic: {proposal_name[:50]}",
                        triggered_by_user_id=user_id,
                        status="pending"
                    )

                    # Charge
                    result = stripe_service.charge_for_proposal(
                        customer_id=org["stripe_customer_id"],
                        payment_method_id=org["default_payment_method_id"],
                        charge_type=ChargeType.BASIC,
                        proposal_id=proposal_id,
                        proposal_name=proposal_name,
                        organization_id=str(org["_id"])
                    )

                    if result["success"]:
                        billing_status = "paid"
                        billing_crud.collection.update_one(
                            {"_id": ObjectId(billing_id)},
                            {"$set": {
                                "stripe_payment_intent_id": result["payment_intent_id"],
                                "status": "succeeded",
                                "updated_at": datetime.utcnow()
                            }}
                        )
                    else:
                        billing_status = "failed"
                        billing_message = result.get("error", "Payment failed")
                        billing_crud.collection.update_one(
                            {"_id": ObjectId(billing_id)},
                            {"$set": {
                                "status": "failed",
                                "error_message": billing_message,
                                "updated_at": datetime.utcnow()
                            }}
                        )
                else:
                    # No payment method and not first proposal
                    billing_status = "unpaid"
                    billing_message = "Payment method required"
            else:
                billing_status = "paid"  # Already charged
        except Exception as billing_error:
            import traceback
            traceback.print_exc()
            billing_message = f"Billing error: {str(billing_error)}"
            # Don't fail the whole proposal processing for billing errors

        # Determine mode state (preserved from re-ingestion or new upload logic)
        final_advanced_mode = preserved_advanced_mode if preserved_advanced_mode is not None else should_trigger_advanced
        final_subcontractor_configured = preserved_subcontractor_configured if preserved_subcontractor_configured is not None else False
        final_subcontractors = preserved_subcontractors if preserved_subcontractors is not None else []

        # Log re-ingestion vs new upload
        if preserved_advanced_mode is not None:
            print(f"[RE-INGEST] Restoring preserved state:")
            print(f"  - advanced_mode: {final_advanced_mode}")
            print(f"  - subcontractor_configured: {final_subcontractor_configured}")
            print(f"  - subcontractors: {len(final_subcontractors)} preserved")

        # CRITICAL: Generate unique IDs for positions if missing
        # This ensures frontend state management works correctly
        import time
        timestamp = int(time.time() * 1000)  # Milliseconds since epoch
        for i, job in enumerate(cleaned_jobs):
            if not job.get("id"):
                # Generate unique ID: pos_{index}_{timestamp}_{random}
                import random
                random_suffix = random.randint(1000, 9999)
                job["id"] = f"pos_{i}_{timestamp}_{random_suffix}"
                print(f"[ID GEN] Generated ID for position {i}: {job['id']} ({job.get('labor_category', 'Unknown')})")

        # Update proposal with results (NO duplication - all data in spreadsheet_data)
        crud.update_proposal(
            proposal_id,
            user_id,
            {
                "status": "completed",
                "business_status": "active",  # Auto-assign active status when completed
                "progress": 100,
                "message": billing_message or "Processing complete",
                "billing_status": billing_status,
                "metadata": {
                    "total_jobs": len(cleaned_jobs),
                    "base_years": base_years,
                    "option_years": option_years,
                    "total_years": total_years,
                    "fte_hours_threshold": fte_threshold
                },
                "spreadsheet_data": {
                    "positions": cleaned_jobs,  # Single source of truth (now with IDs!)
                    "travel": extracted_travel,
                    "odcs": extracted_odcs,
                    "extensions": extracted_extensions,
                    "surge": extracted_surge,
                    "rates": default_rates,  # Only in spreadsheet_data
                    "escalation_rates": escalation_rates,  # Only in spreadsheet_data
                    "advanced_mode": final_advanced_mode,  # Preserved for re-ingest, or auto-enabled for free first proposal
                    "subcontractor_configured": final_subcontractor_configured,  # Preserved for re-ingest
                    "subcontractors": final_subcontractors  # Preserved for re-ingest (names only, no positions)
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
    name: str = Form(...),
    solicitation_number: str = Form(None),
    wage_source_type: str = Form("bls"),
    wage_source_file_id: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload documents, store in iDrive e2, and start async processing.

    Args:
        files: Document files to upload
        name: Proposal name (required)
        solicitation_number: Optional solicitation number
        wage_source_type: "bls" (default) or "gsa"
        wage_source_file_id: GSA contract file_id (required if wage_source_type is "gsa")

    Returns proposal_id immediately for status polling.
    """
    try:
        # Build wage source config
        wage_source = {"type": wage_source_type}
        if wage_source_type == "gsa" and wage_source_file_id:
            wage_source["file_id"] = wage_source_file_id

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
        # Note: prime_contractor_name will be set by frontend from organization data
        proposal_data = {
            "name": name,
            "solicitation_number": solicitation_number,
            "prime_contractor_name": "TBD",  # Frontend will update this from org data
            "documents": [],
            "progress": 0,
            "message": "Uploading documents...",
            "wage_source": wage_source
        }

        # Use organization-aware creation if user belongs to an organization
        if current_user.get("organization_id"):
            proposal = crud.create_proposal_with_organization(
                user_id=str(current_user["_id"]),  # Pass as string (UUID format)
                organization_id=current_user["organization_id"],
                data=proposal_data
            )
        else:
            # Fallback to old method for backward compatibility
            proposal = crud.create_proposal(str(current_user["_id"]), proposal_data)

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
        crud.update_proposal(
            proposal_id,
            str(current_user["_id"]),
            {"documents": documents_info},
            organization_id=current_user.get("organization_id"),
            role=current_user.get("role")
        )

        # Start background processing
        background_tasks.add_task(
            process_proposal_documents,
            proposal_id,
            str(current_user["_id"]),
            str(current_user.get("organization_id")),
            file_paths,
            file_names,
            temp_dir,
            wage_source
        )

        # Auto-completion hook: Mark first proposal uploaded
        try:
            from utils.onboarding import get_onboarding_crud
            onboarding_crud = get_onboarding_crud()
            onboarding_crud.update_task(
                user_id=str(current_user["_id"]),
                organization_id=str(current_user.get("organization_id")),
                task_id="first_proposal_uploaded",
                completed=True
            )
        except Exception as e:
            # Don't fail request if onboarding update fails
            print(f"Failed to update onboarding progress: {e}")

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


@router.post("/{proposal_id}/reingest")
async def reingest_proposal_documents(
    proposal_id: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    wage_source_type: str = Form("bls"),
    wage_source_file_id: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Re-ingest new documents for an existing proposal, preserving workspace mode.

    This endpoint:
    1. Retrieves the existing proposal
    2. Preserves the current advancedMode state and subcontractor names
    3. Uploads new documents to iDrive e2
    4. Processes the new documents
    5. Replaces proposal data while preserving mode state

    Args:
        proposal_id: ID of existing proposal to re-ingest
        files: New document files to upload (multiple supported)
        wage_source_type: "bls" (default) or "gsa"
        wage_source_file_id: GSA contract file_id (required if wage_source_type is "gsa")

    Returns:
        Proposal ID and processing status
    """
    from datetime import datetime
    from pymongo import ReturnDocument

    try:
        # Initialize services
        crud = await get_crud()
        storage = get_idrive_storage()

        # Get user's organization and role for access control
        organization_id = current_user.get("organization_id")
        role = current_user.get("role")

        # Get existing proposal
        proposal = crud.get_proposal(
            proposal_id,
            str(current_user["_id"]),
            organization_id=organization_id,
            role=role
        )

        if not proposal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proposal not found"
            )

        # PRESERVE: Save the current workspace mode state
        spreadsheet_data = proposal.get("spreadsheet_data", {})
        preserved_advanced_mode = spreadsheet_data.get("advanced_mode", False)
        preserved_subcontractor_configured = spreadsheet_data.get("subcontractor_configured", False)

        # PRESERVE: Save subcontractor names (empty positions)
        existing_subcontractors = spreadsheet_data.get("subcontractors", [])
        preserved_subcontractors = [
            {
                "id": sub.get("id"),
                "name": sub.get("name"),
                "positions": []  # Empty - will be filled by user after re-ingestion
            }
            for sub in existing_subcontractors
        ]

        print(f"[RE-INGEST] Preserving state for proposal {proposal_id}:")
        print(f"  - advanced_mode: {preserved_advanced_mode}")
        print(f"  - subcontractor_configured: {preserved_subcontractor_configured}")
        print(f"  - subcontractors: {len(preserved_subcontractors)} preserved")

        # Build wage source config
        wage_source = {"type": wage_source_type}
        if wage_source_type == "gsa" and wage_source_file_id:
            wage_source["file_id"] = wage_source_file_id

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

        # Upload new documents to iDrive e2 (replacing old ones)
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

        # Update proposal with new documents and reset status to processing
        # IMPORTANT: Use direct collection update to avoid user_id permission issues
        print(f"[RE-INGEST] Updating proposal {proposal_id} status to 'processing'...")

        # Direct database update (bypasses user_id check)
        update_result = crud.collection.find_one_and_update(
            {"_id": ObjectId(proposal_id)},
            {
                "$set": {
                    "documents": documents_info,
                    "status": "processing",
                    "progress": 0,
                    "message": "Re-ingesting documents...",
                    "wage_source": wage_source,
                    "updated_at": datetime.utcnow()
                }
            },
            return_document=ReturnDocument.AFTER
        )

        if not update_result:
            print(f"[RE-INGEST ERROR] Failed to update proposal {proposal_id} in database")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update proposal - please try again"
            )

        print(f"[RE-INGEST] ✅ Updated proposal status to 'processing'")
        print(f"[RE-INGEST] Status after update: {update_result.get('status')}")
        print(f"[RE-INGEST] Message after update: {update_result.get('message')}")
        print(f"[RE-INGEST] Progress after update: {update_result.get('progress')}")

        # Start background processing (will preserve mode state)
        # IMPORTANT: Pass owner's ID for background updates
        proposal_owner_id = str(proposal.get("user_id"))
        background_tasks.add_task(
            process_proposal_documents,
            proposal_id,
            proposal_owner_id,  # Use owner's ID for updates
            str(current_user.get("organization_id")),  # Organization stays the same
            file_paths,
            file_names,
            temp_dir,
            wage_source,
            preserved_advanced_mode,  # Pass preserved state
            preserved_subcontractor_configured,  # Pass preserved state
            preserved_subcontractors  # Pass preserved subcontractors
        )

        return {
            "proposal_id": proposal_id,
            "status": "processing",
            "message": f"Re-ingestion started. Processing {len(files)} file(s).",
            "preserved_state": {
                "advanced_mode": preserved_advanced_mode,
                "subcontractor_configured": preserved_subcontractor_configured,
                "subcontractors_count": len(preserved_subcontractors)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        # Clean up on error
        if 'temp_dir' in locals() and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Re-ingest failed: {str(e)}"
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

    # Get user's organization and role for access control
    organization_id = current_user.get("organization_id")
    role = current_user.get("role")

    proposal = crud.get_proposal(
        proposal_id,
        str(current_user["_id"]),
        organization_id=organization_id,
        role=role
    )

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

@router.get("/stats")
async def get_proposal_stats(
    current_user: dict = Depends(get_current_user)
):
    """
    Get proposal statistics for the current user with business status breakdown.

    Returns:
        Statistics with count and value for active, analyzed (active+no-bid),
        no-bid, and submitted proposals, plus processing and error counts.

    Optimized: Uses single aggregation pipeline with $facet
    """
    crud = await get_crud()

    try:
        # Get user's organization ID and role
        organization_id = current_user.get("organization_id")
        role = current_user.get("role")

        # Build base query
        if organization_id:
            if role == "admin":
                match_query = {"organization_id": organization_id}
            else:
                match_query = {
                    "$or": [
                        {"user_id": str(current_user["_id"])},
                        {"shared_with": str(current_user["_id"])}
                    ],
                    "organization_id": organization_id
                }
        else:
            match_query = {"user_id": str(current_user["_id"])}

        # Use aggregation pipeline to get all counts and values in a single query
        collection = crud.collection
        pipeline = [
            {"$match": match_query},
            {
                "$facet": {
                    "total": [
                        {"$match": {"status": "completed"}},
                        {"$count": "count"}
                    ],
                    "active": [
                        {
                            "$match": {
                                "status": "completed",
                                "business_status": "active"
                            }
                        },
                        {
                            "$group": {
                                "_id": None,
                                "count": {"$sum": 1},
                                "value": {"$sum": {"$ifNull": ["$total_cost", 0]}}
                            }
                        }
                    ],
                    "analyzed": [
                        {
                            "$match": {
                                "status": "completed",
                                "business_status": {"$in": ["active", "no-bid"]}
                            }
                        },
                        {
                            "$group": {
                                "_id": None,
                                "count": {"$sum": 1},
                                "value": {"$sum": {"$ifNull": ["$total_cost", 0]}}
                            }
                        }
                    ],
                    "no_bid": [
                        {
                            "$match": {
                                "status": "completed",
                                "business_status": "no-bid"
                            }
                        },
                        {
                            "$group": {
                                "_id": None,
                                "count": {"$sum": 1},
                                "value": {"$sum": {"$ifNull": ["$total_cost", 0]}}
                            }
                        }
                    ],
                    "submitted": [
                        {
                            "$match": {
                                "status": "completed",
                                "business_status": "submitted"
                            }
                        },
                        {
                            "$group": {
                                "_id": None,
                                "count": {"$sum": 1},
                                "value": {"$sum": {"$ifNull": ["$total_cost", 0]}}
                            }
                        }
                    ],
                    "processing": [
                        {"$match": {"status": "processing"}},
                        {"$count": "count"}
                    ],
                    "error": [
                        {"$match": {"status": "error"}},
                        {"$count": "count"}
                    ]
                }
            }
        ]

        result = list(collection.aggregate(pipeline))

        if result:
            stats = result[0]
            return {
                "total": stats["total"][0]["count"] if stats["total"] else 0,
                "active": {
                    "count": stats["active"][0]["count"] if stats["active"] else 0,
                    "value": stats["active"][0]["value"] if stats["active"] else 0
                },
                "analyzed": {
                    "count": stats["analyzed"][0]["count"] if stats["analyzed"] else 0,
                    "value": stats["analyzed"][0]["value"] if stats["analyzed"] else 0
                },
                "no_bid": {
                    "count": stats["no_bid"][0]["count"] if stats["no_bid"] else 0,
                    "value": stats["no_bid"][0]["value"] if stats["no_bid"] else 0
                },
                "submitted": {
                    "count": stats["submitted"][0]["count"] if stats["submitted"] else 0,
                    "value": stats["submitted"][0]["value"] if stats["submitted"] else 0
                },
                "processing": stats["processing"][0]["count"] if stats["processing"] else 0,
                "error": stats["error"][0]["count"] if stats["error"] else 0
            }

        return {
            "total": 0,
            "active": {"count": 0, "value": 0},
            "analyzed": {"count": 0, "value": 0},
            "no_bid": {"count": 0, "value": 0},
            "submitted": {"count": 0, "value": 0},
            "processing": 0,
            "error": 0
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get proposal statistics: {str(e)}"
        )


@router.get("/analytics/{business_status}")
async def get_business_status_analytics(
    business_status: str,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    """
    Get detailed analytics for proposals with specific business status.

    Supports special "analyzed" status which returns Active + No-Bid combined.
    Returns all proposals matching the status with pagination support.
    Frontend will handle client-side filtering and sorting.
    """
    # Validate status - "analyzed" is special case for Active + No-Bid
    if business_status not in ["active", "no-bid", "submitted", "analyzed"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    crud = await get_crud()
    organization_id = current_user.get("organization_id")
    role = current_user.get("role")

    # Determine which business_status values to query
    # "analyzed" queries both "active" and "no-bid" (superset)
    if business_status == "analyzed":
        status_match = {"$in": ["active", "no-bid"]}
    else:
        status_match = business_status

    # Build base query with org isolation and RBAC
    if organization_id:
        if role == "admin":
            match_query = {
                "organization_id": organization_id,
                "status": "completed",
                "business_status": status_match
            }
        else:
            match_query = {
                "$or": [
                    {"user_id": str(current_user["_id"])},
                    {"shared_with": str(current_user["_id"])}
                ],
                "organization_id": organization_id,
                "status": "completed",
                "business_status": status_match
            }
    else:
        match_query = {
            "user_id": str(current_user["_id"]),
            "status": "completed",
            "business_status": status_match
        }

    collection = crud.collection

    # Get summary metrics using aggregation
    from datetime import datetime
    pipeline = [
        {"$match": match_query},
        {
            "$facet": {
                "metrics": [
                    {
                        "$group": {
                            "_id": None,
                            "count": {"$sum": 1},
                            "total_value": {"$sum": {"$ifNull": ["$total_cost", 0]}},
                            "avg_age_ms": {
                                "$avg": {
                                    "$subtract": [datetime.utcnow(), "$created_at"]
                                }
                            },
                            "contributors": {"$addToSet": "$user_id"}
                        }
                    }
                ],
                "proposals": [
                    {"$sort": {"updated_at": -1}},  # Default sort by updated
                    {"$skip": skip},
                    {"$limit": limit},
                    {
                        "$project": {
                            "_id": 1,
                            "name": 1,
                            "solicitation_number": 1,
                            "total_cost": 1,
                            "business_status": 1,
                            "created_at": 1,
                            "updated_at": 1,
                            "user_id": 1
                        }
                    }
                ]
            }
        }
    ]

    result = list(collection.aggregate(pipeline))

    if not result:
        return {
            "count": 0,
            "total_value": 0,
            "avg_value": 0,
            "avg_age_days": 0,
            "contributors_count": 0,
            "proposals": [],
            "has_more": False
        }

    data = result[0]
    metrics = data["metrics"][0] if data["metrics"] else None

    if not metrics:
        return {
            "count": 0,
            "total_value": 0,
            "avg_value": 0,
            "avg_age_days": 0,
            "contributors_count": 0,
            "proposals": [],
            "has_more": False
        }

    # Calculate metrics
    count = metrics["count"]
    total_value = metrics.get("total_value") or 0
    avg_value = total_value / count if count > 0 else 0
    avg_age_ms = metrics.get("avg_age_ms") or 0
    avg_age_days = (avg_age_ms / (1000 * 60 * 60 * 24)) if avg_age_ms else 0

    # Serialize proposals
    proposals = []
    for prop in data["proposals"]:
        # Format dates with timezone (MongoDB datetimes are UTC)
        created_at = prop.get("created_at")
        updated_at = prop.get("updated_at")
        created_iso = created_at.isoformat() + 'Z' if created_at else None
        updated_iso = updated_at.isoformat() + 'Z' if updated_at else None

        proposals.append({
            "id": str(prop["_id"]),
            "name": prop.get("name", "Untitled"),
            "solicitation_number": prop.get("solicitation_number"),
            "total_cost": prop.get("total_cost"),
            "business_status": prop.get("business_status"),  # Include for tab filtering
            "created_at": created_iso,
            "updated_at": updated_iso,
            "user_id": prop.get("user_id")
        })

    return {
        "count": count,
        "total_value": total_value,
        "avg_value": avg_value,
        "avg_age_days": round(avg_age_days, 1),
        "contributors_count": len(metrics.get("contributors", [])),
        "proposals": proposals,
        "has_more": len(proposals) == limit  # Indicate if more results available
    }


@router.get("/document-proxy")
async def proxy_document(url: str, filename: str = "document"):
    """
    Proxy document content for iframe preview.

    Fetches document from provided URL and streams it back
    without X-Frame-Options header, enabling iframe embedding.

    Note: This endpoint does not require authentication since iframes
    cannot send Authorization headers. Access is controlled by the
    presigned URL which expires after 7 days.

    Args:
        url: IDrive presigned URL to fetch
        filename: Original filename for Content-Disposition header

    Returns:
        StreamingResponse with document content
    """
    from fastapi.responses import StreamingResponse
    import httpx

    # Check cache first (using URL as key)
    cached_content, cached_type = document_cache.get(url)
    if cached_content:
        return StreamingResponse(
            iter([cached_content]),
            media_type=cached_type,
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Cache-Control": "private, max-age=604800",
                "X-Cache": "HIT"
            }
        )

    # Fetch document from IDrive and stream back
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url, follow_redirects=True)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Failed to fetch document: HTTP {response.status_code}"
                )

            content_type = response.headers.get("content-type", "application/octet-stream")

            # Infer content type from filename if generic
            if content_type in ["binary/octet-stream", "application/octet-stream"]:
                ext = filename.lower().split(".")[-1] if "." in filename else ""
                content_types = {
                    "pdf": "application/pdf",
                    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "xls": "application/vnd.ms-excel",
                    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "doc": "application/msword",
                    "csv": "text/csv",
                    "txt": "text/plain",
                    "rtf": "application/rtf"
                }
                content_type = content_types.get(ext, content_type)

            # Cache for 7 days
            document_cache.set(url, response.content, content_type)

            return StreamingResponse(
                iter([response.content]),
                media_type=content_type,
                headers={
                    "Content-Disposition": f'inline; filename="{filename}"',
                    "Cache-Control": "private, max-age=604800",
                    "X-Cache": "MISS"
                }
            )

    except httpx.TimeoutException:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Document fetch timed out")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to proxy document: {str(e)}")


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

    When skip=0, also returns total count and metadata.

    Args:
        skip: Number of proposals to skip for pagination
        limit: Maximum number of proposals to return
        sort_by: Field to sort by ("date", "name", "status")
        sort_order: Sort order ("asc", "desc")

    Returns:
        If skip=0: { proposals: [...], total: int, hasMore: bool }
        Otherwise: [...] (array only for backwards compatibility)
    """
    crud = await get_crud()

    # Get total count when skip=0
    total_count = None
    if skip == 0:
        organization_id = current_user.get("organization_id")
        role = current_user.get("role")

        if organization_id:
            total_count = crud.count_user_proposals(
                user_id=str(current_user["_id"]),
                organization_id=organization_id,
                role=role
            )
        else:
            total_count = crud.count_user_proposals(
                user_id=str(current_user["_id"])
            )

    # Use organization-aware query if user belongs to an organization
    if current_user.get("organization_id"):
        # Note: user_id is stored as string (UUID) in proposals, not ObjectId
        proposals = crud.get_user_proposals_by_org(
            user_id=str(current_user["_id"]),  # Convert to string to match database format
            organization_id=current_user["organization_id"],
            role=current_user.get("role", "user"),
            skip=skip,
            limit=limit,
            sort_by=sort_by,
            sort_order=sort_order
        )
    else:
        # Fallback to old method for backward compatibility
        proposals = crud.get_user_proposals(str(current_user["_id"]), skip, limit, sort_by, sort_order)

    # Convert ObjectId to string for JSON serialization
    result = []
    for prop in proposals:
        prop["_id"] = str(prop["_id"])

        # Format dates with timezone (MongoDB datetimes are UTC)
        created_at = prop.get("created_at")
        updated_at = prop.get("updated_at")
        created_iso = created_at.isoformat() + 'Z' if created_at else None
        updated_iso = updated_at.isoformat() + 'Z' if updated_at else None

        # Only include summary fields (use camelCase for frontend)
        summary = {
            "id": prop["_id"],
            "name": prop.get("name", "Untitled"),
            "solicitation_number": prop.get("solicitation_number"),
            "status": prop.get("status", "draft"),
            "business_status": prop.get("business_status"),  # NEW: business workflow status
            "createdAt": created_iso,  # ISO format with timezone
            "updatedAt": updated_iso,  # ISO format with timezone
            "total_cost": prop.get("total_cost")
        }
        result.append(summary)

    # Return metadata when skip=0, otherwise just the array for backwards compatibility
    if skip == 0 and total_count is not None:
        return {
            "proposals": result,
            "total": total_count,
            "hasMore": len(result) == limit,
            "skip": skip,
            "limit": limit
        }

    return result


@router.patch("/{proposal_id}/business-status")
async def update_business_status(
    proposal_id: str,
    business_status: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Update proposal business status (active, no-bid, submitted).

    All users can change status of their own proposals.
    Status can only be changed for completed proposals.
    """
    # Validate status
    valid_statuses = ["active", "no-bid", "submitted"]
    if business_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be: {', '.join(valid_statuses)}"
        )

    crud = await get_crud()
    organization_id = current_user.get("organization_id")
    role = current_user.get("role")

    # Get proposal with access control
    proposal = crud.get_proposal(
        proposal_id,
        str(current_user["_id"]),
        organization_id=organization_id,
        role=role
    )

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    # Validate can change status
    can_change, reason = crud.can_change_business_status(proposal_id)
    if not can_change:
        raise HTTPException(status_code=400, detail=reason)

    # Update status
    updated = crud.update_proposal(
        proposal_id,
        str(current_user["_id"]),
        {"business_status": business_status},
        organization_id=organization_id,
        role=role
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Failed to update proposal")

    # Serialize and return
    from utils.helpers import serialize_doc
    return serialize_doc(updated)


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
    print(f"[GET PROPOSAL] Request for proposal: {proposal_id}")
    print(f"[GET PROPOSAL] User: {current_user.get('email')}, Org: {current_user.get('organization_id')}")

    # Validate ObjectId
    try:
        prop_oid = ObjectId(proposal_id)
    except Exception as e:
        print(f"[GET PROPOSAL] Invalid ObjectId format: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid proposal ID format"
        )

    crud = await get_crud()
    # Get proposal without user_id filter (we'll check access with RBAC)
    proposal = crud.get_by_id(prop_oid)

    if not proposal:
        print(f"[GET PROPOSAL] Proposal not found in database: {proposal_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    print(f"[GET PROPOSAL] Found proposal: {proposal.get('name')}, status: {proposal.get('status')}")

    # Check for timeout on stuck processing proposals (marks as error if >30 min)
    proposal = crud.check_for_timeout(proposal)

    # Check if user has access (owner, admin, or shared)
    if not can_access_proposal(proposal, current_user):
        print(f"[GET PROPOSAL] Access denied for user {current_user.get('email')}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this proposal"
        )

    print(f"[GET PROPOSAL] Serializing proposal...")
    # Convert all ObjectIds to strings
    serialized = serialize_proposal(proposal)
    print(f"[GET PROPOSAL] Serialized proposal has {len(serialized)} fields")
    print(f"[GET PROPOSAL] Response keys: {list(serialized.keys())[:10]}...")  # First 10 keys
    return serialized


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

    # Get organization_id and role for access control
    organization_id = current_user.get("organization_id")
    role = current_user.get("role")

    updated_proposal = crud.update_proposal(
        proposal_id,
        str(current_user["_id"]),
        update_dict,
        organization_id=organization_id,
        role=role
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
    proposal = crud.get_proposal(proposal_id, str(current_user["_id"]))

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

    # Get organization_id and role for access control
    organization_id = current_user.get("organization_id")
    role = current_user.get("role")

    # Update the proposal with modified jobs
    updated_proposal = crud.update_proposal(
        proposal_id,
        str(current_user["_id"]),
        {"jobs": jobs},
        organization_id=organization_id,
        role=role
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

    Access control:
    - Admins can delete any proposal in their organization
    - Regular users can only delete proposals they own
    """
    crud = await get_crud()
    storage = get_idrive_storage()

    # Get user's organization and role
    organization_id = current_user.get("organization_id")
    role = current_user.get("role")

    # Get proposal first to access documents (with org/role access control)
    proposal = crud.get_proposal(
        proposal_id,
        str(current_user["_id"]),
        organization_id=organization_id,
        role=role
    )

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

    # Delete proposal from MongoDB (with org/role access control)
    success = crud.delete_proposal(
        proposal_id,
        str(current_user["_id"]),
        organization_id=organization_id,
        role=role
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete proposal"
        )

    return {
        "message": "Proposal deleted successfully",
        "deleted_documents": deleted_count
    }


@router.post("/{proposal_id}/mark-downloaded")
async def mark_proposal_downloaded(
    proposal_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Mark proposal as downloaded (Excel file downloaded).

    This updates the proposal status to indicate the user has downloaded
    the Excel file, changing it from "In Progress" to "Submitted".
    """
    crud = await get_crud()

    # Get user's organization and role for access control
    organization_id = current_user.get("organization_id")
    role = current_user.get("role")

    # Check if user has access to this proposal
    proposal = crud.get_proposal(
        proposal_id,
        str(current_user["_id"]),
        organization_id=organization_id,
        role=role
    )

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Update the excel_downloaded field
    updated_proposal = crud.update_proposal(
        proposal_id,
        str(current_user["_id"]),
        {"excel_downloaded": True}
    )

    if not updated_proposal:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to mark proposal as downloaded"
        )

    return {
        "message": "Proposal marked as downloaded",
        "excel_downloaded": True
    }


@router.post("/{proposal_id}/retry")
async def retry_proposal_processing(
    proposal_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Retry processing for a stuck or failed proposal.
    Re-downloads documents from iDrive and re-runs processing.
    """
    crud = await get_crud()
    storage = get_idrive_storage()

    # Get user's organization and role for access control
    organization_id = current_user.get("organization_id")
    role = current_user.get("role")

    # Get proposal with access control
    proposal = crud.get_proposal(
        proposal_id,
        str(current_user["_id"]),
        organization_id=organization_id,
        role=role
    )

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Only allow retry for processing/error status
    if proposal.get("status") not in ["processing", "error"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only retry proposals in processing or error state"
        )

    # Get documents from iDrive
    documents = proposal.get("documents", [])
    if not documents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No documents found. The original files were not saved. Please create a new proposal and upload the documents again."
        )

    # Create temp directory and download files from iDrive
    temp_dir = Path(tempfile.mkdtemp())
    file_paths = []
    file_names = []

    try:
        for doc in documents:
            idrive_key = doc.get("idrive_key")
            filename = doc.get("filename")
            if idrive_key and filename:
                file_path = temp_dir / filename
                storage.download_document(idrive_key, str(file_path))
                file_paths.append(str(file_path))
                file_names.append(filename)
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve documents from storage: {str(e)}"
        )

    if not file_paths:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve any documents for reprocessing"
        )

    # Reset status to processing
    crud.update_proposal(
        proposal_id,
        str(current_user["_id"]),
        {
            "status": "processing",
            "progress": 0,
            "message": "Retrying processing..."
        }
    )

    # Start background processing
    background_tasks.add_task(
        process_proposal_documents,
        proposal_id,
        str(current_user["_id"]),
        str(current_user.get("organization_id")),
        file_paths,
        file_names,
        temp_dir,
        proposal.get("wage_source")
    )

    return {
        "status": "processing",
        "message": "Retry initiated. Processing restarted."
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
    proposal = crud.get_proposal(proposal_id, str(current_user["_id"]))

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
    proposal = crud.get_proposal(proposal_id, str(current_user["_id"]))

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
        updated_proposal = crud.share_proposal(
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
    proposal = crud.get_by_id(prop_oid)

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
    from auth.database import get_mongodb_client
    db = get_mongodb_client().get_database()
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
    proposal = crud.get_by_id(prop_oid)

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
        from auth.database import get_mongodb_client
        from auth.crud import get_user_crud

        db = get_mongodb_client().get_database()
        user_crud = get_user_crud()

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
        users = list(cursor)

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


@router.post("/{proposal_id}/refresh-urls")
async def refresh_document_urls(
    proposal_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Refresh pre-signed URLs for all documents in a proposal.

    Pre-signed URLs expire after 7 days. This endpoint regenerates
    fresh URLs with a new 7-day expiration.

    Args:
        proposal_id: Proposal's ObjectId as string

    Returns:
        Updated proposal with fresh document URLs

    Raises:
        HTTPException 400: If invalid proposal ID
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

    # Get proposal
    proposal_crud = await get_crud()
    proposal = proposal_crud.get_by_id(prop_oid)

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Refresh URLs for all documents
    documents = proposal.get("documents", [])
    if not documents:
        return serialize_proposal(proposal)

    idrive = get_idrive_storage()
    updated_documents = []

    for doc in documents:
        storage_key = doc.get("idrive_key")
        if storage_key:
            try:
                # Generate fresh pre-signed URL (7 days)
                fresh_url = idrive.get_presigned_url(storage_key)
                updated_doc = {**doc, "idrive_url": fresh_url}
                updated_documents.append(updated_doc)
            except Exception as e:
                print(f"Error refreshing URL for {storage_key}: {e}")
                # Keep old URL if refresh fails
                updated_documents.append(doc)
        else:
            updated_documents.append(doc)

    # Update proposal in database
    proposal_crud.collection.update_one(
        {"_id": prop_oid},
        {
            "$set": {
                "documents": updated_documents,
                "updated_at": datetime.utcnow()
            }
        }
    )

    # Fetch updated proposal
    updated_proposal = proposal_crud.get_by_id(prop_oid)

    return serialize_proposal(updated_proposal)


@router.post("/{proposal_id}/positions/{position_id}/refresh-wage")
async def refresh_position_wage_data(
    proposal_id: str,
    position_id: str,
    update_data: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    """
    Refresh wage data for a position when SOC code changes.

    Fetches new wage percentiles from MongoDB wage_data collection
    based on the new SOC code and location, then updates the position.

    Args:
        proposal_id: Proposal ID
        position_id: Position ID (string ID from frontend)
        update_data: Dict with soc_code, soc_title, location?, experience?
        current_user: Authenticated user

    Returns:
        Dict with status and updated wage_data

    Raises:
        HTTPException: If proposal/position not found or wage lookup fails
    """
    from client.oews_mongodb import OEWSMongoLookup

    crud = await get_crud()

    # Get user's organization and role
    organization_id = current_user.get("organization_id")
    role = current_user.get("role")

    # Get proposal with access control
    proposal = crud.get_proposal(
        proposal_id,
        str(current_user["_id"]),
        organization_id=organization_id,
        role=role
    )

    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proposal not found"
        )

    # Get position from spreadsheet_data
    spreadsheet_data = proposal.get("spreadsheet_data", {})
    positions = spreadsheet_data.get("positions", [])

    # Find position by ID
    position_index = None
    position = None
    for i, pos in enumerate(positions):
        if pos.get("id") == position_id:
            position_index = i
            position = pos
            break

    if position is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Position with ID '{position_id}' not found"
        )

    # Extract required fields
    soc_code = update_data.get("soc_code")
    soc_title = update_data.get("soc_title")
    location = update_data.get("location") or position.get("location") or "National"
    experience = update_data.get("experience") or position.get("experience")

    if not soc_code or not soc_title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="soc_code and soc_title are required"
        )

    # Normalize SOC code to XX-XXXX format (accepts both "518000" and "51-8000")
    import re
    soc_code = soc_code.strip()

    # Remove existing hyphens
    clean_code = soc_code.replace('-', '')

    # Validate it's 6 digits
    if not re.match(r'^\d{6}$', clean_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid SOC code format: '{soc_code}'. Expected 6 digits (e.g., '518000' or '51-8000')"
        )

    # Format as XX-XXXX
    soc_code = f"{clean_code[:2]}-{clean_code[2:]}"

    try:
        # Get wage lookup client
        wage_client = OEWSMongoLookup()

        # Fetch wage data for new SOC code (async call)
        wage_data = await wage_client.get_wage_by_soc(soc_code, location)

        if not wage_data or "wages" not in wage_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No wage data found for SOC code '{soc_code}' in location '{location}'. Try 'National' as location."
            )

        wages = wage_data["wages"]

        # Use occupation_name from database (more reliable than user input)
        soc_title = wage_data.get("occupation_name", soc_title)

        # Determine appropriate percentile based on experience
        # Same logic as utils/pipeline.py:process_single_row
        if experience is not None:
            if experience < 3:
                selected_percentile = "25th"
            elif experience <= 5:
                selected_percentile = "50th"
            else:
                selected_percentile = "75th"
        else:
            selected_percentile = "50th"  # Default to median

        selected_wage = wages.get(selected_percentile)

        # Build updated wage data
        updated_wage_data = {
            "soc_code": soc_code,
            "soc_title": soc_title,
            "location": location,  # Include location in response
            "wage_10th": wages.get("10th"),
            "wage_25th": wages.get("25th"),
            "wage_50th": wages.get("50th"),
            "wage_75th": wages.get("75th"),
            "wage_90th": wages.get("90th"),
            "selected_wage": selected_wage,
            "percentile": selected_percentile
        }

        # Update position in MongoDB
        position.update({
            "soc_code": soc_code,
            "soc_title": soc_title,
            "location": location,  # Save the location used for wage lookup
            "wage_10th": wages.get("10th"),
            "wage_25th": wages.get("25th"),
            "wage_50th": wages.get("50th"),
            "wage_75th": wages.get("75th"),
            "wage_90th": wages.get("90th"),
            "percentile": selected_percentile
        })

        # Update the positions array
        positions[position_index] = position
        spreadsheet_data["positions"] = positions

        # Save to MongoDB
        updated_proposal = crud.update_proposal(
            proposal_id,
            str(current_user["_id"]),
            {"spreadsheet_data": spreadsheet_data}
        )

        if not updated_proposal:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update proposal"
            )

        return {
            "status": "success",
            "wage_data": updated_wage_data
        }

    except HTTPException:
        raise

    except Exception as e:
        print(f"❌ Wage refresh failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refresh wage data: {str(e)}"
        )
