"""
RFP Radar — daily match document.

Each day, the Celery scanner produces up to 10 top-scored opportunities per
organization. Each one is a document in the `rfp_radar_matches` collection.

The dashboard reads by (organization_id, scan_date) for the calendar view;
piece 6 (the handoff to PriceIQ) reads by (organization_id, notice_id) to look
up the saved PWS attachment when a user clicks "Price this RFP".

Storage is partitioned by `scan_date` so re-runs of the same day are safe to
replace atomically without disturbing prior days.
"""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Embedded sub-documents
# ---------------------------------------------------------------------------


class MatchSignalBreakdown(BaseModel):
    """
    How each signal in the scoring rubric contributed. Sums to match_score.
    Missing fields default to 0 so old documents stay readable if we add
    more signals later.
    """

    naics_match: int = 0
    sub_agency_match: int = 0
    top_customer: int = 0
    set_aside_match: int = 0
    keyword_match: int = 0
    excluded_keyword: int = 0


class PWSAttachment(BaseModel):
    """
    The auto-picked PWS/SOW document for this opportunity. Captured at scan
    time so piece 6's "Price this RFP" handoff knows exactly which file to
    extract from the bulk ZIP — no re-scoring at click time.
    """

    attachment_id: str
    resource_id: str
    filename: str
    size_bytes: int
    mime_type: str
    confidence: str          # "high" | "medium" | "low" — should always be "high"
    score: int               # raw filename-heuristic score


# ---------------------------------------------------------------------------
# Main document
# ---------------------------------------------------------------------------


class RFPRadarMatch(BaseModel):
    """
    One of the day's top-N matches for an organization.

    Mirrors the MongoDB document shape 1:1, except _id is exposed as `id`
    (str) for JSON serialization.
    """

    id: Optional[str] = Field(default=None, alias="_id")
    organization_id: str

    # Calendar partition
    scan_date: date                          # the date this scan ran (YYYY-MM-DD)
    rank: int                                # 1..N within scan_date

    # Match scoring
    match_score: int                         # 0-100
    match_reasons: List[str] = Field(default_factory=list)
    signal_breakdown: MatchSignalBreakdown = Field(default_factory=MatchSignalBreakdown)

    # Opportunity snapshot — so the dashboard renders without re-fetching
    # from SAM.gov, and so a record of the opp survives even if it's pulled
    # off SAM.gov later.
    notice_id: str
    title: str
    awarding_top_agency: Optional[str] = None
    awarding_sub_agency: Optional[str] = None
    notice_type_code: Optional[str] = None
    notice_type_label: Optional[str] = None
    posted_date: Optional[str] = None
    response_deadline: Optional[str] = None
    solicitation_number: Optional[str] = None
    naics_codes: List[str] = Field(default_factory=list)
    set_aside_code: Optional[str] = None
    set_aside_description: Optional[str] = None
    pop_state: Optional[str] = None
    pop_city: Optional[str] = None
    ui_link: Optional[str] = None

    # PWS picker result — piece 6 uses this to extract the right file from
    # SAM.gov's ZIP download
    pws: PWSAttachment

    # Audit
    scanned_at: datetime
