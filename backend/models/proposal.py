"""Pydantic models for proposal management."""

from pydantic import BaseModel, Field
from typing import Dict, Optional, Any
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
    status: Optional[str] = Field(
        None,
        description="Proposal status (draft, processing, completed, error)"
    )
    rates: Optional[Dict[str, float]] = Field(
        None,
        description="Indirect rates (fringe, oh, ga, fee, smh, sub_fee, ga_passthrough, ga_adder)"
    )
    escalation_rates: Optional[Dict[str, float]] = Field(
        None,
        description="Year-over-year escalation rates (1_to_2, 2_to_3, etc.)"
    )
    spreadsheet_data: Optional[Dict[str, Any]] = Field(
        None,
        description="Advanced spreadsheet data (positions, subcontractors, ODCs)"
    )
