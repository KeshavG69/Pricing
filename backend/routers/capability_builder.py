"""
Capability builder — API endpoints.

Multi-tenant: every endpoint is scoped to the authenticated user's
organization. v1 enforces one capability profile per organization.

Endpoints
---------
    POST   /api/capability-builder/profile/build   — auto-build + save (or rebuild)
    GET    /api/capability-builder/profile         — load this org's profile
    PATCH  /api/capability-builder/profile         — partial user edits
    DELETE /api/capability-builder/profile         — wipe it
    GET    /api/capability-builder/matches         — today's RFP Radar matches
    GET    /api/capability-builder/matches/dates   — calendar nav (dates with matches)
    GET    /api/capability-builder/matches/{notice_id}/pws-file
                                                   — proxy-download the saved PWS
"""

import logging
import re
import unicodedata
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response

from auth.dependencies import get_current_user
from client.capability_profile_builder import build_profile
from client.usaspending_client import USASpendingError
from models.capability_profile import (
    CapabilityProfileBuildRequest,
    CapabilityProfileUpdate,
)
from utils.capability_profile_crud import get_capability_profile_crud
from utils.helpers import serialize_doc, serialize_docs
from utils.rfp_radar_match_crud import get_rfp_radar_match_crud

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_org(current_user: dict) -> str:
    """Pull organization_id off the auth context, or 403."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "RFP Radar requires an organization. Join or create an "
                "organization before building a capability profile."
            ),
        )
    return str(org_id)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/profile/build")
async def build_capability_profile(
    body: CapabilityProfileBuildRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Auto-build the capability profile from USASpending past wins, then save
    (or overwrite if one already exists) for this organization.

    Inputs:
        company_search: company name to find on USASpending
        uei_filter:     optional exact UEI to disambiguate

    Notes:
        - This is the "magic moment" — takes ~3-5 seconds (USASpending +
          one LLM call for scope keywords).
        - Rebuilding overwrites prior user edits to the matching fields.
          The frontend should confirm before triggering a rebuild.
    """
    org_id = _require_org(current_user)

    try:
        profile = await build_profile(
            company_search=body.company_search,
            uei_filter=body.uei_filter,
        )
    except USASpendingError as e:
        logger.warning(
            f"Profile build failed for org={org_id} "
            f"search={body.company_search!r}: {e.message}"
        )
        if e.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"No federal awards found for '{body.company_search}'. "
                    "Check the company spelling, or pass the company's UEI "
                    "directly via uei_filter."
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"USASpending lookup failed: {e.message}",
        )
    except Exception as e:
        logger.exception(f"Unexpected profile build error for org={org_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Profile build failed: {e}",
        )

    crud = get_capability_profile_crud()
    doc = crud.save_from_builder(org_id, profile)
    return serialize_doc(doc)


@router.get("/profile")
async def get_capability_profile(
    current_user: dict = Depends(get_current_user),
):
    """Return this organization's saved capability profile."""
    org_id = _require_org(current_user)
    crud = get_capability_profile_crud()
    doc = crud.get_by_org(org_id)
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No capability profile yet. Build one with "
                "POST /api/rfp-radar/profile/build."
            ),
        )
    return serialize_doc(doc)


@router.patch("/profile")
async def update_capability_profile(
    body: CapabilityProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    Apply partial user edits to the saved profile.

    Only the keys present in the payload get updated. Edits replace the field
    outright (no deep merge): if the user PATCHes scope_keywords with
    ["A", "B"], that becomes the new list.

    Stamps `last_edited_at`. Does NOT bump `rebuilt_count` (only auto-build
    rebuilds do).
    """
    org_id = _require_org(current_user)
    # exclude_none keeps the PATCH truly partial — fields not sent stay put
    updates = body.model_dump(exclude_none=True)
    if not updates:
        # No-op — fetch and return what's there
        doc = get_capability_profile_crud().get_by_org(org_id)
        if doc is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No capability profile to update.",
            )
        return serialize_doc(doc)

    crud = get_capability_profile_crud()
    doc = crud.update(org_id, updates)
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No capability profile to update. Build one with "
                "POST /api/rfp-radar/profile/build first."
            ),
        )
    return serialize_doc(doc)


@router.delete("/profile", status_code=status.HTTP_204_NO_CONTENT)
async def delete_capability_profile(
    current_user: dict = Depends(get_current_user),
):
    """Wipe this organization's profile."""
    org_id = _require_org(current_user)
    crud = get_capability_profile_crud()
    deleted = crud.delete(org_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No capability profile to delete.",
        )
    # 204 has no body
    return None


# ---------------------------------------------------------------------------
# RFP Radar — daily matches (the dashboard reads these)
# ---------------------------------------------------------------------------


def _parse_date_param(s: str, *, field_name: str) -> date:
    """Parse a YYYY-MM-DD query param, raising 400 on bad input."""
    try:
        return date.fromisoformat(s)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be in YYYY-MM-DD format (got {s!r}).",
        )


@router.get("/matches")
async def get_matches_for_date(
    date: Optional[str] = Query(
        None,
        description="ISO date YYYY-MM-DD. Defaults to today (UTC).",
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    Return this organization's saved RFP Radar matches for a given scan_date.

    Default is today (UTC). The calendar nav passes a specific date to fetch
    older scans. Sorted by rank ascending (1 = highest-scored).
    """
    org_id = _require_org(current_user)
    target_date = (
        _parse_date_param(date, field_name="date")
        if date
        else datetime.now(timezone.utc).date()
    )
    crud = get_rfp_radar_match_crud()
    matches = crud.get_by_date(org_id, target_date)
    return {
        "scan_date": target_date.isoformat(),
        "count": len(matches),
        "matches": serialize_docs(matches),
    }


@router.get("/matches/dates")
async def list_match_dates(
    start: Optional[str] = Query(
        None,
        description="ISO date YYYY-MM-DD — lower bound (inclusive). Optional.",
    ),
    end: Optional[str] = Query(
        None,
        description="ISO date YYYY-MM-DD — upper bound (inclusive). Optional.",
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    Return distinct scan_dates that have saved matches for this org.

    Used by the calendar view to render which days have a scan available.
    Sorted newest-first.
    """
    org_id = _require_org(current_user)
    start_date = _parse_date_param(start, field_name="start") if start else None
    end_date = _parse_date_param(end, field_name="end") if end else None
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start must be ≤ end",
        )
    crud = get_rfp_radar_match_crud()
    dates = crud.list_scan_dates(org_id, start_date=start_date, end_date=end_date)
    return {
        "count": len(dates),
        "dates": [d.isoformat() for d in dates],
    }


# Extension → Content-Type for the PWS proxy. SAM.gov stores mime_type as a
# bare extension (".pdf"), so we map it ourselves.
_PWS_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": (
        "application/vnd.openxmlformats-officedocument"
        ".wordprocessingml.document"
    ),
    ".xls": "application/vnd.ms-excel",
    ".xlsx": (
        "application/vnd.openxmlformats-officedocument"
        ".spreadsheetml.sheet"
    ),
    ".txt": "text/plain",
    ".rtf": "application/rtf",
}


def _ascii_filename(name: str) -> str:
    """Squash a filename to a safe ASCII Content-Disposition token."""
    normalized = unicodedata.normalize("NFKD", name)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    # Collapse runs of whitespace, strip quote/control chars
    cleaned = re.sub(r'[\\"\r\n]+', "", ascii_only)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or "pws-document"


@router.get("/matches/{notice_id}/pws-file")
async def download_match_pws_file(
    notice_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Proxy-download the pre-picked PWS attachment for one of this org's saved
    matches.

    The browser can't fetch SAM.gov attachments directly (CORS), so this
    endpoint streams the bytes through. The frontend wraps the response in a
    File and feeds it to the standard POST /proposals/upload flow — the
    "Price this RFP" handoff reuses the manual-upload pipeline end to end.
    """
    org_id = _require_org(current_user)

    match = get_rfp_radar_match_crud().get_by_notice_id(org_id, notice_id)
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No saved match for notice {notice_id} in this organization.",
        )

    pws = match.get("pws") or {}
    resource_id = pws.get("resource_id")
    if not resource_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This match has no saved PWS attachment.",
        )

    from client.samgov_client import SamGovError, get_samgov_client

    try:
        content = await get_samgov_client().download_attachment(resource_id)
    except SamGovError as e:
        logger.warning(
            f"PWS download failed org={org_id} notice={notice_id}: {e}"
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Couldn't download the PWS from SAM.gov. The file may have "
                "been removed — try View on SAM.gov to check."
            ),
        )

    filename = _ascii_filename(pws.get("filename") or "pws-document.pdf")
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    media_type = _PWS_CONTENT_TYPES.get(ext, "application/octet-stream")

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-PWS-Filename": filename,
        },
    )


@router.post("/matches/scan/run-now")
async def trigger_scan_now(current_user: dict = Depends(get_current_user)):
    """
    Trigger an RFP Radar scan for this organization right now.

    SYNCHRONOUS — downloads SAM.gov's 217 MB bulk CSV (~25s), scores all
    candidates against the org's profile, runs the PWS-confidence gate, and
    saves the top 10 high-confidence matches to today's scan_date partition.
    Total wall-clock time: 30–60 seconds.

    For production, the Celery beat schedule fires this automatically at
    10:00 UTC daily — this endpoint is for ad-hoc testing.
    """
    org_id = _require_org(current_user)

    # Lazy-import the scanner so the router stays cheap to load.
    import os
    from tasks.rfp_radar_scanner import (
        download_bulk_csv,
        parse_csv_to_naics_buckets,
        run_scan_for_org,
    )
    from utils.rfp_radar_match_crud import get_rfp_radar_match_crud

    profile_doc = get_capability_profile_crud().get_by_org(org_id)
    if profile_doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No capability profile for this organization. Build one first "
                "via POST /api/capability-builder/profile/build."
            ),
        )

    csv_path: Optional[str] = None
    try:
        csv_path = await download_bulk_csv()
        buckets = parse_csv_to_naics_buckets(csv_path)
        matches = await run_scan_for_org(profile_doc, buckets)
    except Exception as e:
        logger.exception(f"Manual scan failed for org {org_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Scan failed: {e}",
        )
    finally:
        if csv_path:
            try:
                os.unlink(csv_path)
            except OSError:
                pass

    # Use UTC date so this endpoint partitions matches identically to the
    # scheduled Celery beat scan (which also uses UTC) and to the GET /matches
    # endpoint (defaults to UTC today). Local-tz date.today() caused a
    # midnight-rollover off-by-one bug for users in the western hemisphere.
    today_utc = datetime.now(timezone.utc).date()
    inserted = get_rfp_radar_match_crud().bulk_save_for_scan(org_id, today_utc, matches)
    return {
        "scan_date": today_utc.isoformat(),
        "matches_saved": inserted,
        "note": (
            "Scan complete. Fetch with "
            "GET /api/capability-builder/matches"
        ),
    }
