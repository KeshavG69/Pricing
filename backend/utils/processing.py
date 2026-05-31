"""
Background processing functions for proposal and GSA contract documents.
Moved here from routers so Celery workers can import them without the routers module.
"""

import logging
import random
import shutil
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from bson import ObjectId

from client.gsa_parser import parse_gsa_contract
from client.gsa_pinecone import get_gsa_pinecone_client
from client.intelligent_parser import parse_document_intelligent
from client.stripe_client import ChargeType, get_stripe_service
from utils.billing_crud import get_billing_crud
from utils.company_repository import get_company_repository_crud
from utils.pipeline import process_dataframe_with_agents
from utils.proposals import get_proposal_crud

logger = logging.getLogger(__name__)


# ============================================================================
# HELPER
# ============================================================================

def convert_intelligent_output_to_dataframe(intelligent_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert intelligent parser output to the same format as jd_parser output.

    Returns:
        Dict with keys: df, travel, odcs, extensions
    """
    metadata = intelligent_result.get("metadata", {})
    positions = intelligent_result.get("positions", [])
    travel = intelligent_result.get("travel", [])
    odcs = intelligent_result.get("odcs", [])
    extensions = intelligent_result.get("extensions", [])

    total_years = metadata.get("total_years") or 5
    months_per_year_dict = {str(year): 12 for year in range(1, total_years + 1)}
    for ext in extensions:
        ext_year = ext.get("year")
        ext_months = ext.get("duration_months", 6)
        if ext_year:
            months_per_year_dict[str(ext_year)] = ext_months

    rows = []
    for pos in positions:
        rows.append({
            "labor_category": pos.get("labor_category", ""),
            "description": pos.get("description", ""),
            "experience": pos.get("experience"),
            "location": pos.get("location"),
            "location_type": pos.get("location_type", "On-Site"),
            "is_key_position": pos.get("is_key_position", False),
            "is_surge": pos.get("is_surge", False),
            "hours_per_year": pos.get("hours_per_year", {}),
            "ot_hours_per_year": pos.get("ot_hours_per_year", None),
            "base_years": metadata.get("base_years") or 1,
            "option_years": metadata.get("option_years") or 4,
            "total_years": metadata.get("total_years") or 5,
            "project_name": metadata.get("project_name"),
            "standard_fte_hours": metadata.get("standard_fte_hours", 1920),
            "months_per_year": months_per_year_dict if months_per_year_dict else None,
        })

    df = pd.DataFrame(rows)

    travel_list = [{"description": t.get("description", ""), "amount_per_year": t.get("amount_per_year", {})} for t in travel]
    odc_list = [{"category": o.get("category", ""), "description": o.get("description", ""), "amount_per_year": o.get("amount_per_year", {})} for o in odcs]
    extension_list = [{"year": e.get("year"), "label": e.get("label", ""), "duration_months": e.get("duration_months", 6), "description": e.get("description", "")} for e in extensions]

    return {"df": df, "travel": travel_list, "odcs": odc_list, "extensions": extension_list}


# ============================================================================
# PROPOSAL PROCESSING
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
    preserved_subcontractors: List[Dict] = None,
):
    """
    Process uploaded proposal documents: parse, fetch wages, save to MongoDB.

    For re-ingestion, preserved_* parameters restore the previous workspace state.
    """
    from routers.pricing import split_multi_year_position, split_position_by_hours

    crud = get_proposal_crud()

    if wage_source is None:
        wage_source = {"type": "bls"}

    try:
        # Load organization settings
        default_escalation_rate = 0.03
        default_rates = {
            "fringe": 0.247,
            "oh_onsite": 0.0711,
            "oh_offsite": 0.0711,
            "ga": 0.2243,
            "fee": 0.07,
            "smh": 0.065,
            "sub_fee": 0.0,
            "ga_passthrough": 0.025,
            "ot_multiplier": 1.5,
            "surge_multiplier": 1.15,
        }
        org = None
        org_crud = None

        if organization_id:
            from utils.organizations import get_organization_crud
            org_crud = get_organization_crud()
            org = org_crud.get_by_id(ObjectId(organization_id))
            if org and "settings" in org:
                org_settings = org.get("settings", {})
                default_escalation_rate = org_settings.get("default_escalation_rate", 0.03)
                if "default_rates" in org_settings:
                    default_rates = org_settings.get("default_rates")

        crud.update_proposal(
            proposal_id,
            user_id,
            {"status": "processing", "progress": 0, "message": "Parsing documents..."},
        )

        # Step 1: Parse uploaded files one at a time. LiteParse is a blocking
        # CLI call; for the few seconds each parse takes we just let the
        # event loop block. (Celery worker isn't running anything else
        # waiting on this loop, so it's fine.) A single bad file is logged
        # and skipped with empty content; the rest still go through.
        from client.unstructured_client import get_unstructured_client
        _uc = get_unstructured_client()
        parsed_files: List[Dict[str, Any]] = []  # [{filename, text, pages}]
        try:
            for fp, fn in zip(file_paths, file_names):
                try:
                    full = _uc.parse_full(fp)
                    parsed_files.append({
                        "filename": fn,
                        "text": full.get("text") or "",
                        "pages": full.get("pages") or [],
                    })
                except Exception as e:
                    logger.warning(f"[parse] failed for {fn}: {e}")
                    parsed_files.append({
                        "filename": fn,
                        "text": "",
                        "pages": [],
                    })
        finally:
            _uc.cleanup()

        # Concatenate texts for the LLM with explicit file delimiters so it
        # can reason across documents (typical govcon shape: RFP says "see
        # attachment for JDs," and the JD has the actual labor categories).
        non_empty = [pf for pf in parsed_files if pf["text"]]
        if len(non_empty) == 0:
            crud.update_proposal(
                proposal_id,
                user_id,
                {"status": "error", "progress": 0, "message": "Could not extract text from any uploaded file."},
            )
            return
        elif len(non_empty) == 1:
            combined_text = non_empty[0]["text"]
            source_label = non_empty[0]["filename"]
        else:
            combined_text = "\n\n".join(
                f"=== DOCUMENT {i}: {pf['filename']} ===\n\n{pf['text']}"
                for i, pf in enumerate(non_empty, start=1)
            )
            source_label = " + ".join(pf["filename"] for pf in non_empty)

        intelligent_result = await parse_document_intelligent(
            combined_text,
            proposal_id=proposal_id,
            source_label=source_label,
        )
        parse_result = convert_intelligent_output_to_dataframe(intelligent_result)
        df = parse_result["df"]
        extracted_travel = parse_result.get("travel", [])
        extracted_odcs = parse_result.get("odcs", [])
        extracted_extensions = parse_result.get("extensions", [])
        extracted_surge = intelligent_result.get("surge", None)

        if len(df) == 0:
            metadata_notes = intelligent_result.get("metadata", {}).get("notes", "")
            error_message = "Could not extract or generate staffing positions from this document. "
            if "GENERATED" in metadata_notes:
                error_message += "The AI attempted to create a staffing plan but was unable to generate reasonable estimates. "
            else:
                error_message += "This document may not contain labor staffing information. "
            error_message += "Please ensure the document describes labor positions, roles, or staffing requirements."
            crud.update_proposal(proposal_id, user_id, {"status": "error", "progress": 0, "message": error_message})
            return

        crud.update_proposal(
            proposal_id,
            user_id,
            {"progress": 30, "message": f"Found {len(df)} positions, {len(extracted_travel)} Travel items, {len(extracted_odcs)} ODCs. Fetching wage data..."},
        )

        # Fetch org rates for GSA/BLS comparison
        organization_rates = None
        if wage_source.get("type") == "gsa":
            try:
                from utils.organizations import get_organization_crud
                org_crud = get_organization_crud()
                org = org_crud.get_by_id(ObjectId(organization_id))
                if org and org.get("settings"):
                    dr = org["settings"].get("default_rates", {})
                    organization_rates = {
                        "fringe": dr.get("fringe", 0.247),
                        "oh_onsite": dr.get("oh_onsite", dr.get("oh", 0.0711)),
                        "oh_offsite": dr.get("oh_offsite", dr.get("oh", 0.0711)),
                        "ga": dr.get("ga", 0.2243),
                        "fee": dr.get("fee", 0.07),
                    }
                    logger.info(f"Using org rates for BLS comparison: {organization_rates}")
            except Exception as e:
                logger.warning(f"Failed to fetch org rates for BLS comparison: {e}")

        # Step 2: Fetch wages via agents. Emit a phase event so the user's
        # live feed shows a row for this step — otherwise the UI goes silent
        # for the 10–60s this takes.
        from utils.event_stream import get_event_stream
        event_stream = get_event_stream()
        wage_source_label = "GSA" if wage_source.get("type") == "gsa" else "BLS"
        try:
            event_stream.publish(
                proposal_id,
                "phase.started",
                {
                    "key": "wages",
                    "title": f"Matching {wage_source_label} wage data for {len(df)} positions",
                },
            )
        except Exception as e:
            logger.warning(f"publish phase.started(wages) failed: {e}")

        final_df = await process_dataframe_with_agents(
            df,
            max_workers=10,
            wage_source=wage_source,
            organization_id=organization_id,
            organization_rates=organization_rates,
        )

        try:
            event_stream.publish(
                proposal_id,
                "phase.completed",
                {
                    "key": "wages",
                    "title": f"Matched {wage_source_label} wage data for {len(df)} positions",
                },
            )
        except Exception as e:
            logger.warning(f"publish phase.completed(wages) failed: {e}")

        crud.update_proposal(proposal_id, user_id, {"progress": 80, "message": "Finalizing results..."})

        # Step 3: Clean data
        final_df = final_df.replace([np.inf, -np.inf], None)
        final_df = final_df.where(final_df.notna(), None)
        final_df = final_df.rename(columns={
            "BLS Code": "soc_code",
            "BLS Labour Category Mapping": "soc_title",
            "BLS Occupation Description": "bls_occupation_description",
        })

        def clean_value(val):
            if isinstance(val, float) and (np.isnan(val) or np.isinf(val)):
                return None
            return val

        cleaned_jobs = [{k: clean_value(v) for k, v in job.items()} for job in final_df.to_dict("records")]

        # FTE splitting
        fte_threshold = 1920
        months_per_year_dict = None
        if cleaned_jobs:
            first_threshold = cleaned_jobs[0].get("standard_fte_hours")
            if first_threshold and 1500 <= first_threshold <= 2500:
                fte_threshold = int(first_threshold)
            months_per_year_dict = cleaned_jobs[0].get("months_per_year")

        final_split_jobs = []
        for job in cleaned_jobs:
            if "hours_per_year" in job and job["hours_per_year"]:
                final_split_jobs.extend(split_multi_year_position(job, max_hours=fte_threshold, months_per_year=months_per_year_dict))
            elif "hours" in job and job["hours"] and job["hours"] > fte_threshold:
                final_split_jobs.extend(split_position_by_hours(job, max_hours=fte_threshold))
            else:
                final_split_jobs.append(job)
        cleaned_jobs = final_split_jobs

        # Guard: ensure wage lookup actually produced usable data.
        # Both BLS and GSA pipelines set selected_wage; None means the agent
        # returned no data or errored for that row. If the failure rate is
        # high, the proposal is unusable — don't charge and don't mark completed.
        total_positions = len(cleaned_jobs)
        failed_positions = sum(1 for job in cleaned_jobs if not job.get("selected_wage"))
        if total_positions > 0 and failed_positions / total_positions > 0.5:
            logger.error(
                f"Wage lookup failed for {failed_positions}/{total_positions} positions "
                f"(>50%). Marking proposal {proposal_id} as error, skipping billing."
            )
            crud.update_proposal(
                proposal_id,
                user_id,
                {
                    "status": "error",
                    "progress": 0,
                    "billing_status": "unpaid",
                    "message": (
                        f"Wage lookup failed for {failed_positions} of {total_positions} positions. "
                        "Please retry the upload, or contact support if this persists."
                    ),
                },
            )
            return

        # Extract contract metadata
        base_years = cleaned_jobs[0].get("base_years") if cleaned_jobs else None
        option_years = cleaned_jobs[0].get("option_years") if cleaned_jobs else None
        total_years = cleaned_jobs[0].get("total_years") if cleaned_jobs else None
        total_years = total_years or 5
        base_years = base_years or 1
        option_years = option_years or (total_years - base_years)

        escalation_rates = {f"{y}_to_{y + 1}": default_escalation_rate for y in range(1, total_years)}

        # Billing
        billing_status = "unpaid"
        billing_message = None
        should_trigger_advanced = False

        try:
            stripe_service = get_stripe_service()
            billing_crud = get_billing_crud()

            if not billing_crud.is_proposal_charged(proposal_id, "basic"):
                proposal_doc = crud.get_by_id(ObjectId(proposal_id))
                proposal_name = proposal_doc.get("name", "Untitled") if proposal_doc else "Untitled"
                first_free_proposal_id = org.get("first_free_proposal_id") if org else None

                if first_free_proposal_id is None:
                    billing_crud.create_billing_record(
                        organization_id=str(org["_id"]),
                        proposal_id=proposal_id,
                        charge_type="basic",
                        amount_cents=0,
                        description=f"PriceIQ Basic (Free First Proposal): {proposal_name[:50]}",
                        triggered_by_user_id=user_id,
                        status="succeeded",
                    )
                    if org_crud:
                        org_crud.collection.update_one(
                            {"_id": org["_id"]},
                            {"$set": {"first_free_proposal_id": ObjectId(proposal_id), "updated_at": datetime.utcnow()}},
                        )
                    billing_status = "paid"
                    should_trigger_advanced = True

                elif stripe_service.is_configured and org and org.get("stripe_customer_id") and org.get("default_payment_method_id"):
                    amount_cents = stripe_service.get_price(ChargeType.BASIC)
                    billing_id = billing_crud.create_billing_record(
                        organization_id=str(org["_id"]),
                        proposal_id=proposal_id,
                        charge_type="basic",
                        amount_cents=amount_cents,
                        description=f"PriceIQ Basic: {proposal_name[:50]}",
                        triggered_by_user_id=user_id,
                        status="pending",
                    )
                    result = stripe_service.charge_for_proposal(
                        customer_id=org["stripe_customer_id"],
                        payment_method_id=org["default_payment_method_id"],
                        charge_type=ChargeType.BASIC,
                        proposal_id=proposal_id,
                        proposal_name=proposal_name,
                        organization_id=str(org["_id"]),
                    )
                    if result["success"]:
                        billing_status = "paid"
                        billing_crud.collection.update_one(
                            {"_id": ObjectId(billing_id)},
                            {"$set": {"stripe_payment_intent_id": result["payment_intent_id"], "status": "succeeded", "updated_at": datetime.utcnow()}},
                        )
                    else:
                        billing_status = "failed"
                        billing_message = result.get("error", "Payment failed")
                        billing_crud.collection.update_one(
                            {"_id": ObjectId(billing_id)},
                            {"$set": {"status": "failed", "error_message": billing_message, "updated_at": datetime.utcnow()}},
                        )
                else:
                    billing_status = "unpaid"
                    billing_message = "Payment method required"
            else:
                billing_status = "paid"
        except Exception as billing_error:
            traceback.print_exc()
            billing_message = f"Billing error: {str(billing_error)}"

        final_advanced_mode = preserved_advanced_mode if preserved_advanced_mode is not None else should_trigger_advanced
        final_subcontractor_configured = preserved_subcontractor_configured if preserved_subcontractor_configured is not None else False
        final_subcontractors = preserved_subcontractors if preserved_subcontractors is not None else []

        if preserved_advanced_mode is not None:
            logger.info(f"[RE-INGEST] Restoring state: advanced_mode={final_advanced_mode}, subcontractors={len(final_subcontractors)}")

        # Generate unique position IDs
        timestamp = int(time.time() * 1000)
        for i, job in enumerate(cleaned_jobs):
            if not job.get("id"):
                job["id"] = f"pos_{i}_{timestamp}_{random.randint(1000, 9999)}"

        # ─── Step N: Index source documents for chat retrieval ────────────
        # One file at a time, sequential chunk+embed+upsert per file. Each
        # file emits a phase.started/phase.completed pair keyed on its
        # document_id so the live feed renders one row per file (running →
        # done). A per-file failure flips `indexed=False`, marks the phase
        # done with a "Skipped" title, and continues — the proposal still
        # completes for pricing.
        try:
            from utils.document_indexer import index_document_pages
            from utils.event_stream import get_event_stream
            event_stream = get_event_stream()

            existing_proposal = crud.get_proposal(proposal_id, user_id)
            existing_docs = (existing_proposal or {}).get("documents") or []
            pages_by_filename = {pf["filename"]: pf["pages"] for pf in parsed_files}

            indexed_docs = []
            for i, doc in enumerate(existing_docs):
                doc_id = doc.get("document_id")
                filename = doc.get("filename") or f"document_{i}"

                if not doc_id:
                    # Pre-document_id row — can't safely target deletes
                    # later without a stable id; leave its state alone.
                    indexed_docs.append({
                        **doc,
                        "indexed": doc.get("indexed", False),
                        "chunks_indexed": doc.get("chunks_indexed", 0),
                    })
                    continue

                pages = pages_by_filename.get(filename) or []
                if not pages:
                    # Surface the skip in the feed so the user sees WHY this
                    # file isn't searchable in chat (parse failure earlier,
                    # empty doc, etc.). Single completed event — no started
                    # since we didn't actually do work.
                    try:
                        event_stream.publish(
                            proposal_id,
                            "phase.completed",
                            {
                                "key": f"indexing:{doc_id}",
                                "title": f"Skipped {filename} (no content extracted)",
                            },
                        )
                    except Exception:
                        pass
                    indexed_docs.append({**doc, "indexed": False, "chunks_indexed": 0})
                    continue

                phase_key = f"indexing:{doc_id}"
                try:
                    event_stream.publish(
                        proposal_id,
                        "phase.started",
                        {
                            "key": phase_key,
                            "title": f"Indexing {filename} for chat",
                        },
                    )
                except Exception:
                    pass

                try:
                    n = index_document_pages(
                        organization_id=organization_id or "",
                        proposal_id=proposal_id,
                        document_id=doc_id,
                        filename=filename,
                        pages=pages,
                    )
                except Exception as e:
                    logger.warning(f"[doc-index] {filename} failed: {e}")
                    n = 0
                indexed_docs.append({**doc, "indexed": n > 0, "chunks_indexed": n})

                try:
                    event_stream.publish(
                        proposal_id,
                        "phase.completed",
                        {
                            "key": phase_key,
                            "title": (
                                f"Indexed {filename} ({n:,} chunks)"
                                if n > 0
                                else f"Skipped {filename} (indexing failed)"
                            ),
                        },
                    )
                except Exception:
                    pass

            crud.update_proposal(proposal_id, user_id, {"documents": indexed_docs})
        except Exception as _idx_err:
            logger.warning(f"[doc-index] indexing failed (proposal will still complete): {_idx_err}")

        update_data = {
            "status": "completed",
            "business_status": "active",
            "progress": 100,
            "message": billing_message or "Processing complete",
            "billing_status": billing_status,
            # NAICS / agency / contracting_office come from the intelligent parser's
            # metadata block. We persist them at top level on the proposal (matching
            # the pattern of solicitation_number / prime_contractor_name) so the PTW
            # endpoint can read them directly without unpacking metadata. Null when
            # the parser couldn't find them — the user can fill them in via the UI.
            "naics_code": (intelligent_result.get("metadata") or {}).get("naics_code"),
            "agency": (intelligent_result.get("metadata") or {}).get("agency"),
            "contracting_office": (intelligent_result.get("metadata") or {}).get("contracting_office"),
            "scope_keywords": (intelligent_result.get("metadata") or {}).get("scope_keywords") or [],
            "metadata": {
                "total_jobs": len(cleaned_jobs),
                "base_years": base_years,
                "option_years": option_years,
                "total_years": total_years,
                "fte_hours_threshold": fte_threshold,
            },
            "spreadsheet_data": {
                "positions": cleaned_jobs,
                "travel": extracted_travel,
                "odcs": extracted_odcs,
                "extensions": extracted_extensions,
                "surge": extracted_surge,
                "rates": default_rates,
                "escalation_rates": escalation_rates,
                "advanced_mode": final_advanced_mode,
                "subcontractor_configured": final_subcontractor_configured,
                "subcontractors": final_subcontractors,
            },
        }
        crud.update_proposal(proposal_id, user_id, update_data)

        # Remove legacy jobs[] field — all position data lives in spreadsheet_data.positions
        from auth.database import get_mongodb_client
        mongodb = get_mongodb_client()
        db = mongodb.get_database()
        db["proposals"].update_one(
            {"_id": ObjectId(proposal_id)},
            {"$unset": {"jobs": ""}}
        )

    except Exception as e:
        crud.update_proposal(proposal_id, user_id, {"status": "error", "progress": 0, "message": f"Error: {str(e)}"})
        traceback.print_exc()

    finally:
        # Drop the live event feed on terminal state. Safe to call even on
        # the early-return paths (empty df / failed wage lookup) — those set
        # status=error before returning and fall through to this block.
        # Keyed by proposal_id, so never touches another concurrent proposal.
        try:
            from utils.event_stream import get_event_stream
            get_event_stream().cleanup(proposal_id)
        except Exception as cleanup_err:
            logger.warning(f"Event cleanup failed for {proposal_id}: {cleanup_err}")

        if temp_dir and Path(temp_dir).exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


# ============================================================================
# GSA CONTRACT PROCESSING
# ============================================================================

async def process_gsa_contract(file_id: str, organization_id: str, file_path: str, temp_dir: Path):
    """
    Parse GSA contract and store labor categories to MongoDB + Pinecone in parallel.
    """
    import asyncio

    crud = get_company_repository_crud()

    try:
        result = await asyncio.to_thread(parse_gsa_contract, file_path)
        status = "needs_date" if result["needs_date"] else "active"

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
                    "updated_at": datetime.utcnow(),
                }},
            )
            logger.info(f"MongoDB: stored {len(result['labor_categories'])} labor categories for {file_id}")

        def store_pinecone():
            if result["labor_categories"]:
                pinecone_client = get_gsa_pinecone_client()
                count = pinecone_client.store_labor_categories(
                    organization_id=organization_id,
                    file_id=file_id,
                    labor_categories=result["labor_categories"],
                )
                logger.info(f"Pinecone: stored {count} vectors for {file_id}")

        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=2) as executor:
            await asyncio.gather(
                loop.run_in_executor(executor, update_mongodb),
                loop.run_in_executor(executor, store_pinecone),
            )

        logger.info(f"GSA contract processed: {file_id}, {len(result['labor_categories'])} labor categories")

    except Exception as e:
        logger.error(f"Error processing GSA contract {file_id}: {e}")
        crud.update_status(file_id, "error", str(e))
        traceback.print_exc()

    finally:
        if temp_dir and Path(temp_dir).exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


