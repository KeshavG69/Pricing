"""Pydantic models for job description extraction."""

from typing import Optional
from pydantic import BaseModel, Field


class JobDescription(BaseModel):
    """Model for extracted job description fields."""

    labor_category: str = Field(
        description="Job title or labor category"
    )
    description: Optional[str] = Field(
        None,
        description="Full job description text including responsibilities, requirements, and qualifications. None if not specified."
    )
    experience: Optional[int] = Field(
        None,
        description="Years of experience required (integer). None if not specified."
    )
    location: Optional[str] = Field(
        None,
        description="Job location. None if not specified."
    )
    hours: Optional[int] = Field(
        None,
        description="Annual hours (e.g., 1920 for full-time). None if not specified. Legacy field - use hours_per_year for multi-year contracts."
    )
    hours_per_year: Optional[dict[str, int]] = Field(
        None,
        description='Hours worked per year in multi-year contract. Format: {"1": 1880, "2": 1880, "3": 0, "4": 1880, "5": 1880}. Year keys are strings. If not specified in document, will use hours field for all years. None if not specified.'
    )


class JobDescriptionList(BaseModel):
    """List of job descriptions extracted from a document."""

    job_descriptions: list[JobDescription] = Field(
        default_factory=list,
        description="All job descriptions found in the page/document"
    )
