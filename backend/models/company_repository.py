"""Pydantic models for Company Repository (GSA Contracts)."""

from pydantic import BaseModel, Field
from typing import Dict, Optional, List
from datetime import datetime


class LaborCategory(BaseModel):
    """Labor category with rates per year."""
    lcat_id: str
    sin: Optional[str] = None
    title: str
    description: Optional[str] = None
    education: Optional[str] = None
    experience: Optional[str] = None
    rates_by_year: Dict[str, float] = Field(default_factory=dict)


class CompanyRepositoryCreate(BaseModel):
    """Schema for creating company repository entry."""
    name: str
    contract_number: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None


class CompanyRepositoryUpdate(BaseModel):
    """Schema for updating company repository entry."""
    name: Optional[str] = None
    contract_number: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    status: Optional[str] = None
