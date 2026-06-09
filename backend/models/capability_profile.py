"""
Capability profile — Pydantic models.

Schemas for the `capability_profiles` MongoDB collection. The profile is what
the daily SAM.gov scanner matches against, so its shape directly drives
recommendation quality.

User edits land on the main fields directly — no overrides layer. A profile
rebuild from USASpending overwrites user edits with fresh auto-built values,
so the UI should warn before triggering a rebuild.

The underlying CapabilityProfile dataclass (in client/capability_profile_builder.py)
is the auto-built source of truth; these Pydantic models describe how it gets
persisted and exposed via the API.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Nested building blocks
# ---------------------------------------------------------------------------


class NAICSContributionDoc(BaseModel):
    """A NAICS code with weight context (wins + dollars) from past awards."""

    code: str = Field(description="6-digit NAICS code, e.g. '541512'.")
    description: str = Field(default="", description="Plain-English NAICS description.")
    wins: int = Field(description="Number of awards under this NAICS in the analysis window.")
    total_amount: float = Field(description="Total dollar value awarded under this NAICS.")


class SubAgencyContributionDoc(BaseModel):
    """A sub-agency (e.g. 'Department of the Navy') the contractor has worked with."""

    name: str = Field(description="Sub-agency name as it appears on USASpending.")
    wins: int = Field(description="Number of awards from this sub-agency.")
    total_amount: float = Field(description="Total dollar value from this sub-agency.")


# ---------------------------------------------------------------------------
# Lifecycle request bodies
# ---------------------------------------------------------------------------


class CapabilityProfileBuildRequest(BaseModel):
    """Request body for POST /api/rfp-radar/profile/build."""

    company_search: str = Field(
        min_length=2,
        description=(
            "Company name (or partial) to find on USASpending. Used as the "
            "free-text recipient_search_text in the awards search."
        ),
    )
    uei_filter: Optional[str] = Field(
        None,
        description=(
            "12-character UEI to restrict the search to one exact entity. "
            "Recommended when the company name is ambiguous."
        ),
    )


class CapabilityProfileUpdate(BaseModel):
    """
    Request body for PATCH /api/rfp-radar/profile.

    All fields optional — only the keys present in the payload get updated.
    Edits replace the field outright (no merge): if the user PATCHes
    scope_keywords with ["A", "B"], that becomes the new list.
    """

    naics_codes: Optional[List[NAICSContributionDoc]] = None
    sub_agencies_of_interest: Optional[List[SubAgencyContributionDoc]] = None
    set_asides_qualified: Optional[List[str]] = None
    scope_keywords: Optional[List[str]] = None
    pop_states_primary: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Response shape (also the storage shape, modulo ObjectId serialization)
# ---------------------------------------------------------------------------


class CapabilityProfileResponse(BaseModel):
    """Full capability profile as returned by the API."""

    id: str = Field(description="MongoDB ObjectId, serialized as a hex string.")
    organization_id: str

    # Identity (auto-built)
    uei: str
    company_name: str
    hq_location: Optional[str] = None

    # Matching signals — auto-built initially, user-editable in place
    naics_codes: List[NAICSContributionDoc] = Field(default_factory=list)
    sub_agencies_of_interest: List[SubAgencyContributionDoc] = Field(default_factory=list)
    set_asides_qualified: List[str] = Field(default_factory=list)
    scope_keywords: List[str] = Field(default_factory=list)
    pop_states_primary: List[str] = Field(default_factory=list)

    # Audit / context
    past_awards_count: int = 0
    past_awards_total: float = 0.0
    most_recent_award_date: Optional[str] = None

    # Lifecycle
    built_at: datetime
    rebuilt_count: int = 0
    last_edited_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
