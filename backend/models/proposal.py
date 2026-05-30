"""Pydantic models for proposal management."""

from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime


class DocumentInfo(BaseModel):
    """Information about an uploaded document."""

    filename: str = Field(description="Original filename")
    file_size: int = Field(description="File size in bytes")
    upload_date: datetime = Field(description="When the document was uploaded")
    idrive_url: str = Field(description="Public URL to access document on iDrive e2")
    idrive_key: str = Field(description="S3 object key for deletion (user_id/proposal_id/filename)")
    extracted_content: Optional[str] = Field(
        None,
        description="Raw text extracted from document by Unstructured"
    )


class ProposalMetadata(BaseModel):
    """Metadata extracted from proposal documents."""

    base_years: Optional[int] = Field(None, description="Number of base years in contract")
    option_years: Optional[int] = Field(None, description="Number of option years in contract")
    total_years: Optional[int] = Field(None, description="Total years (base + option)")
    total_jobs: Optional[int] = Field(None, description="Total number of job positions")
    months_per_year: Optional[Dict[str, int]] = Field(
        None,
        description="Month duration per year (1-12). Key is year number as string. Defaults to 12 if not specified."
    )


class ProposalCreate(BaseModel):
    """Schema for creating a new proposal."""

    name: str = Field(description="Proposal name/title")
    solicitation_number: Optional[str] = Field(
        None,
        description="Government solicitation number (e.g., N0000000R0000)"
    )


class ProposalUpdate(BaseModel):
    """Schema for updating an existing proposal."""

    name: Optional[str] = Field(None, description="Updated proposal name")
    solicitation_number: Optional[str] = Field(None, description="Updated solicitation number")
    prime_contractor_name: Optional[str] = Field(None, description="Updated prime contractor name")
    naics_code: Optional[str] = Field(
        None,
        description="6-digit NAICS industry classification code (e.g. '541330'). Used to look up comparable past awards for PTW suggestions."
    )
    agency: Optional[str] = Field(
        None,
        description="Awarding agency name (e.g. 'Department of the Navy'). Used together with NAICS for PTW comparable-award lookup."
    )
    contracting_office: Optional[str] = Field(
        None,
        description="Contracting sub-office (e.g. 'NAVSUP FLC Norfolk'). Used to further narrow PTW comparables when available."
    )
    scope_keywords: Optional[List[str]] = Field(
        None,
        description="Distinctive scope terms extracted by the parser (e.g. ['SATCOM', 'C5I']). The PTW endpoint uses these as USASpending search keywords by default."
    )
    status: Optional[str] = Field(
        None,
        description="Proposal status (draft, processing, completed, error)"
    )
    business_status: Optional[str] = Field(
        None,
        description="Business workflow status (active, no-bid, submitted)"
    )
    total_cost: Optional[float] = Field(
        None,
        description="Total cost calculated from all positions"
    )
    price_to_win: Optional[float] = Field(
        None,
        description="Optional Price-to-Win target ($) — used for competitive gap analysis."
    )
    rates: Optional[Dict[str, float]] = Field(
        None,
        description="Indirect rates (fringe, oh_onsite, oh_offsite, ga, fee, smh, sub_fee, ga_passthrough)"
    )
    escalation_rates: Optional[Dict[str, float]] = Field(
        None,
        description="Year-over-year escalation rates (1_to_2, 2_to_3, etc.)"
    )
    spreadsheet_data: Optional[Dict[str, Any]] = Field(
        None,
        description="Advanced spreadsheet data (positions, subcontractors, ODCs)"
    )
