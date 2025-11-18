"""Pydantic models for job description extraction."""

from typing import Optional
from pydantic import BaseModel, Field


class JobDescription(BaseModel):
    """Model for extracted job description fields."""

    labor_category: str = Field(
        description="Job title or labor category"
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
        description="Annual hours (e.g., 1920 for full-time). None if not specified."
    )


class JobDescriptionList(BaseModel):
    """List of job descriptions extracted from a document."""

    job_descriptions: list[JobDescription] = Field(
        default_factory=list,
        description="All job descriptions found in the page/document"
    )
