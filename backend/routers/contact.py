"""
Contact form API endpoint.
Sends contact form submissions via email using Microsoft SMTP.
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from client.email_service import EmailService

router = APIRouter(prefix="/api/contact", tags=["contact"])

# Initialize email service
email_service = EmailService()


class ContactFormRequest(BaseModel):
    """Contact form submission request"""
    name: str = Field(..., min_length=1, max_length=100, description="Full name")
    email: EmailStr = Field(..., description="Email address")
    company: str = Field(default="", max_length=100, description="Company name (optional)")
    phone: str = Field(default="", max_length=50, description="Phone number (optional)")
    message: str = Field(..., min_length=10, max_length=5000, description="Message text")


@router.post("/send")
async def send_contact_form(request: ContactFormRequest):
    """
    Send contact form submission via email.

    This endpoint:
    1. Sends email to service@priceiq.org with Reply-To set to user's email
    2. Sends confirmation email to the user
    3. Uses existing Microsoft SMTP configuration (FREE)

    Returns:
        Success message
    """
    try:
        # Send email to support inbox with Reply-To header
        email_service.send_contact_form_email(
            from_name=request.name,
            from_email=request.email,
            from_company=request.company,
            from_phone=request.phone,
            message_text=request.message,
            to_email="service@priceiq.org"
        )

        # Send confirmation email to user
        email_service.send_contact_confirmation_email(
            to_email=request.email,
            to_name=request.name,
            original_message=request.message
        )

        return {
            "success": True,
            "message": "Your message has been sent successfully. We'll respond within 24 hours."
        }

    except Exception as e:
        print(f"Failed to send contact form: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send message. Please try again or email us directly at service@priceiq.org"
        )
